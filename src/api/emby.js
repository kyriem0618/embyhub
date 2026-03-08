/**
 * Emby API Client
 * 封装 Emby Server REST API
 * @see https://dev.emby.media/doc/restapi/index.html
 */

const axios = require('axios');

class EmbyClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // 移除末尾斜杠
    this.apiKey = apiKey;
    
    this.client = axios.create({
      baseURL: `${this.baseUrl}/emby`,
      params: {
        api_key: this.apiKey
      },
      headers: {
        'Content-Type': 'application/json',
        'X-Emby-Authorization': `MediaBrowser Client="EmbyHub", Version="0.1.0"`
      }
    });
  }

  // ============ 系统信息 ============
  
  /**
   * 获取系统信息
   */
  async getSystemInfo() {
    const response = await this.client.get('/System/Info');
    return response.data;
  }

  /**
   * 获取服务器状态
   */
  async getSystemStatus() {
    const response = await this.client.get('/System/Status');
    return response.data;
  }

  // ============ 用户管理 ============
  
  /**
   * 获取所有用户
   */
  async getUsers() {
    const response = await this.client.get('/Users');
    return response.data;
  }

  /**
   * 获取单个用户
   */
  async getUser(userId) {
    const response = await this.client.get(`/Users/${userId}`);
    return response.data;
  }

  /**
   * 创建新用户
   * @param {string} name - 用户名
   */
  async createUser(name) {
    const response = await this.client.post('/Users/New', { name });
    return response.data;
  }

  /**
   * 更新用户
   * @param {string} userId - 用户 ID
   * @param {object} userData - 用户数据
   */
  async updateUser(userId, userData) {
    const response = await this.client.post(`/Users/${userId}/Configuration`, userData);
    return response.data;
  }

  /**
   * 删除用户
   * @param {string} userId - 用户 ID
   */
  async deleteUser(userId) {
    const response = await this.client.delete(`/Users/${userId}`);
    return response.data;
  }

  /**
   * 重置用户密码
   * @param {string} userId - 用户 ID
   */
  async resetPassword(userId) {
    const response = await this.client.post(`/Users/${userId}/Password`);
    return response.data;
  }

  /**
   * 设置用户密码
   * @param {string} userId - 用户 ID
   * @param {string} newPassword - 新密码
   */
  async setPassword(userId, newPassword) {
    const response = await this.client.post(`/Users/${userId}/Password`, {
      Id: userId,
      CurrentPw: '',
      NewPw: newPassword
    });
    return response.data;
  }

  // ============ 会话管理 ============
  
  /**
   * 获取活跃会话
   * @param {string} deviceId - 可选的设备 ID 过滤
   */
  async getSessions(deviceId = null) {
    const params = {};
    if (deviceId) {
      params.DeviceId = deviceId;
    }
    const response = await this.client.get('/Sessions', { params });
    return response.data;
  }

  /**
   * 下架会话（停止播放）
   * @param {string} sessionId - 会话 ID
   */
  async stopSession(sessionId) {
    const response = await this.client.post(`/Sessions/${sessionId}/Playing/Stop`);
    return response.data;
  }

  /**
   * 发送播放命令
   * @param {string} sessionId - 会话 ID
   * @param {string} itemId - 媒体项 ID
   * @param {string} command - 播放命令 (PlayNow, PlayNext, PlayLast)
   */
  async playCommand(sessionId, itemId, command = 'PlayNow') {
    const response = await this.client.post(`/Sessions/${sessionId}/Playing`, null, {
      params: {
        ItemIds: itemId,
        PlayCommand: command
      }
    });
    return response.data;
  }

  // ============ 媒体库管理 ============
  
  /**
   * 获取媒体库
   */
  async getMediaFolders() {
    const response = await this.client.get('/Library/MediaFolders');
    return response.data;
  }

  /**
   * 获取项目（媒体项）
   * @param {object} params - 查询参数
   */
  async getItems(params = {}) {
    const response = await this.client.get('/Items', { params });
    return response.data;
  }

  /**
   * 获取最近添加的媒体
   * @param {number} limit - 数量限制
   */
  async getRecentlyAdded(limit = 20) {
    const response = await this.client.get('/Users/me/Items/Latest', {
      params: { Limit: limit }
    });
    return response.data;
  }

  // ============ 设备管理 ============
  
  /**
   * 获取设备列表
   */
  async getDevices() {
    const response = await this.client.get('/Devices');
    return response.data;
  }

  /**
   * 删除设备
   * @param {string} deviceId - 设备 ID
   */
  async deleteDevice(deviceId) {
    const response = await this.client.delete(`/Devices/${deviceId}`);
    return response.data;
  }

  // ============ 工具方法 ============
  
  /**
   * 测试连接
   */
  async testConnection() {
    try {
      const info = await this.getSystemInfo();
      return {
        success: true,
        version: info.Version,
        serverName: info.ServerName
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = EmbyClient;
