const express = require('express');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const db = require('../db');
const config = require('../config');
const EmbyClient = require('../api/emby');

const router = express.Router();
const emby = new EmbyClient(config.emby.url, config.emby.apiKey);

// 统计
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [users, sessions, stats] = await Promise.all([db.getAllUsers(), emby.getSessions(), db.getStats()]);
    res.json({ totalUsers: stats.totalUsers, activeUsers: stats.activeUsers, expiredUsers: stats.expiredUsers, activeSessions: sessions.length, openTickets: stats.openTickets });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 用户管理
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try { const users = await db.getAllUsers(); res.json(users); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, days, isAdmin } = req.body;
    if (!username || !validator.isLength(username, { min: 2, max: 50 })) return res.status(400).json({ error: '用户名格式错误' });
    const embyUser = await emby.createUser(username);
    if (password) await emby.setPassword(embyUser.Id, password);
    const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
    const passwordHash = password ? await bcrypt.hash(password, config.bcryptRounds) : null;
    const user = await db.createUser({ username, embyId: embyUser.Id, passwordHash, isAdmin: isAdmin || false, isActive: true, expiresAt });
    await db.createLog({ userId: req.user.id, action: 'admin_create_user', details: { targetUser: username }, ipAddress: req.ip });
    res.status(201).json(user);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { expiresAt, isActive, isAdmin } = req.body;
    const updates = {};
    if (expiresAt !== undefined) updates.expiresAt = expiresAt;
    if (isActive !== undefined) updates.isActive = isActive;
    if (isAdmin !== undefined) updates.isAdmin = isAdmin;
    const user = await db.updateUser(req.params.id, updates);
    res.json(user);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (user && user.emby_id) await emby.deleteUser(user.emby_id);
    await db.deleteUser(req.params.id);
    await db.createLog({ userId: req.user.id, action: 'admin_delete_user', details: { targetUser: user?.username }, ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/users/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || !validator.isLength(newPassword, { min: 6, max: 100 })) return res.status(400).json({ error: '密码长度需在 6-100 字符之间' });
    const user = await db.getUserById(req.params.id);
    if (!user || !user.emby_id) return res.status(404).json({ error: '用户不存在' });
    await emby.setPassword(user.emby_id, newPassword);
    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    await db.updateUser(req.params.id, { passwordHash });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/users/search', authenticateToken, requireAdmin, async (req, res) => {
  try { const { q } = req.query; if (!q) return res.json([]); const users = await db.searchUsers(q); res.json(users); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/users/:id/coins', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount || typeof amount !== 'number') return res.status(400).json({ error: '无效的数量' });
    let newBalance;
    if (amount > 0) newBalance = await db.addCoins(req.params.id, amount, 'admin_grant', description || '管理员发放');
    else newBalance = await db.deductCoins(req.params.id, Math.abs(amount), 'admin_deduct', description || '管理员扣除');
    res.json({ success: true, newBalance });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 续期码管理
router.get('/codes', authenticateToken, requireAdmin, async (req, res) => {
  try { const codes = await db.getAllRedemptionCodes(); res.json(codes); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/codes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { days = 30, count = 1, price = 0 } = req.body;
    const codes = [];
    for (let i = 0; i < Math.min(count, 100); i++) {
      const code = 'EMBY-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const created = await db.createRedemptionCode({ code, days, price, expiresAt, isUsed: false });
      codes.push(created);
    }
    res.json({ success: true, codes });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 邀请码管理
router.get('/invitation-codes', authenticateToken, requireAdmin, async (req, res) => {
  try { const codes = await db.getAllInvitationCodes(); res.json(codes); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/invitation-codes/:id', authenticateToken, requireAdmin, async (req, res) => {
  try { const { isActive } = req.body; const code = await db.updateInvitationCode(req.params.id, { isActive }); res.json(code); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/invitation-codes/:id', authenticateToken, requireAdmin, async (req, res) => {
  try { await db.deleteInvitationCode(req.params.id); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/redemption-logs', authenticateToken, requireAdmin, async (req, res) => {
  try { const logs = await db.getRedemptionLogs(null, 100); res.json(logs); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// 工单管理
router.get('/tickets', authenticateToken, requireAdmin, async (req, res) => {
  try { const { status } = req.query; const tickets = await db.getAllTickets(status, 100); res.json(tickets); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/tickets/:id', authenticateToken, requireAdmin, async (req, res) => {
  try { const { status } = req.body; await db.updateTicketStatus(req.params.id, status); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/tickets/:id/reply', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: '回复内容不能为空' });
    await db.createTicketReply({ ticketId: req.params.id, userId: req.user.id, message, isAdmin: true });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 会话管理
router.get('/sessions', authenticateToken, requireAdmin, async (req, res) => {
  try { const sessions = await emby.getSessions(); res.json(sessions); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/sessions/:id/stop', authenticateToken, requireAdmin, async (req, res) => {
  try { await emby.stopSession(req.params.id); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// 商品管理
router.get('/products', authenticateToken, requireAdmin, async (req, res) => {
  try { const products = await db.getAllProducts(); res.json(products); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/products', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, stock, category, icon, daysReward, isActive, sortOrder, productType, extraData } = req.body;
    if (!name || !validator.isLength(name, { min: 1, max: 255 })) return res.status(400).json({ error: '商品名称格式错误' });
    if (price === undefined || price < 0) return res.status(400).json({ error: '价格必须 >= 0' });
    const product = await db.createProduct({ name, description, price, stock: stock ?? -1, category: productType || category || 'default', icon: icon || null, daysReward: daysReward || 0, isActive: isActive !== false, sortOrder: sortOrder || 0 });
    res.status(201).json(product);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, stock, category, icon, daysReward, isActive, sortOrder } = req.body;
    const product = await db.updateProduct(req.params.id, { name, description, price, stock, category, icon, daysReward, isActive, sortOrder });
    res.json(product);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  try { await db.deleteProduct(req.params.id); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/purchases', authenticateToken, requireAdmin, async (req, res) => {
  try { const purchases = await db.getAllPurchases(100); res.json(purchases); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
