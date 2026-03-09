/**
 * EmbyHub - Web 管理面板 + Telegram Bot
 * 带认证系统和完整用户管理
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const EmbyClient = require('./api/emby');
const { initDatabase } = require('./db');
const { authenticateToken, requireAdmin, generateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../web')));

let db = null;
const emby = new EmbyClient(process.env.EMBY_URL || 'http://localhost:8096', process.env.EMBY_API_KEY || '');

async function initializeApp() {
  try {
    db = await initDatabase();
    console.log('[App] Database initialized');
  } catch (error) {
    console.error('[App] Database init failed:', error.message);
  }
}
initializeApp();

// 页面路由
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../web/login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../web/dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../web/admin.html')));
app.get('/users', (req, res) => res.sendFile(path.join(__dirname, '../web/users.html')));
app.get('/sessions', (req, res) => res.sendFile(path.join(__dirname, '../web/sessions.html')));

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    
    let user = await db.getUserByUsername(username);
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });
    
    const validPassword = await bcrypt.compare(password, user.password_hash || '');
    if (!validPassword) return res.status(401).json({ error: '用户名或密码错误' });
    
    const token = generateToken({ id: user.id, username: user.username, isAdmin: user.is_admin, embyId: user.emby_id });
    res.json({ success: true, token, user: { id: user.id, username: user.username, isAdmin: user.is_admin === 1, embyId: user.emby_id } });
  } catch (error) {
    res.status(500).json({ error: '登录失败：' + error.message });
  }
});

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, code: redemptionCode, inviteCode } = req.body;
    
    if (!username || !password || !redemptionCode) {
      return res.status(400).json({ error: '用户名、密码和续期码不能为空' });
    }
    
    // 验证续期码
    const validCode = await db.getValidRedemptionCode(redemptionCode);
    if (!validCode || validCode.is_used || new Date(validCode.expires_at) < new Date()) {
      return res.status(400).json({ error: '续期码无效或已过期' });
    }
    
    // 检查用户名是否已存在
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    
    // 处理邀请码
    let inviterId = null;
    let invitationData = null;
    if (inviteCode) {
      invitationData = await db.getValidInvitationCode(inviteCode);
      if (invitationData) {
        inviterId = invitationData.user_id;
      }
    }
    
    // 创建 Emby 用户
    let embyUser = null;
    try {
      embyUser = await emby.createUser(username);
      if (password) await emby.setPassword(embyUser.Id, password);
    } catch (e) {
      console.error('[Register] Emby user creation failed:', e.message);
    }
    
    // 计算过期时间
    const expiresAt = new Date(Date.now() + validCode.days * 24 * 60 * 60 * 1000).toISOString();
    const passwordHash = await bcrypt.hash(password, 10);
    
    // 创建用户
    const user = await db.createUserWithInviter({
      username,
      embyId: embyUser?.Id,
      passwordHash,
      isAdmin: false,
      isActive: true,
      expiresAt,
      invitedBy: inviterId
    });
    
    // 标记续期码已使用
    await db.useRedemptionCode(validCode.id);
    
    // 记录续期日志
    await db.createRedemptionLog({
      userId: user.id,
      codeId: validCode.id,
      code: redemptionCode,
      daysAdded: validCode.days,
      oldExpiresAt: null,
      newExpiresAt: expiresAt
    });
    
    // 处理邀请奖励
    let rewardDays = 0;
    if (inviterId && invitationData) {
      // 使用邀请码
      await db.useInvitationCode(invitationData.id);
      
      // 计算奖励天数（被邀请人获得有效期的5%）
      rewardDays = Math.floor(validCode.days * 0.05);
      
      if (rewardDays > 0) {
        // 获取邀请人信息
        const inviter = await db.getUserById(inviterId);
        if (inviter) {
          // 计算新的过期时间
          const inviterCurrentExpiry = inviter.expires_at && new Date(inviter.expires_at) > new Date() 
            ? new Date(inviter.expires_at) 
            : new Date();
          const inviterNewExpiry = new Date(inviterCurrentExpiry);
          inviterNewExpiry.setDate(inviterNewExpiry.getDate() + rewardDays);
          
          // 更新邀请人过期时间
          await db.updateUser(inviterId, { expires_at: inviterNewExpiry.toISOString() });
        }
      }
      
      // 记录邀请
      await db.createInvitation({
        inviterId,
        inviteeId: user.id,
        inviteCode,
        rewardDays
      });
    }
    
    const token = generateToken({ id: user.id, username: user.username, isAdmin: false, embyId: user.emby_id });
    
    res.json({ 
      success: true, 
      token, 
      user: { id: user.id, username: user.username, isAdmin: false, embyId: user.emby_id },
      rewardInfo: inviterId ? { inviterId, rewardDays } : null
    });
  } catch (error) {
    console.error('[Register] Error:', error);
    res.status(500).json({ error: '注册失败：' + error.message });
  }
});

// 创建用户（管理员）
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, days, isAdmin } = req.body;
    if (!username) return res.status(400).json({ error: '用户名不能为空' });
    
    const embyUser = await emby.createUser(username);
    if (password) await emby.setPassword(embyUser.Id, password);
    
    const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    
    const user = await db.createUser({ username, embyId: embyUser.Id, passwordHash, isAdmin: isAdmin || false, isActive: true, expiresAt });
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取用户列表（管理员）
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 重置密码（管理员）
app.post('/api/admin/users/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const user = await db.getUserById(req.params.id);
    if (!user || !user.emby_id) return res.status(404).json({ error: '用户不存在' });
    
    await emby.setPassword(user.emby_id, newPassword);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.updateUser(req.params.id, { passwordHash });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 切换用户状态
app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { expiresAt, isActive, isAdmin } = req.body;
    const updates = {};
    if (expiresAt !== undefined) updates.expiresAt = expiresAt;
    if (isActive !== undefined) updates.isActive = isActive;
    if (isAdmin !== undefined) updates.isAdmin = isAdmin;
    
    const user = await db.updateUser(req.params.id, updates);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除用户
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (user && user.emby_id) await emby.deleteUser(user.emby_id);
    await db.deleteUser(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 续期码
app.get('/api/admin/codes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const codes = await db.getAllRedemptionCodes();
    res.json(codes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/codes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { days = 30, count = 1 } = req.body;
    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = 'EMBY-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const created = await db.createRedemptionCode({ code, days, expiresAt, isUsed: false });
      codes.push(created);
    }
    res.json({ success: true, codes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 统计
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [users, sessions, info] = await Promise.all([db.getAllUsers(), emby.getSessions(), emby.getSystemInfo()]);
    const activeUsers = users.filter(u => u.is_active).length;
    const expiredUsers = users.filter(u => u.expires_at && new Date(u.expires_at) < new Date()).length;
    res.json({ totalUsers: users.length, activeUsers, expiredUsers, activeSessions: sessions.length, serverName: info.ServerName, version: info.Version });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 用户自己的信息
app.get('/api/user/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ id: user.id, username: user.username, embyId: user.emby_id, expiresAt: user.expires_at, isActive: user.is_active, isAdmin: user.is_admin });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 修改密码
app.post('/api/user/change-password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await db.getUserById(req.user.id);
    if (!user || !user.password_hash) return res.status(400).json({ error: '无法验证原密码' });
    
    const validPassword = await bcrypt.compare(oldPassword, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: '原密码错误' });
    
    if (user.emby_id) await emby.setPassword(user.emby_id, newPassword);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.updateUser(req.user.id, { passwordHash });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 续期
app.post('/api/user/redeem', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    const user = await db.getUserById(req.user.id);
    const validCode = await db.getValidRedemptionCode(code);
    if (!validCode || validCode.is_used || new Date(validCode.expires_at) < new Date()) return res.status(400).json({ error: '续期码无效或已过期' });
    
    const currentDate = user.expires_at && new Date(user.expires_at) > new Date() ? new Date(user.expires_at) : new Date();
    const newExpiresAt = new Date(currentDate);
    newExpiresAt.setDate(newExpiresAt.getDate() + validCode.days);
    
    await db.updateUser(user.id, { expires_at: newExpiresAt.toISOString() });
    await db.useRedemptionCode(validCode.id);
    res.json({ success: true, newExpiresAt: newExpiresAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 会话
app.get('/api/sessions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sessions = await emby.getSessions();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions/:id/stop', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await emby.stopSession(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 搜索用户
app.get('/api/admin/users/search', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const users = await db.searchUsers(q);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取续期日志
app.get('/api/admin/redemption-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const logs = await db.getRedemptionLogs(null, 100);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取用户观影记录
app.get('/api/user/play-history', authenticateToken, async (req, res) => {
  try {
    const history = await db.getUserPlayHistory(req.user.id, 50);
    const stats = await db.getUserPlayStats(req.user.id);
    res.json({ history, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 用户自己的续期日志
app.get('/api/user/redemption-logs', authenticateToken, async (req, res) => {
  try {
    const logs = await db.getRedemptionLogs(req.user.id, 50);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 同步观影记录（从 Emby）
app.post('/api/user/sync-playback', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user || !user.emby_id) return res.status(400).json({ error: '未绑定 Emby 账号' });
    
    // 从 Emby 获取最近播放记录
    const items = await emby.getItems({ 
      UserId: user.emby_id, 
      Filters: 'IsPlayed',
      Limit: 50,
      Recursive: true,
      IncludeItemTypes: 'Movie,Episode,Series'
    });
    
    if (items.Items) {
      for (const item of items.Items) {
        await db.createPlayHistory({
          userId: req.user.id,
          embyItemId: item.Id,
          itemName: item.Name,
          itemType: item.Type,
          playDuration: item.UserData?.PlayDuration || 0,
          playedAt: item.UserData?.LastPlayedDate || new Date().toISOString()
        });
      }
    }
    
    res.json({ success: true, count: items.Items?.length || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Emby 测试
app.get('/api/emby/test', async (req, res) => {
  try {
    const info = await emby.getSystemInfo();
    res.json({ success: true, serverName: info.ServerName, version: info.Version });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ============ 邀请码 API ============

// 获取用户的邀请码
app.get('/api/user/invitation-codes', authenticateToken, async (req, res) => {
  try {
    const codes = await db.getUserInvitationCodes(req.user.id);
    res.json(codes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建邀请码
app.post('/api/user/invitation-codes', authenticateToken, async (req, res) => {
  try {
    const { maxUses = 0, expiresDays } = req.body;
    
    // 生成邀请码
    const code = 'INV-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
    
    let expiresAt = null;
    if (expiresDays) {
      expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();
    }
    
    const invitationCode = await db.createInvitationCode({
      code,
      userId: req.user.id,
      maxUses,
      expiresAt
    });
    
    res.status(201).json(invitationCode);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取用户邀请统计
app.get('/api/user/invitation-stats', authenticateToken, async (req, res) => {
  try {
    const stats = await db.getUserInvitationStats(req.user.id);
    const invitations = await db.getUserInvitations(req.user.id);
    res.json({ ...stats, invitations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 管理员：获取所有邀请码
app.get('/api/admin/invitation-codes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const codes = await db.getAllInvitationCodes();
    res.json(codes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 管理员：禁用邀请码
app.put('/api/admin/invitation-codes/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;
    const code = await db.updateInvitationCode(req.params.id, { isActive });
    res.json(code);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 管理员：删除邀请码
app.delete('/api/admin/invitation-codes/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.deleteInvitationCode(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 验证邀请码（公开）
app.post('/api/validate-invite-code', async (req, res) => {
  try {
    const { code } = req.body;
    const validCode = await db.getValidInvitationCode(code);
    
    if (validCode) {
      res.json({ 
        valid: true, 
        owner: validCode.owner_username,
        usesLeft: validCode.max_uses > 0 ? validCode.max_uses - validCode.used_count : '无限'
      });
    } else {
      res.json({ valid: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🎬 EmbyHub Web Server Started           ║
║   📍 Port: ${PORT}                             ║
║   🔐 Auth: Enabled                        ║
╚═══════════════════════════════════════════╝
  `);
});

module.exports = app;
