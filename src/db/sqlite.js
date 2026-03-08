/**
 * SQLite 数据库实现
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const DatabaseAdapter = require('./adapter');

class SQLiteAdapter extends DatabaseAdapter {
  constructor() {
    super();
    this.dbPath = process.env.DB_PATH || './data/embyhub.db';
  }

  async connect() {
    // 确保数据目录存在
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.client = new Database(this.dbPath);
    this.client.pragma('journal_mode = WAL');
    console.log(`[DB] SQLite connected: ${this.dbPath}`);
  }

  async initialize() {
    // 创建用户表
    this.client.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        emby_id TEXT UNIQUE,
        telegram_id TEXT UNIQUE,
        username TEXT NOT NULL UNIQUE,
        email TEXT,
        password_hash TEXT,
        is_admin INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建会话表
    this.client.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        emby_session_id TEXT UNIQUE,
        device_id TEXT,
        device_name TEXT,
        client_name TEXT,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 创建日志表
    this.client.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // 创建续期码表
    this.client.exec(`
      CREATE TABLE IF NOT EXISTS redemption_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        days INTEGER NOT NULL DEFAULT 30,
        expires_at DATETIME NOT NULL,
        is_used INTEGER DEFAULT 0,
        used_by INTEGER,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // 创建观影记录表
    this.client.exec(`
      CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        emby_item_id TEXT,
        item_name TEXT,
        item_type TEXT,
        play_duration INTEGER DEFAULT 0,
        played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 创建续期日志表
    this.client.exec(`
      CREATE TABLE IF NOT EXISTS redemption_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        code_id INTEGER,
        code TEXT,
        days_added INTEGER,
        old_expires_at DATETIME,
        new_expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (code_id) REFERENCES redemption_codes(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    this.client.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_emby ON users(emby_id);
      CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_codes_code ON redemption_codes(code);
      CREATE INDEX IF NOT EXISTS idx_codes_used ON redemption_codes(is_used);
    `);

    console.log('[DB] SQLite tables initialized');
  }

  // ============ 用户操作 ============
  
  createUser(userData) {
    const stmt = this.client.prepare(`
      INSERT INTO users (emby_id, telegram_id, username, email, password_hash, is_admin, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      userData.embyId,
      userData.telegramId,
      userData.username,
      userData.email,
      userData.passwordHash,
      userData.isAdmin ? 1 : 0,
      userData.isActive !== false ? 1 : 0
    );
    
    return this.getUserById(result.lastInsertRowid);
  }

  getUserById(id) {
    const stmt = this.client.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  }

  getUserByEmbyId(embyId) {
    const stmt = this.client.prepare('SELECT * FROM users WHERE emby_id = ?');
    return stmt.get(embyId);
  }

  getUserByTelegramId(telegramId) {
    const stmt = this.client.prepare('SELECT * FROM users WHERE telegram_id = ?');
    return stmt.get(telegramId);
  }

  updateUser(id, userData) {
    const fields = [];
    const values = [];
    
    if (userData.username !== undefined) {
      fields.push('username = ?');
      values.push(userData.username);
    }
    if (userData.email !== undefined) {
      fields.push('email = ?');
      values.push(userData.email);
    }
    if (userData.passwordHash !== undefined) {
      fields.push('password_hash = ?');
      values.push(userData.passwordHash);
    }
    if (userData.isAdmin !== undefined) {
      fields.push('is_admin = ?');
      values.push(userData.isAdmin ? 1 : 0);
    }
    if (userData.isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(userData.isActive ? 1 : 0);
    }
    
    if (fields.length === 0) return this.getUserById(id);
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    const stmt = this.client.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    
    return this.getUserById(id);
  }

  deleteUser(id) {
    const stmt = this.client.prepare('DELETE FROM users WHERE id = ?');
    return stmt.run(id);
  }

  getAllUsers() {
    const stmt = this.client.prepare('SELECT * FROM users ORDER BY created_at DESC');
    return stmt.all();
  }

  // ============ 会话操作 ============
  
  createSession(sessionData) {
    const stmt = this.client.prepare(`
      INSERT INTO sessions (user_id, emby_session_id, device_id, device_name, client_name, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      sessionData.userId,
      sessionData.embySessionId,
      sessionData.deviceId,
      sessionData.deviceName,
      sessionData.clientName,
      sessionData.isActive !== false ? 1 : 0
    );
    
    return this.getSessionById(result.lastInsertRowid);
  }

  getSessionById(id) {
    const stmt = this.client.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(id);
  }

  updateSession(id, sessionData) {
    const fields = [];
    const values = [];
    
    if (sessionData.isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(sessionData.isActive ? 1 : 0);
    }
    if (sessionData.lastActivity !== undefined) {
      fields.push('last_activity = ?');
      values.push(sessionData.lastActivity);
    }
    
    if (fields.length === 0) return this.getSessionById(id);
    
    values.push(id);
    
    const stmt = this.client.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    
    return this.getSessionById(id);
  }

  deleteSession(id) {
    const stmt = this.client.prepare('DELETE FROM sessions WHERE id = ?');
    return stmt.run(id);
  }

  getActiveSessions() {
    const stmt = this.client.prepare(`
      SELECT s.*, u.username, u.telegram_id
      FROM sessions s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.is_active = 1
      ORDER BY s.last_activity DESC
    `);
    return stmt.all();
  }

  // ============ 日志操作 ============
  
  createLog(logData) {
    const stmt = this.client.prepare(`
      INSERT INTO logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      logData.userId,
      logData.action,
      logData.details,
      logData.ipAddress
    );
    
    return result.lastInsertRowid;
  }

  getLogs(userId, limit = 50) {
    const stmt = this.client.prepare(`
      SELECT * FROM logs 
      WHERE user_id = ? OR user_id IS NULL
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    return stmt.all(userId, limit);
  }

  clearOldLogs(days = 30) {
    const stmt = this.client.prepare(`
      DELETE FROM logs 
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `);
    return stmt.run(days);
  }

  // ============ 续期码操作 ============
  
  createRedemptionCode(codeData) {
    const stmt = this.client.prepare(`
      INSERT INTO redemption_codes (code, days, expires_at, is_used)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      codeData.code,
      codeData.days,
      codeData.expiresAt,
      codeData.isUsed ? 1 : 0
    );
    
    return this.getRedemptionCodeById(result.lastInsertRowid);
  }

  getRedemptionCodeById(id) {
    const stmt = this.client.prepare('SELECT * FROM redemption_codes WHERE id = ?');
    return stmt.get(id);
  }

  getValidRedemptionCode(code) {
    const stmt = this.client.prepare('SELECT * FROM redemption_codes WHERE code = ? AND is_used = 0');
    return stmt.get(code);
  }

  useRedemptionCode(id) {
    const stmt = this.client.prepare(`
      UPDATE redemption_codes 
      SET is_used = 1, used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(id);
  }

  getAllRedemptionCodes() {
    const stmt = this.client.prepare('SELECT * FROM redemption_codes ORDER BY created_at DESC');
    return stmt.all();
  }

  // ============ 辅助方法 ============
  
  getUserByUsername(username) {
    const stmt = this.client.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username);
  }

  // ============ 观影记录 ============
  
  createPlayHistory(data) {
    const stmt = this.client.prepare(`
      INSERT INTO play_history (user_id, emby_item_id, item_name, item_type, play_duration, played_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(data.userId, data.embyItemId, data.itemName, data.itemType, data.playDuration, data.playedAt || new Date().toISOString());
    return result.lastInsertRowid;
  }

  getUserPlayHistory(userId, limit = 50) {
    const stmt = this.client.prepare(`
      SELECT * FROM play_history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?
    `);
    return stmt.all(userId, limit);
  }

  getUserPlayStats(userId) {
    const stmt = this.client.prepare(`
      SELECT 
        COUNT(*) as totalPlays,
        SUM(play_duration) as totalDuration,
        COUNT(DISTINCT DATE(played_at)) as activeDays
      FROM play_history WHERE user_id = ?
    `);
    return stmt.get(userId);
  }

  // ============ 续期日志 ============
  
  createRedemptionLog(data) {
    const stmt = this.client.prepare(`
      INSERT INTO redemption_logs (user_id, code_id, code, days_added, old_expires_at, new_expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(data.userId, data.codeId, data.code, data.daysAdded, data.oldExpiresAt, data.newExpiresAt);
    return result.lastInsertRowid;
  }

  getRedemptionLogs(userId = null, limit = 100) {
    if (userId) {
      const stmt = this.client.prepare(`
        SELECT * FROM redemption_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
      `);
      return stmt.all(userId, limit);
    }
    const stmt = this.client.prepare(`
      SELECT rl.*, u.username FROM redemption_logs rl 
      LEFT JOIN users u ON rl.user_id = u.id 
      ORDER BY rl.created_at DESC LIMIT ?
    `);
    return stmt.all(limit);
  }

  // ============ 搜索用户 ============
  
  searchUsers(query) {
    const stmt = this.client.prepare(`
      SELECT * FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY created_at DESC
    `);
    const searchQuery = `%${query}%`;
    return stmt.all(searchQuery, searchQuery);
  }
}

module.exports = SQLiteAdapter;
