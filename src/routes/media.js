/**
 * EmbyHub Pro - 媒体加速 API 路由
 */

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');
const { MediaAccelerator } = require('../media/accelerator');
const { CookieEncryptor } = require('../utils/cookie_encrypt');

const router = express.Router();

// 初始化加速器
const accelerator = new MediaAccelerator(db, {
  cookie_encrypt_key: process.env.COOKIE_ENCRYPT_KEY || 'embyhub-secret-key-change-me',
  source_drive_cookie: process.env.SOURCE_DRIVE_COOKIE,
});

/**
 * 获取播放加速 URL
 * POST /api/media/play
 */
router.post('/play', authenticateToken, async (req, res) => {
  try {
    const { file_sha1, file_name } = req.body;
    
    if (!file_sha1) {
      return res.status(400).json({ error: '缺少 file_sha1 参数' });
    }

    // 获取加速播放 URL
    const result = await accelerator.get_play_url(req.user.id, file_sha1, file_name);

    if (!result.url) {
      return res.status(404).json({ error: '无法获取播放链接' });
    }

    res.json({
      success: true,
      url: result.url,
      accel_level: result.accel_level,
      response_time: result.response_time,
      source: result.source,
    });
  } catch (error) {
    console.error('[Media API] Play error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取加速统计
 * GET /api/media/stats
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.query;
    const targetUserId = user_id || req.user.id;

    const stats = await accelerator.getStats(targetUserId);

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[Media API] Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 保存用户网盘 Cookie
 * POST /api/media/cookie
 */
router.post('/cookie', authenticateToken, async (req, res) => {
  try {
    const { drive_type, cookie } = req.body;

    if (!cookie) {
      return res.status(400).json({ error: '缺少 cookie 参数' });
    }

    // 加密保存
    await accelerator.saveUserCookie(req.user.id, cookie, drive_type || '115');

    res.json({
      success: true,
      message: '凭证已加密保存',
    });
  } catch (error) {
    console.error('[Media API] Cookie save error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 检查用户是否有网盘 Cookie
 * GET /api/media/cookie
 */
router.get('/cookie', authenticateToken, async (req, res) => {
  try {
    const row = await db.query(`
      SELECT id, drive_type, updated_at 
      FROM user_drive_cookies 
      WHERE user_id = ?
    `, [req.user.id]);

    res.json({
      success: true,
      has_cookie: !!row && row.length > 0,
      drive_type: row?.[0]?.drive_type,
      updated_at: row?.[0]?.updated_at,
    });
  } catch (error) {
    console.error('[Media API] Cookie check error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除用户网盘 Cookie
 * DELETE /api/media/cookie
 */
router.delete('/cookie', authenticateToken, async (req, res) => {
  try {
    await db.query(`
      DELETE FROM user_drive_cookies 
      WHERE user_id = ?
    `, [req.user.id]);

    res.json({
      success: true,
      message: '凭证已删除',
    });
  } catch (error) {
    console.error('[Media API] Cookie delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取播放记录
 * GET /api/media/records
 */
router.get('/records', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const records = await db.query(`
      SELECT file_sha1, file_name, play_count, last_played
      FROM play_records
      WHERE user_id = ?
      ORDER BY last_played DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, parseInt(limit), parseInt(offset)]);

    const total = await db.query(`
      SELECT COUNT(*) as count
      FROM play_records
      WHERE user_id = ?
    `, [req.user.id]);

    res.json({
      success: true,
      records: records || [],
      total: total?.[0]?.count || 0,
    });
  } catch (error) {
    console.error('[Media API] Records error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
