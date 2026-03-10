const express = require('express');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');
const config = require('../config');
const EmbyClient = require('../api/emby');

const router = express.Router();
const emby = new EmbyClient(config.emby.url, config.emby.apiKey);

// 获取当前用户信息
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const levelInfo = await db.getUserLevel(req.user.id);
    res.json({
      id: user.id, username: user.username, embyId: user.emby_id,
      expiresAt: user.expires_at, isActive: user.is_active, isAdmin: user.is_admin,
      balance: user.balance, coins: user.coins || 0,
      level: levelInfo.user_level || 1, totalInvites: levelInfo.total_invites || 0,
      totalCheckins: levelInfo.total_checkins || 0
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 修改密码
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写完整' });
    if (!validator.isLength(newPassword, { min: 6, max: 100 })) return res.status(400).json({ error: '密码长度需在 6-100 字符之间' });
    const user = await db.getUserById(req.user.id);
    if (!user || !user.password_hash) return res.status(400).json({ error: '无法验证原密码' });
    const validPassword = await bcrypt.compare(oldPassword, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: '原密码错误' });
    if (user.emby_id) await emby.setPassword(user.emby_id, newPassword);
    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    await db.updateUser(req.user.id, { passwordHash });
    await db.createLog({ userId: req.user.id, action: 'change_password', ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 续期
router.post('/redeem', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || !validator.isLength(code, { min: 5, max: 64 })) return res.status(400).json({ error: '续期码格式错误' });
    const user = await db.getUserById(req.user.id);
    const validCode = await db.getValidRedemptionCode(code);
    if (!validCode) return res.status(400).json({ error: '续期码无效或已过期' });
    const currentDate = user.expires_at && new Date(user.expires_at) > new Date() ? new Date(user.expires_at) : new Date();
    const newExpiresAt = new Date(currentDate);
    newExpiresAt.setDate(newExpiresAt.getDate() + validCode.days);
    await db.updateUser(user.id, { expiresAt: newExpiresAt });
    await db.useRedemptionCode(validCode.id, user.id);
    await db.createRedemptionLog({ userId: user.id, codeId: validCode.id, code, daysAdded: validCode.days, oldExpiresAt: user.expires_at, newExpiresAt });
    res.json({ success: true, newExpiresAt: newExpiresAt.toISOString() });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 签到
router.post('/checkin', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const hasCheckedIn = await db.hasCheckedInToday(userId);
    if (hasCheckedIn) return res.status(400).json({ error: '今日已签到' });
    const coinReward = Math.floor(Math.random() * 21) + 10;
    const checkinId = await db.createCheckin(userId, coinReward, req.ip);
    if (!checkinId) return res.status(400).json({ error: '签到失败' });
    const newBalance = await db.addCoins(userId, coinReward, 'checkin', '每日签到奖励', checkinId);
    const newLevel = await db.updateUserLevel(userId);
    res.json({ success: true, coinReward, newBalance, newLevel });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/checkin-status', authenticateToken, async (req, res) => {
  try {
    const hasCheckedIn = await db.hasCheckedInToday(req.user.id);
    const stats = await db.getUserCheckinStats(req.user.id);
    res.json({ hasCheckedInToday: hasCheckedIn, totalCheckins: stats.total_checkins || 0, totalRewardDays: stats.total_reward_days || 0 });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 邀请码
router.get('/invitation-codes', authenticateToken, async (req, res) => {
  try { const codes = await db.getUserInvitationCodes(req.user.id); res.json(codes); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/invitation-codes', authenticateToken, async (req, res) => {
  try {
    const { maxUses = 0, expiresDays } = req.body;
    const existingCodes = await db.getUserInvitationCodes(req.user.id);
    if (existingCodes.length >= 10) return res.status(400).json({ error: '最多只能创建 10 个邀请码' });
    const code = 'INV-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    let expiresAt = null;
    if (expiresDays) expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);
    const invitationCode = await db.createInvitationCode({ code, userId: req.user.id, maxUses, expiresAt });
    res.status(201).json(invitationCode);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/invitation-stats', authenticateToken, async (req, res) => {
  try {
    const stats = await db.getUserInvitationStats(req.user.id);
    const invitations = await db.getUserInvitations(req.user.id);
    res.json({ ...stats, invitations });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 商城
router.get('/shop/products', authenticateToken, async (req, res) => {
  try { const products = await db.getActiveProducts(); res.json(products); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/shop/purchase/:productId', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.id;
    const product = await db.getProductById(productId);
    if (!product || !product.is_active) return res.status(400).json({ error: '商品不存在或已下架' });
    if (product.stock > 0 && product.stock < 1) return res.status(400).json({ error: '商品库存不足' });
    const user = await db.getUserById(userId);
    if (!user || (user.coins || 0) < product.price) return res.status(400).json({ error: '金币不足' });
    const newBalance = await db.deductCoins(userId, product.price, 'purchase', `购买：${product.name}`, productId);
    if (product.stock > 0) await db.decrementStock(productId);
    if (product.days_reward > 0) {
      const currentUser = await db.getUserById(userId);
      const currentExpiry = currentUser.expires_at && new Date(currentUser.expires_at) > new Date() ? new Date(currentUser.expires_at) : new Date();
      const newExpiry = new Date(currentExpiry);
      newExpiry.setDate(newExpiry.getDate() + product.days_reward);
      await db.updateUser(userId, { expiresAt: newExpiry });
    }
    await db.createPurchase({ userId, productId, productName: product.name, coinsSpent: product.price, daysRewarded: product.days_reward || 0 });
    res.json({ success: true, newBalance, daysRewarded: product.days_reward || 0 });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/shop/purchases', authenticateToken, async (req, res) => {
  try { const purchases = await db.getUserPurchases(req.user.id, 50); res.json(purchases); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/coin-logs', authenticateToken, async (req, res) => {
  try { const logs = await db.getCoinLogs(req.user.id, 50); res.json(logs); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/redemption-logs', authenticateToken, async (req, res) => {
  try { const logs = await db.getRedemptionLogs(req.user.id, 50); res.json(logs); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// 工单
router.post('/tickets', authenticateToken, async (req, res) => {
  try {
    const { subject, message, priority } = req.body;
    if (!subject || !message) return res.status(400).json({ error: '标题和内容不能为空' });
    if (!validator.isLength(subject, { min: 2, max: 200 })) return res.status(400).json({ error: '标题长度需在 2-200 字符之间' });
    const ticketId = await db.createTicket({ userId: req.user.id, subject, message, priority: priority || 'medium' });
    res.status(201).json({ success: true, ticketId });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/tickets', authenticateToken, async (req, res) => {
  try { const tickets = await db.getUserTickets(req.user.id); res.json(tickets); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/tickets/:id', authenticateToken, async (req, res) => {
  try {
    const ticket = await db.getTicketById(req.params.id);
    if (!ticket || ticket.user_id !== req.user.id) return res.status(404).json({ error: '工单不存在' });
    const replies = await db.getTicketReplies(req.params.id);
    res.json({ ...ticket, replies });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/tickets/:id/reply', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !validator.isLength(message, { min: 1, max: 5000 })) return res.status(400).json({ error: '回复内容长度需在 1-5000 字符之间' });
    const ticket = await db.getTicketById(req.params.id);
    if (!ticket || ticket.user_id !== req.user.id) return res.status(404).json({ error: '工单不存在' });
    await db.createTicketReply({ ticketId: req.params.id, userId: req.user.id, message, isAdmin: false });
    if (ticket.status === 'closed') await db.updateTicketStatus(req.params.id, 'pending');
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 观影记录
router.get('/play-history', authenticateToken, async (req, res) => {
  try {
    const history = await db.getUserPlayHistory(req.user.id, 50);
    const stats = await db.getUserPlayStats(req.user.id);
    res.json({ history, stats });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/sync-playback', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user || !user.emby_id) return res.status(400).json({ error: '未绑定 Emby 账号' });
    const items = await emby.getItems({ UserId: user.emby_id, Filters: 'IsPlayed', Limit: 50, Recursive: true, IncludeItemTypes: 'Movie,Episode,Series' });
    if (items.Items) {
      for (const item of items.Items) {
        await db.createPlayHistory({ userId: req.user.id, embyItemId: item.Id, itemName: item.Name, itemType: item.Type, playDuration: item.UserData?.PlayDuration || 0, playedAt: item.UserData?.LastPlayedDate || new Date() });
      }
    }
    res.json({ success: true, count: items.Items?.length || 0 });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
