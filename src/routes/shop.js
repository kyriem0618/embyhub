const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// 获取商品列表（公开）
router.get('/products', async (req, res) => {
  try { const products = await db.getActiveProducts(); res.json(products); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// 排行榜
router.get('/leaderboard', authenticateToken, async (req, res) => {
  try {
    const { type = 'coins' } = req.query;
    let orderBy = 'coins DESC';
    if (type === 'level') orderBy = 'user_level DESC, total_checkins DESC, total_invites DESC';
    else if (type === 'checkins') orderBy = 'total_checkins DESC';
    else if (type === 'invites') orderBy = 'total_invites DESC';
    const [rows] = await db.client.execute(`SELECT id, username, coins, user_level, total_checkins, total_invites FROM users WHERE is_active = 1 ORDER BY ${orderBy} LIMIT 50`);
    res.json(rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
