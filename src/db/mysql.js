/**
 * MySQL 数据库实现 - 完整版
 */

const mysql = require('mysql2/promise');
// DatabaseAdapter removed

class MySQLAdapter  {
  constructor() {
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'embyhub',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'embyhub',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4'
    };
  }

  async connect() {
    try {
      this.client = await mysql.createPool(this.config);
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
      // 用户表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          emby_id VARCHAR(64) UNIQUE,
          telegram_id VARCHAR(64) UNIQUE,
          username VARCHAR(255) NOT NULL UNIQUE,
          email VARCHAR(255),
          password_hash VARCHAR(255),
          is_admin TINYINT DEFAULT 0,
          is_active TINYINT DEFAULT 1,
          expires_at DATETIME,
          invited_by INT,
          balance DECIMAL(10,2) DEFAULT 0.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_emby_id (emby_id),
          INDEX idx_username (username),
          INDEX idx_expires_at (expires_at),
          FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 续期码表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS redemption_codes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          code VARCHAR(64) UNIQUE NOT NULL,
          days INT NOT NULL DEFAULT 30,
          price DECIMAL(10,2) DEFAULT 0.00,
          expires_at DATETIME NOT NULL,
          is_used TINYINT DEFAULT 0,
          used_by INT,
          used_at DATETIME,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_code (code),
          INDEX idx_is_used (is_used),
          FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 续期日志表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS redemption_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT,
          code_id INT,
          code VARCHAR(64),
          days_added INT,
          old_expires_at DATETIME,
          new_expires_at DATETIME,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (code_id) REFERENCES redemption_codes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 邀请码表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS invitation_codes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          code VARCHAR(64) UNIQUE NOT NULL,
          user_id INT NOT NULL,
          max_uses INT DEFAULT 0,
          used_count INT DEFAULT 0,
          is_active TINYINT DEFAULT 1,
          expires_at DATETIME,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_code (code),
          INDEX idx_user_id (user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 邀请记录表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS invitations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          inviter_id INT NOT NULL,
          invitee_id INT NOT NULL,
          invite_code VARCHAR(64),
          reward_days INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 观影记录表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS play_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT,
          emby_item_id VARCHAR(64),
          item_name VARCHAR(255),
          item_type VARCHAR(32),
          play_duration INT DEFAULT 0,
          played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 签到记录表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS checkins (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          reward_days INT DEFAULT 0,
          ip_address VARCHAR(45),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_created_at (created_at),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 工单表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS tickets (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          subject VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          status ENUM('open', 'pending', 'closed') DEFAULT 'open',
          priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
          assigned_to INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_status (status),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 工单回复表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS ticket_replies (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ticket_id INT NOT NULL,
          user_id INT NOT NULL,
          message TEXT NOT NULL,
          is_admin TINYINT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 充值订单表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
          payment_method VARCHAR(32),
          transaction_id VARCHAR(128),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          paid_at DATETIME,
          INDEX idx_user_id (user_id),
          INDEX idx_status (status),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 会话表
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
          INDEX idx_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 操作日志表
      await connection.query(`
        CREATE TABLE IF NOT EXISTS logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT,
          action VARCHAR(64) NOT NULL,
          details TEXT,
          ip_address VARCHAR(45),
          user_agent VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
          INDEX idx_user_id (user_id),
          INDEX idx_action (action),
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
      INSERT INTO users (emby_id, telegram_id, username, email, password_hash, is_admin, is_active, expires_at, invited_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userData.embyId || null,
      userData.telegramId || null,
      userData.username,
      userData.email || null,
      userData.passwordHash,
      userData.isAdmin ? 1 : 0,
      userData.isActive !== false ? 1 : 0,
      userData.expiresAt || null,
      userData.invitedBy || null
    ]);
    
    return await this.getUserById(result.insertId);
  }

  async getUserById(id) {
    const [rows] = await this.client.execute('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0];
  }

  async getUserByUsername(username) {
    const [rows] = await this.client.execute('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0];
  }

  async getUserByEmbyId(embyId) {
    const [rows] = await this.client.execute('SELECT * FROM users WHERE emby_id = ?', [embyId]);
    return rows[0];
  }

  async updateUser(id, userData) {
    const fields = [];
    const values = [];
    
    const mapping = {
      username: 'username',
      email: 'email',
      passwordHash: 'password_hash',
      isAdmin: 'is_admin',
      isActive: 'is_active',
      expiresAt: 'expires_at',
      invitedBy: 'invited_by',
      balance: 'balance'
    };
    
    for (const [key, column] of Object.entries(mapping)) {
      if (userData[key] !== undefined) {
        fields.push(`${column} = ?`);
        values.push(userData[key]);
      }
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

  async searchUsers(query) {
    const searchPattern = `%${query}%`;
    const [rows] = await this.client.execute(
      'SELECT * FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY created_at DESC',
      [searchPattern, searchPattern]
    );
    return rows;
  }

  // ============ 续期码操作 ============
  
  async createRedemptionCode(codeData) {
    const [result] = await this.client.execute(`
      INSERT INTO redemption_codes (code, days, price, expires_at, is_used)
      VALUES (?, ?, ?, ?, ?)
    `, [
      codeData.code,
      codeData.days,
      codeData.price || 0,
      codeData.expiresAt,
      codeData.isUsed ? 1 : 0
    ]);
    
    return await this.getRedemptionCodeById(result.insertId);
  }

  async getRedemptionCodeById(id) {
    const [rows] = await this.client.execute('SELECT * FROM redemption_codes WHERE id = ?', [id]);
    return rows[0];
  }

  async getValidRedemptionCode(code) {
    const [rows] = await this.client.execute(
      'SELECT * FROM redemption_codes WHERE code = ? AND is_used = 0 AND expires_at > NOW()',
      [code]
    );
    return rows[0];
  }

  async useRedemptionCode(id, userId) {
    await this.client.execute(
      'UPDATE redemption_codes SET is_used = 1, used_by = ?, used_at = NOW() WHERE id = ?',
      [userId, id]
    );
  }

  async getAllRedemptionCodes() {
    const [rows] = await this.client.execute('SELECT * FROM redemption_codes ORDER BY created_at DESC');
    return rows;
  }

  // ============ 续期日志 ============
  
  async createRedemptionLog(data) {
    const [result] = await this.client.execute(`
      INSERT INTO redemption_logs (user_id, code_id, code, days_added, old_expires_at, new_expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [data.userId, data.codeId, data.code, data.daysAdded, data.oldExpiresAt, data.newExpiresAt]);
    return result.insertId;
  }

  async getRedemptionLogs(userId = null, limit = 100) {
    if (userId) {
      const [rows] = await this.client.execute(
        'SELECT * FROM redemption_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        [userId, limit]
      );
      return rows;
    }
    const [rows] = await this.client.execute(`
      SELECT rl.*, u.username FROM redemption_logs rl 
      LEFT JOIN users u ON rl.user_id = u.id 
      ORDER BY rl.created_at DESC LIMIT ?
    `, [limit]);
    return rows;
  }

  // ============ 邀请码操作 ============

  async createInvitationCode(data) {
    const [result] = await this.client.execute(`
      INSERT INTO invitation_codes (code, user_id, max_uses, used_count, is_active, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      data.code,
      data.userId,
      data.maxUses || 0,
      0,
      data.isActive !== false ? 1 : 0,
      data.expiresAt || null
    ]);
    return await this.getInvitationCodeById(result.insertId);
  }

  async getInvitationCodeById(id) {
    const [rows] = await this.client.execute('SELECT * FROM invitation_codes WHERE id = ?', [id]);
    return rows[0];
  }

  async getInvitationCodeByCode(code) {
    const [rows] = await this.client.execute(`
      SELECT ic.*, u.username as owner_username 
      FROM invitation_codes ic 
      LEFT JOIN users u ON ic.user_id = u.id
      WHERE ic.code = ?
    `, [code]);
    return rows[0];
  }

  async getValidInvitationCode(code) {
    const [rows] = await this.client.execute(`
      SELECT ic.*, u.username as owner_username 
      FROM invitation_codes ic 
      LEFT JOIN users u ON ic.user_id = u.id
      WHERE ic.code = ? AND ic.is_active = 1
    `, [code]);
    
    const codeData = rows[0];
    if (!codeData) return null;
    
    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
      return null;
    }
    
    if (codeData.max_uses > 0 && codeData.used_count >= codeData.max_uses) {
      return null;
    }
    
    return codeData;
  }

  async useInvitationCode(id) {
    await this.client.execute(
      'UPDATE invitation_codes SET used_count = used_count + 1 WHERE id = ?',
      [id]
    );
  }

  async getUserInvitationCodes(userId) {
    const [rows] = await this.client.execute(
      'SELECT * FROM invitation_codes WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }

  async getAllInvitationCodes() {
    const [rows] = await this.client.execute(`
      SELECT ic.*, u.username as owner_username 
      FROM invitation_codes ic 
      LEFT JOIN users u ON ic.user_id = u.id
      ORDER BY ic.created_at DESC
    `);
    return rows;
  }

  async updateInvitationCode(id, data) {
    const fields = [];
    const values = [];
    
    if (data.isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(data.isActive ? 1 : 0);
    }
    if (data.maxUses !== undefined) {
      fields.push('max_uses = ?');
      values.push(data.maxUses);
    }
    if (data.expiresAt !== undefined) {
      fields.push('expires_at = ?');
      values.push(data.expiresAt);
    }
    
    if (fields.length === 0) return await this.getInvitationCodeById(id);
    
    values.push(id);
    await this.client.execute(`UPDATE invitation_codes SET ${fields.join(', ')} WHERE id = ?`, values);
    return await this.getInvitationCodeById(id);
  }

  async deleteInvitationCode(id) {
    await this.client.execute('DELETE FROM invitation_codes WHERE id = ?', [id]);
  }

  // ============ 邀请记录 ============

  async createInvitation(data) {
    const [result] = await this.client.execute(`
      INSERT INTO invitations (inviter_id, invitee_id, invite_code, reward_days)
      VALUES (?, ?, ?, ?)
    `, [data.inviterId, data.inviteeId, data.inviteCode, data.rewardDays || 0]);
    return result.insertId;
  }

  async getUserInvitations(userId) {
    const [rows] = await this.client.execute(`
      SELECT i.*, u.username as invitee_username 
      FROM invitations i 
      LEFT JOIN users u ON i.invitee_id = u.id
      WHERE i.inviter_id = ? 
      ORDER BY i.created_at DESC
    `, [userId]);
    return rows;
  }

  async getUserInvitationStats(userId) {
    const [rows] = await this.client.execute(`
      SELECT 
        COUNT(*) as total_invites,
        SUM(reward_days) as total_reward_days
      FROM invitations WHERE inviter_id = ?
    `, [userId]);
    return rows[0];
  }

  // ============ 观影记录 ============
  
  async createPlayHistory(data) {
    const [result] = await this.client.execute(`
      INSERT INTO play_history (user_id, emby_item_id, item_name, item_type, play_duration, played_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [data.userId, data.embyItemId, data.itemName, data.itemType, data.playDuration, data.playedAt || new Date()]);
    return result.insertId;
  }

  async getUserPlayHistory(userId, limit = 50) {
    const [rows] = await this.client.execute(
      'SELECT * FROM play_history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?',
      [userId, limit]
    );
    return rows;
  }

  async getUserPlayStats(userId) {
    const [rows] = await this.client.execute(`
      SELECT 
        COUNT(*) as totalPlays,
        SUM(play_duration) as totalDuration,
        COUNT(DISTINCT DATE(played_at)) as activeDays
      FROM play_history WHERE user_id = ?
    `, [userId]);
    return rows[0];
  }

  // ============ 签到 ============
  
  async createCheckin(userId, rewardDays, ipAddress) {
    // 先检查今日是否已签到
    const [existing] = await this.client.execute(`
      SELECT id FROM checkins 
      WHERE user_id = ? AND DATE(created_at) = CURDATE()
    `, [userId]);
    
    if (existing.length > 0) {
      return null; // 今日已签到
    }
    
    const [result] = await this.client.execute(`
      INSERT INTO checkins (user_id, reward_days, ip_address)
      VALUES (?, ?, ?)
    `, [userId, rewardDays, ipAddress]);
    return result.insertId;
  }

  async getUserCheckins(userId, limit = 30) {
    const [rows] = await this.client.execute(
      'SELECT * FROM checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, limit]
    );
    return rows;
  }

  async getUserCheckinStats(userId) {
    const [rows] = await this.client.execute(`
      SELECT 
        COUNT(*) as total_checkins,
        SUM(reward_days) as total_reward_days
      FROM checkins WHERE user_id = ?
    `, [userId]);
    return rows[0];
  }

  async hasCheckedInToday(userId) {
    const [rows] = await this.client.execute(`
      SELECT COUNT(*) as count FROM checkins 
      WHERE user_id = ? AND DATE(created_at) = CURDATE()
    `, [userId]);
    return rows[0].count > 0;
  }

  // ============ 工单 ============
  
  async createTicket(data) {
    const [result] = await this.client.execute(`
      INSERT INTO tickets (user_id, subject, message, status, priority)
      VALUES (?, ?, ?, ?, ?)
    `, [data.userId, data.subject, data.message, data.status || 'open', data.priority || 'medium']);
    return result.insertId;
  }

  async getTicketById(id) {
    const [rows] = await this.client.execute('SELECT * FROM tickets WHERE id = ?', [id]);
    return rows[0];
  }

  async getUserTickets(userId, limit = 20) {
    const [rows] = await this.client.execute(
      'SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, limit]
    );
    return rows;
  }

  async getAllTickets(status = null, limit = 50) {
    if (status) {
      const [rows] = await this.client.execute(
        'SELECT t.*, u.username FROM tickets t LEFT JOIN users u ON t.user_id = u.id WHERE t.status = ? ORDER BY t.created_at DESC LIMIT ?',
        [status, limit]
      );
      return rows;
    }
    const [rows] = await this.client.execute(
      'SELECT t.*, u.username FROM tickets t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT ?',
      [limit]
    );
    return rows;
  }

  async updateTicketStatus(id, status) {
    await this.client.execute('UPDATE tickets SET status = ? WHERE id = ?', [status, id]);
  }

  async createTicketReply(data) {
    const [result] = await this.client.execute(`
      INSERT INTO ticket_replies (ticket_id, user_id, message, is_admin)
      VALUES (?, ?, ?, ?)
    `, [data.ticketId, data.userId, data.message, data.isAdmin ? 1 : 0]);
    return result.insertId;
  }

  async getTicketReplies(ticketId) {
    const [rows] = await this.client.execute(`
      SELECT tr.*, u.username FROM ticket_replies tr
      LEFT JOIN users u ON tr.user_id = u.id
      WHERE tr.ticket_id = ? ORDER BY tr.created_at ASC
    `, [ticketId]);
    return rows;
  }

  // ============ 订单 ============
  
  async createOrder(data) {
    const [result] = await this.client.execute(`
      INSERT INTO orders (user_id, amount, status, payment_method)
      VALUES (?, ?, ?, ?)
    `, [data.userId, data.amount, data.status || 'pending', data.paymentMethod || null]);
    return result.insertId;
  }

  async getOrderById(id) {
    const [rows] = await this.client.execute('SELECT * FROM orders WHERE id = ?', [id]);
    return rows[0];
  }

  async updateOrderStatus(id, status, transactionId = null) {
    if (transactionId) {
      await this.client.execute(
        'UPDATE orders SET status = ?, transaction_id = ?, paid_at = NOW() WHERE id = ?',
        [status, transactionId, id]
      );
    } else {
      await this.client.execute('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    }
  }

  async getUserOrders(userId, limit = 20) {
    const [rows] = await this.client.execute(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, limit]
    );
    return rows;
  }

  // ============ 日志操作 ============
  
  async createLog(logData) {
    const [result] = await this.client.execute(`
      INSERT INTO logs (user_id, action, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `, [
      logData.userId || null,
      logData.action,
      logData.details ? JSON.stringify(logData.details) : null,
      logData.ipAddress || null,
      logData.userAgent || null
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
      DELETE FROM logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [days]);
  }

  // ============ 统计 ============
  
  async getStats() {
    const [userStats] = await this.client.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN expires_at < NOW() THEN 1 ELSE 0 END) as expired
      FROM users
    `);
    
    const [ticketStats] = await this.client.execute(`
      SELECT COUNT(*) as open_tickets FROM tickets WHERE status = 'open'
    `);
    
    return {
      totalUsers: userStats[0].total,
      activeUsers: userStats[0].active,
      expiredUsers: userStats[0].expired,
      openTickets: ticketStats[0].open_tickets
    };
  }

  // ============ 连接池管理 ============
  
  async close() {
    await this.client.end();
  }
}

module.exports = MySQLAdapter;