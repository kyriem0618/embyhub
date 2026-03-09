/**
 * EmbyHub - Web 管理面板 + Telegram Bot
 * MySQL 版本 - 完整功能
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const xss = require('xss');
const EmbyClient = require('./api/emby');
const { initDatabase } = require('./db');
const { authenticateToken, requireAdmin, generateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ============ 安全中间件 ============
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 禁用静态文件缓存（开发环境）
app.use(express.static(path.join(__dirname, '../web'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// ============ 输入清理 ============
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = xss(req.body[key].trim());
      }
    }
  }
  next();
};

app.use(sanitizeInput);

// ============ 初始化 ============
let db = null;
const emby = new EmbyClient(process.env.EMBY_URL || 'http://localhost:8096', process.env.EMBY_API_KEY || '');

async function initializeApp() {
  try {
    db = await initDatabase();
    console.log('[App] Database initialized');
    
    // 创建默认管理员
    const adminExists = await db.getUserByUsername('admin');
    if (!adminExists) {
      const passwordHash = await bcrypt.hash('admin123', 12);
      await db.createUser({
        username: 'admin',
        passwordHash,
        isAdmin: true,
        isActive: true
      });
      console.log('[App] Default admin created: admin / admin123');
    }
  } catch (error) {
    console.error('[App] Database init failed:', error.message);
    process.exit(1);
  }
}
initializeApp();

// 页面路由 ============
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../web/login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../web/dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../web/admin.html')));

// 强制重定向到带版本号的页面
app.get('/d', (req, res) => res.redirect('/dashboard?v=' + Date.now()));

// ============ 认证 API ============

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    
    if (!validator.isLength(username, { min: 2, max: 50 }) || !validator.isLength(password, { min: 1, max: 100 })) {
      return res.status(400).json({ error: '输入格式错误' });
    }
    
    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    if (!user.is_active) {
      return res.status(403).json({ error: '账号已被禁用' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash || '');
    if (!validPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    const token = generateToken({ id: user.id, username: user.username, isAdmin: user.is_admin });
    
    await db.createLog({
      userId: user.id,
      action: 'login',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.is_admin === 1,
        embyId: user.emby_id
      }
    });
  } catch (error) {
    console.error('[Login] Error:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, code: redemptionCode, inviteCode } = req.body;
    
    // 验证输入
    if (!username || !password || !redemptionCode) {
      return res.status(400).json({ error: '用户名、密码和续期码不能为空' });
    }
    
    if (!validator.isLength(username, { min: 2, max: 50 })) {
      return res.status(400).json({ error: '用户名长度需在2-50字符之间' });
    }
    
    if (!validator.isLength(password, { min: 6, max: 100 })) {
      return res.status(400).json({ error: '密码长度需在6-100字符之间' });
    }
    
    if (!validator.isAlphanumeric(username.replace(/_/g, ''))) {
      return res.status(400).json({ error: '用户名只能包含字母、数字和下划线' });
    }
    
    // 验证续期码
    const validCode = await db.getValidRedemptionCode(redemptionCode);
    if (!validCode) {
      return res.status(400).json({ error: '续期码无效或已过期' });
    }
    
    // 检查用户名
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
    const expiresAt = new Date(Date.now() + validCode.days * 24 * 60 * 60 * 1000);
    const passwordHash = await bcrypt.hash(password, 12);
    
    // 创建用户
    const user = await db.createUser({
      username,
      embyId: embyUser?.Id,
      passwordHash,
      isAdmin: false,
      isActive: true,
      expiresAt,
      invitedBy: inviterId
    });
    
    // 标记续期码已使用
    await db.useRedemptionCode(validCode.id, user.id);
    
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
      await db.useInvitationCode(invitationData.id);
      rewardDays = Math.floor(validCode.days * 0.05);
      
      if (rewardDays > 0) {
        const inviter = await db.getUserById(inviterId);
        if (inviter) {
          const inviterCurrentExpiry = inviter.expires_at && new Date(inviter.expires_at) > new Date()
            ? new Date(inviter.expires_at)
            : new Date();
          const inviterNewExpiry = new Date(inviterCurrentExpiry);
          inviterNewExpiry.setDate(inviterNewExpiry.getDate() + rewardDays);
          await db.updateUser(inviterId, { expiresAt: inviterNewExpiry });
        }
      }
      
      await db.createInvitation({
        inviterId,
        inviteeId: user.id,
        inviteCode,
        rewardDays
      });
    }
    
    await db.createLog({
      userId: user.id,
      action: 'register',
      details: { inviteCode: inviteCode || null },
      ipAddress: req.ip
    });
    
    const token = generateToken({ id: user.id, username: user.username, isAdmin: false });
    
    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, isAdmin: false, embyId: user.emby_id },
      rewardInfo: inviterId ? { inviterId, rewardDays } : null
    });
  } catch (error) {
    console.error('[Register] Error:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// ============ 用户 API ============

app.get('/api/user/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({
      id: user.id,
      username: user.username,
      embyId: user.emby_id,
      expiresAt: user.expires_at,
      isActive: user.is_active,
      isAdmin: user.is_admin,
      balance: user.balance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 修改密码
app.post('/api/user/change-password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请填写完整' });
    }
    
    if (!validator.isLength(newPassword, { min: 6, max: 100 })) {
      return res.status(400).json({ error: '密码长度需在6-100字符之间' });
    }
    
    const user = await db.getUserById(req.user.id);
    if (!user || !user.password_hash) {
      return res.status(400).json({ error: '无法验证原密码' });
    }
    
    const validPassword = await bcrypt.compare(oldPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: '原密码错误' });
    }
    
    if (user.emby_id) await emby.setPassword(user.emby_id, newPassword);
    
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.updateUser(req.user.id, { passwordHash });
    
    await db.createLog({
      userId: req.user.id,
      action: 'change_password',
      ipAddress: req.ip
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 续期
app.post('/api/user/redeem', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code || !validator.isLength(code, { min: 5, max: 64 })) {
      return res.status(400).json({ error: '续期码格式错误' });
    }
    
    const user = await db.getUserById(req.user.id);
    const validCode = await db.getValidRedemptionCode(code);
    
    if (!validCode) {
      return res.status(400).json({ error: '续期码无效或已过期' });
    }
    
    const currentDate = user.expires_at && new Date(user.expires_at) > new Date()
      ? new Date(user.expires_at)
      : new Date();
    const newExpiresAt = new Date(currentDate);
    newExpiresAt.setDate(newExpiresAt.getDate() + validCode.days);
    
    await db.updateUser(user.id, { expiresAt: newExpiresAt });
    await db.useRedemptionCode(validCode.id, user.id);
    
    await db.createRedemptionLog({
      userId: user.id,
      codeId: validCode.id,
      code,
      daysAdded: validCode.days,
      oldExpiresAt: user.expires_at,
      newExpiresAt
    });
    
    res.json({ success: true, newExpiresAt: newExpiresAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 签到 ============

app.post('/api/user/checkin', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 检查今日是否已签到
    const hasCheckedIn = await db.hasCheckedInToday(userId);
    if (hasCheckedIn) {
      return res.status(400).json({ error: '今日已签到' });
    }
    
    // 计算奖励（随机1-3天）
    const rewardDays = Math.floor(Math.random() * 3) + 1;
    
    // 创建签到记录
    const checkinId = await db.createCheckin(userId, rewardDays, req.ip);
    if (!checkinId) {
      return res.status(400).json({ error: '签到失败' });
    }
    
    // 更新用户有效期
    const user = await db.getUserById(userId);
    const currentExpiry = user.expires_at && new Date(user.expires_at) > new Date()
      ? new Date(user.expires_at)
      : new Date();
    const newExpiry = new Date(currentExpiry);
    newExpiry.setDate(newExpiry.getDate() + rewardDays);
    
    await db.updateUser(userId, { expiresAt: newExpiry });
    
    res.json({
      success: true,
      rewardDays,
      newExpiresAt: newExpiry.toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/checkin-status', authenticateToken, async (req, res) => {
  try {
    const hasCheckedIn = await db.hasCheckedInToday(req.user.id);
    const stats = await db.getUserCheckinStats(req.user.id);
    
    res.json({
      hasCheckedInToday: hasCheckedIn,
      totalCheckins: stats.total_checkins || 0,
      totalRewardDays: stats.total_reward_days || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 邀请码 ============

app.get('/api/user/invitation-codes', authenticateToken, async (req, res) => {
  try {
    const codes = await db.getUserInvitationCodes(req.user.id);
    res.json(codes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/user/invitation-codes', authenticateToken, async (req, res) => {
  try {
    const { maxUses = 0, expiresDays } = req.body;
    
    // 限制每个用户最多10个邀请码
    const existingCodes = await db.getUserInvitationCodes(req.user.id);
    if (existingCodes.length >= 10) {
      return res.status(400).json({ error: '最多只能创建10个邀请码' });
    }
    
    const code = 'INV-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    let expiresAt = null;
    if (expiresDays) {
      expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);
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

app.get('/api/user/invitation-stats', authenticateToken, async (req, res) => {
  try {
    const stats = await db.getUserInvitationStats(req.user.id);
    const invitations = await db.getUserInvitations(req.user.id);
    res.json({ ...stats, invitations });
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

// ============ 工单 ============

app.post('/api/user/tickets', authenticateToken, async (req, res) => {
  try {
    const { subject, message, priority } = req.body;
    
    if (!subject || !message) {
      return res.status(400).json({ error: '标题和内容不能为空' });
    }
    
    if (!validator.isLength(subject, { min: 2, max: 200 })) {
      return res.status(400).json({ error: '标题长度需在2-200字符之间' });
    }
    
    const ticketId = await db.createTicket({
      userId: req.user.id,
      subject,
      message,
      priority: priority || 'medium'
    });
    
    res.status(201).json({ success: true, ticketId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/tickets', authenticateToken, async (req, res) => {
  try {
    const tickets = await db.getUserTickets(req.user.id);
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/tickets/:id', authenticateToken, async (req, res) => {
  try {
    const ticket = await db.getTicketById(req.params.id);
    if (!ticket || ticket.user_id !== req.user.id) {
      return res.status(404).json({ error: '工单不存在' });
    }
    
    const replies = await db.getTicketReplies(req.params.id);
    res.json({ ...ticket, replies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/user/tickets/:id/reply', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || !validator.isLength(message, { min: 1, max: 5000 })) {
      return res.status(400).json({ error: '回复内容长度需在1-5000字符之间' });
    }
    
    const ticket = await db.getTicketById(req.params.id);
    if (!ticket || ticket.user_id !== req.user.id) {
      return res.status(404).json({ error: '工单不存在' });
    }
    
    await db.createTicketReply({
      ticketId: req.params.id,
      userId: req.user.id,
      message,
      isAdmin: false
    });
    
    if (ticket.status === 'closed') {
      await db.updateTicketStatus(req.params.id, 'pending');
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 观影记录 ============

app.get('/api/user/play-history', authenticateToken, async (req, res) => {
  try {
    const history = await db.getUserPlayHistory(req.user.id, 50);
    const stats = await db.getUserPlayStats(req.user.id);
    res.json({ history, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/user/sync-playback', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user || !user.emby_id) {
      return res.status(400).json({ error: '未绑定 Emby 账号' });
    }
    
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
          playedAt: item.UserData?.LastPlayedDate || new Date()
        });
      }
    }
    
    res.json({ success: true, count: items.Items?.length || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/redemption-logs', authenticateToken, async (req, res) => {
  try {
    const logs = await db.getRedemptionLogs(req.user.id, 50);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 管理员 API ============

app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [users, sessions, stats] = await Promise.all([
      db.getAllUsers(),
      emby.getSessions(),
      db.getStats()
    ]);
    
    res.json({
      totalUsers: stats.totalUsers,
      activeUsers: stats.activeUsers,
      expiredUsers: stats.expiredUsers,
      activeSessions: sessions.length,
      openTickets: stats.openTickets
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, days, isAdmin } = req.body;
    
    if (!username || !validator.isLength(username, { min: 2, max: 50 })) {
      return res.status(400).json({ error: '用户名格式错误' });
    }
    
    const embyUser = await emby.createUser(username);
    if (password) await emby.setPassword(embyUser.Id, password);
    
    const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    
    const user = await db.createUser({
      username,
      embyId: embyUser.Id,
      passwordHash,
      isAdmin: isAdmin || false,
      isActive: true,
      expiresAt
    });
    
    await db.createLog({
      userId: req.user.id,
      action: 'admin_create_user',
      details: { targetUser: username },
      ipAddress: req.ip
    });
    
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (user && user.emby_id) await emby.deleteUser(user.emby_id);
    await db.deleteUser(req.params.id);
    
    await db.createLog({
      userId: req.user.id,
      action: 'admin_delete_user',
      details: { targetUser: user?.username },
      ipAddress: req.ip
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword || !validator.isLength(newPassword, { min: 6, max: 100 })) {
      return res.status(400).json({ error: '密码长度需在6-100字符之间' });
    }
    
    const user = await db.getUserById(req.params.id);
    if (!user || !user.emby_id) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    await emby.setPassword(user.emby_id, newPassword);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.updateUser(req.params.id, { passwordHash });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

// 续期码管理
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
    const { days = 30, count = 1, price = 0 } = req.body;
    const codes = [];
    
    for (let i = 0; i < Math.min(count, 100); i++) {
      const code = 'EMBY-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const created = await db.createRedemptionCode({
        code,
        days,
        price,
        expiresAt,
        isUsed: false
      });
      codes.push(created);
    }
    
    res.json({ success: true, codes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 邀请码管理
app.get('/api/admin/invitation-codes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const codes = await db.getAllInvitationCodes();
    res.json(codes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/invitation-codes/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;
    const code = await db.updateInvitationCode(req.params.id, { isActive });
    res.json(code);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/invitation-codes/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.deleteInvitationCode(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 续期日志
app.get('/api/admin/redemption-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const logs = await db.getRedemptionLogs(null, 100);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 工单管理
app.get('/api/admin/tickets', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const tickets = await db.getAllTickets(status, 100);
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/tickets/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await db.updateTicketStatus(req.params.id, status);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/tickets/:id/reply', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: '回复内容不能为空' });
    }
    
    await db.createTicketReply({
      ticketId: req.params.id,
      userId: req.user.id,
      message,
      isAdmin: true
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 会话管理
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

// Emby 测试
app.get('/api/emby/test', async (req, res) => {
  try {
    const info = await emby.getSystemInfo();
    res.json({ success: true, serverName: info.ServerName, version: info.Version });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// 启动
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🎬 EmbyHub v1.2.0 Started               ║
║   📍 Port: ${PORT}                             ║
║   🔐 Auth: Enabled                        ║
║   🗄️  DB: MySQL                           ║
╚═══════════════════════════════════════════╝
  `);
});

module.exports = app;