/**
 * MySQL 数据库实现
 */

const mysql = require('mysql2/promise');
const DatabaseAdapter = require('./adapter');

class MySQLAdapter extends DatabaseAdapter {
  constructor() {
    super();
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'embyhub',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'embyhub',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };
  }

  async connect() {
    try {
      this.client = await mysql.createPool(this.config);
      
      // 测试连接
      const connection = await this.client.getConnection();
      await connection.ping();
      connection.release();
      
      console.log(`[DB] MySQL connected: ${this.config.host}:${this.config.port}/${this.config.database}`);
    } catch (error) {
      console.error('[DB] MySQL connection failed:', error.message);
      throw error;
    }
  }

  async initialize() {
    const connection = await this.client.getConnection();
    
    try {
      // 创建用户表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          emby_id VARCHAR(64) UNIQUE,
          telegram_id VARCHAR(64) UNIQUE,
          username VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          password_hash VARCHAR(255),
          is_admin TINYINT DEFAULT 0,
          is_active TINYINT DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_emby_id (emby_id),
          INDEX idx_telegram_id (telegram_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 创建会话表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT,
          emby_session_id VARCHAR(64) UNIQUE,
          device_id VARCHAR(255),
          device_name VARCHAR(255),
          client_name VARCHAR(255),
          last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_active TINYINT DEFAULT 1,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id),
          INDEX idx_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 创建日志表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT,
          action VARCHAR(255) NOT NULL,
          details TEXT,
          ip_address VARCHAR(45),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
          INDEX idx_user_id (user_id),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log('[DB] MySQL tables initialized');
    } finally {
      connection.release();
    }
  }

  // ============ 用户操作 ============
  
  async createUser(userData) {
    const [result] = await this.client.execute(`
      INSERT INTO users (emby_id, telegram_id, username, email, password_hash, is_admin, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      userData.embyId,
      userData.telegramId,
      userData.username,
      userData.email,
      userData.passwordHash,
      userData.isAdmin ? 1 : 0,
      userData.isActive !== false ? 1 : 0
    ]);
    
    return await this.getUserById(result.insertId);
  }

  async getUserById(id) {
    const [rows] = await this.client.execute('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0];
  }

  async getUserByEmbyId(embyId) {
    const [rows] = await this.client.execute('SELECT * FROM users WHERE emby_id = ?', [embyId]);
    return rows[0];
  }

  async getUserByTelegramId(telegramId) {
    const [rows] = await this.client.execute('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
    return rows[0];
  }

  async updateUser(id, userData) {
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
    
    if (fields.length === 0) return await this.getUserById(id);
    
    values.push(id);
    
    await this.client.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    
    return await this.getUserById(id);
  }

  async deleteUser(id) {
    await this.client.execute('DELETE FROM users WHERE id = ?', [id]);
  }

  async getAllUsers() {
    const [rows] = await this.client.execute('SELECT * FROM users ORDER BY created_at DESC');
    return rows;
  }

  // ============ 会话操作 ============
  
  async createSession(sessionData) {
    const [result] = await this.client.execute(`
      INSERT INTO sessions (user_id, emby_session_id, device_id, device_name, client_name, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      sessionData.userId,
      sessionData.embySessionId,
      sessionData.deviceId,
      sessionData.deviceName,
      sessionData.clientName,
      sessionData.isActive !== false ? 1 : 0
    ]);
    
    return await this.getSessionById(result.insertId);
  }

  async getSessionById(id) {
    const [rows] = await this.client.execute('SELECT * FROM sessions WHERE id = ?', [id]);
    return rows[0];
  }

  async updateSession(id, sessionData) {
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
    
    if (fields.length === 0) return await this.getSessionById(id);
    
    values.push(id);
    
    await this.client.execute(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`, values);
    
    return await this.getSessionById(id);
  }

  async deleteSession(id) {
    await this.client.execute('DELETE FROM sessions WHERE id = ?', [id]);
  }

  async getActiveSessions() {
    const [rows] = await this.client.execute(`
      SELECT s.*, u.username, u.telegram_id
      FROM sessions s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.is_active = 1
      ORDER BY s.last_activity DESC
    `);
    return rows;
  }

  // ============ 日志操作 ============
  
  async createLog(logData) {
    const [result] = await this.client.execute(`
      INSERT INTO logs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `, [
      logData.userId,
      logData.action,
      logData.details,
      logData.ipAddress
    ]);
    
    return result.insertId;
  }

  async getLogs(userId, limit = 50) {
    const [rows] = await this.client.execute(`
      SELECT * FROM logs 
      WHERE user_id = ? OR user_id IS NULL
      ORDER BY created_at DESC 
      LIMIT ?
    `, [userId, limit]);
    return rows;
  }

  async clearOldLogs(days = 30) {
    await this.client.execute(`
      DELETE FROM logs 
      WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [days]);
  }

  // ============ 连接池管理 ============
  
  async close() {
    await this.client.end();
  }
}

module.exports = MySQLAdapter;
