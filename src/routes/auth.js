const express = require('express');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const { generateToken } = require('../middleware/auth');
const db = require('../db');
const config = require('../config');
const EmbyClient = require('../api/emby');

const router = express.Router();
const emby = new EmbyClient(config.emby.url, config.emby.apiKey);

// 登录
router.post('/login', async (req, res) => {
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
router.post('/register', async (req, res) => {
  try {
    const { username, password, code: redemptionCode, inviteCode } = req.body;
    
    if (!username || !password || !redemptionCode) {
      return res.status(400).json({ error: '用户名、密码和续期码不能为空' });
    }
    
    if (!validator.isLength(username, { min: 2, max: 50 })) {
      return res.status(400).json({ error: '用户名长度需在 2-50 字符之间' });
    }
    
    if (!validator.isLength(password, { min: 6, max: 100 })) {
      return res.status(400).json({ error: '密码长度需在 6-100 字符之间' });
    }
    
    if (!validator.isAlphanumeric(username.replace(/_/g, ''))) {
      return res.status(400).json({ error: '用户名只能包含字母、数字和下划线' });
    }
    
    const validCode = await db.getValidRedemptionCode(redemptionCode);
    if (!validCode) {
      return res.status(400).json({ error: '续期码无效或已过期' });
    }
    
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    
    let inviterId = null;
    let invitationData = null;
    if (inviteCode) {
      invitationData = await db.getValidInvitationCode(inviteCode);
      if (invitationData) inviterId = invitationData.user_id;
    }
    
    let embyUser = null;
    try {
      embyUser = await emby.createUser(username);
      if (password) await emby.setPassword(embyUser.Id, password);
    } catch (e) {
      console.error('[Register] Emby user creation failed:', e.message);
    }
    
    const expiresAt = new Date(Date.now() + validCode.days * 24 * 60 * 60 * 1000);
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    
    const user = await db.createUser({
      username,
      embyId: embyUser?.Id,
      passwordHash,
      isAdmin: false,
      isActive: true,
      expiresAt,
      invitedBy: inviterId
    });
    
    await db.useRedemptionCode(validCode.id, user.id);
    await db.createRedemptionLog({
      userId: user.id,
      codeId: validCode.id,
      code: redemptionCode,
      daysAdded: validCode.days,
      oldExpiresAt: null,
      newExpiresAt: expiresAt
    });
    
    let coinReward = 0;
    if (inviterId && invitationData) {
      await db.useInvitationCode(invitationData.id);
      coinReward = Math.max(1, Math.floor(validCode.days / 30));
      if (coinReward > 0) {
        await db.addCoins(inviterId, coinReward, 'invite_reward', `邀请用户 ${username} 注册`, user.id);
      }
      await db.createInvitation({ inviterId, inviteeId: user.id, inviteCode, rewardDays: 0 });
    }
    
    await db.createLog({ userId: user.id, action: 'register', details: { inviteCode: inviteCode || null }, ipAddress: req.ip });
    
    const token = generateToken({ id: user.id, username: user.username, isAdmin: false });
    
    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, isAdmin: false, embyId: user.emby_id },
      inviteReward: inviterId ? { inviterId, coinReward } : null
    });
  } catch (error) {
    console.error('[Register] Error:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

module.exports = router;
