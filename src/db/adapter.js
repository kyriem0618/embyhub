/**
 * 数据库适配器基类
 */

class DatabaseAdapter {
  constructor() {
    this.client = null;
  }

  async connect() {
    throw new Error('Method connect() must be implemented');
  }

  async initialize() {
    throw new Error('Method initialize() must be implemented');
  }

  // ============ 用户表 ============
  
  async createUser(userData) {
    throw new Error('Method createUser() must be implemented');
  }

  async getUserById(id) {
    throw new Error('Method getUserById() must be implemented');
  }

  async getUserByEmbyId(embyId) {
    throw new Error('Method getUserByEmbyId() must be implemented');
  }

  async getUserByTelegramId(telegramId) {
    throw new Error('Method getUserByTelegramId() must be implemented');
  }

  async updateUser(id, userData) {
    throw new Error('Method updateUser() must be implemented');
  }

  async deleteUser(id) {
    throw new Error('Method deleteUser() must be implemented');
  }

  async getAllUsers() {
    throw new Error('Method getAllUsers() must be implemented');
  }

  // ============ 会话表 ============
  
  async createSession(sessionData) {
    throw new Error('Method createSession() must be implemented');
  }

  async getSessionById(id) {
    throw new Error('Method getSessionById() must be implemented');
  }

  async updateSession(id, sessionData) {
    throw new Error('Method updateSession() must be implemented');
  }

  async deleteSession(id) {
    throw new Error('Method deleteSession() must be implemented');
  }

  async getActiveSessions() {
    throw new Error('Method getActiveSessions() must be implemented');
  }

  // ============ 日志表 ============
  
  async createLog(logData) {
    throw new Error('Method createLog() must be implemented');
  }

  async getLogs(userId, limit = 50) {
    throw new Error('Method getLogs() must be implemented');
  }

  async clearOldLogs(days = 30) {
    throw new Error('Method clearOldLogs() must be implemented');
  }

  // ============ 续期码表 ============
  
  async createRedemptionCode(codeData) {
    throw new Error('Method createRedemptionCode() must be implemented');
  }

  async getValidRedemptionCode(code) {
    throw new Error('Method getValidRedemptionCode() must be implemented');
  }

  async useRedemptionCode(id) {
    throw new Error('Method useRedemptionCode() must be implemented');
  }

  async getAllRedemptionCodes() {
    throw new Error('Method getAllRedemptionCodes() must be implemented');
  }

  // ============ 辅助方法 ============
  
  async getUserByUsername(username) {
    throw new Error('Method getUserByUsername() must be implemented');
  }
}

module.exports = DatabaseAdapter;
