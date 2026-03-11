require('dotenv').config();
const mysql = require('mysql2/promise');

class MySQLAdapter {
  constructor() {
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '123456',
      database: process.env.DB_NAME || 'embyhub',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4'
    };
  }

  async connect() {
    this.client = await mysql.createPool(this.config);
    const connection = await this.client.getConnection();
    await connection.ping();
    connection.release();
    console.log(`[DB] MySQL connected: ${this.config.host}:${this.config.port}/${this.config.database}`);
  }

  async initialize() {
    console.log('[DB] Tables already exist, skipping creation');
  }

  async query(sql, params) {
    try {
      const [rows] = await this.client.execute(sql, params);
      return rows;
    } catch (e) {
      console.error('Query error:', e.message, sql);
      return [];
    }
  }

  getPool() {
    return this.client;
  }

  async getUserById(id) {
    const rows = await this.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async getUserByUsername(username) {
    const rows = await this.query('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0] || null;
  }

  async getUserByEmbyId(embyId) {
    const rows = await this.query('SELECT * FROM users WHERE emby_id = ?', [embyId]);
    return rows[0] || null;
  }

  async getUserByTelegramId(telegramId) {
    const rows = await this.query('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
    return rows[0] || null;
  }

  async getAllUsers() {
    return await this.query('SELECT * FROM users ORDER BY created_at DESC');
  }

  async createUser(data) {
    const { username, email, passwordHash, isAdmin, isActive, expiresAt, embyId, telegramId, invitedBy } = data;
    const result = await this.query(
      'INSERT INTO users (username, email, password_hash, is_admin, is_active, expires_at, emby_id, telegram_id, invited_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [username, email || null, passwordHash, isAdmin ? 1 : 0, isActive ? 1 : 0, expiresAt || null, embyId || null, telegramId || null, invitedBy || null]
    );
    return this.getUserById(result.insertId);
  }

  async updateUser(id, data) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(data)) {
      const col = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
      fields.push(`${col} = ?`);
      values.push(value);
    }
    values.push(id);
    await this.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.getUserById(id);
  }

  async updateUserPassword(id, passwordHash) {
    await this.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
  }

  async updateUserBalance(id, balance) {
    await this.query('UPDATE users SET balance = ? WHERE id = ?', [balance, id]);
  }

  async updateUserCoins(id, coins) {
    await this.query('UPDATE users SET coins = ? WHERE id = ?', [coins, id]);
  }

  async updateUserExpiry(id, expiresAt) {
    await this.query('UPDATE users SET expires_at = ? WHERE id = ?', [expiresAt, id]);
  }

  async updateUserActive(id, isActive) {
    await this.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  }

  async deleteUser(id) {
    await this.query('DELETE FROM users WHERE id = ?', [id]);
  }

  async countUsers() {
    const [result] = await this.query('SELECT COUNT(*) as count FROM users');
    return result.count;
  }

  async countActiveUsers() {
    const [result] = await this.query('SELECT COUNT(*) as count FROM users WHERE is_active = 1');
    return result.count;
  }

  async getRecentUsers(limit = 10) {
    return await this.query('SELECT * FROM users ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  async getStats() {
    const [totalUsers] = await this.query('SELECT COUNT(*) as count FROM users');
    const [activeUsers] = await this.query('SELECT COUNT(*) as count FROM users WHERE is_active = 1');
    const [expiredUsers] = await this.query('SELECT COUNT(*) as count FROM users WHERE expires_at IS NOT NULL AND expires_at < NOW()');
    return { totalUsers: totalUsers.count, activeUsers: activeUsers.count, expiredUsers: expiredUsers.count };
  }

  async addCoins(userId, amount, type, description) {
    const [user] = await this.query('SELECT coins FROM users WHERE id = ?', [userId]);
    if (!user) throw new Error('User not found');
    const newBalance = user.coins + amount;
    await this.query('UPDATE users SET coins = ? WHERE id = ?', [newBalance, userId]);
    await this.query('INSERT INTO coin_logs (user_id, amount, balance_after, type, description) VALUES (?, ?, ?, ?, ?)',
      [userId, amount, newBalance, type, description || null]);
    return newBalance;
  }

  async getCoinLogs(userId, limit = 50) {
    return await this.query('SELECT * FROM coin_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]);
  }

  async getProducts() {
    return await this.query('SELECT * FROM products ORDER BY sort_order, created_at DESC');
  }

  async getActiveProducts() {
    return await this.query('SELECT * FROM products WHERE is_active = 1 ORDER BY sort_order, created_at DESC');
  }

  async getUserLevel(userId) {
    const rows = await this.query('SELECT user_level, total_invites, total_checkins FROM users WHERE id = ?', [userId]);
    return rows[0] || { user_level: 1, total_invites: 0, total_checkins: 0 };
  }

  async getProductById(id) {
    const rows = await this.query('SELECT * FROM products WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async createProduct(data) {
    const { name, description, price, stock, category, icon, daysReward } = data;
    const result = await this.query(
      'INSERT INTO products (name, description, price, stock, category, icon, days_reward) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, description || null, price || 0, stock || -1, category || 'default', icon || null, daysReward || 0]
    );
    return this.getProductById(result.insertId);
  }

  async updateProduct(id, data) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(data)) {
      const col = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
      fields.push(`${col} = ?`);
      values.push(value);
    }
    values.push(id);
    await this.query(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.getProductById(id);
  }

  async deleteProduct(id) {
    await this.query('DELETE FROM products WHERE id = ?', [id]);
  }

  async createPurchase(data) {
    const { userId, productId, productName, coinsSpent, daysRewarded } = data;
    const result = await this.query(
      'INSERT INTO purchases (user_id, product_id, product_name, coins_spent, days_rewarded) VALUES (?, ?, ?, ?, ?)',
      [userId, productId, productName, coinsSpent, daysRewarded || 0]
    );
    return result.insertId;
  }

  async getPurchases(userId, limit = 50) {
    return await this.query('SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]);
  }

  async createLog(data) {
    console.log('[Log]', JSON.stringify(data));
    return { id: Date.now() };
  }

  async getRedemptionCode(code) {
    const rows = await this.query('SELECT * FROM redemption_codes WHERE code = ?', [code]);
    return rows[0] || null;
  }

  async useRedemptionCode(code, userId) {
    const codeData = await this.getRedemptionCode(code);
    if (!codeData || codeData.is_used) return null;
    await this.query('UPDATE redemption_codes SET is_used = 1, used_by = ?, used_at = NOW() WHERE id = ?', [userId, codeData.id]);
    return codeData;
  }

  async createRedemptionCode(data) {
    const { code, days, price, expiresAt } = data;
    const result = await this.query(
      'INSERT INTO redemption_codes (code, days, price, expires_at) VALUES (?, ?, ?, ?)',
      [code, days || 30, price || 0, expiresAt]
    );
    return result.insertId;
  }

  async getInvitationCode(code) {
    const rows = await this.query('SELECT * FROM invitation_codes WHERE code = ?', [code]);
    return rows[0] || null;
  }

  async createInvitationCode(data) {
    const { code, userId, maxUses, expiresAt } = data;
    const result = await this.query(
      'INSERT INTO invitation_codes (code, user_id, max_uses, expires_at) VALUES (?, ?, ?, ?)',
      [code, userId, maxUses || 0, expiresAt || null]
    );
    return result.insertId;
  }

  async useInvitationCode(code) {
    await this.query('UPDATE invitation_codes SET used_count = used_count + 1 WHERE code = ?', [code]);
  }

  async createInvitation(data) {
    const { inviterId, invitedId } = data;
    await this.query('INSERT INTO invitations (inviter_id, invited_id) VALUES (?, ?)', [inviterId, invitedId]);
  }

  async getCheckinToday(userId) {
    const rows = await this.query(
      'SELECT * FROM checkin_logs WHERE user_id = ? AND DATE(created_at) = CURDATE()',
      [userId]
    );
    return rows[0] || null;
  }

  async createCheckin(userId, coinsEarned) {
    const result = await this.query(
      'INSERT INTO checkin_logs (user_id, coins_earned) VALUES (?, ?)',
      [userId, coinsEarned]
    );
    await this.query('UPDATE users SET total_checkins = total_checkins + 1 WHERE id = ?', [userId]);
    return result.insertId;
  }

  async getTickets(userId, limit = 20) {
    return await this.query('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]);
  }

  async createTicket(data) {
    const { userId, title, description } = data;
    const result = await this.query(
      'INSERT INTO tickets (user_id, title, description) VALUES (?, ?, ?)',
      [userId, title, description || null]
    );
    return result.insertId;
  }

  async getTicketReplies(ticketId) {
    return await this.query('SELECT * FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at', [ticketId]);
  }

  async createTicketReply(data) {
    const { ticketId, userId, message, isAdmin } = data;
    const result = await this.query(
      'INSERT INTO ticket_replies (ticket_id, user_id, message, is_admin) VALUES (?, ?, ?, ?)',
      [ticketId, userId, message, isAdmin ? 1 : 0]
    );
    return result.insertId;
  }
}

module.exports = MySQLAdapter;