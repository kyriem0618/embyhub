/**
 * EmbyHub - Main Entry Point
 * Emby 用户管理系统主入口
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const EmbyClient = require('./api/emby');

const app = express();
const PORT = process.env.PORT || 3000;

// ============ 中间件 ============

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============ Emby 客户端初始化 ============

const embyClient = new EmbyClient(
  process.env.EMBY_URL || 'http://localhost:8096',
  process.env.EMBY_API_KEY || ''
);

// ============ 路由 ============

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 测试 Emby 连接
app.get('/api/emby/test', async (req, res) => {
  try {
    const result = await embyClient.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取系统信息
app.get('/api/emby/system', async (req, res) => {
  try {
    const info = await embyClient.getSystemInfo();
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 用户路由 ============

app.get('/api/users', async (req, res) => {
  try {
    const users = await embyClient.getUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await embyClient.getUser(req.params.id);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: '用户名不能为空' });
    }
    const user = await embyClient.createUser(name);
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const userData = req.body;
    const user = await embyClient.updateUser(req.params.id, userData);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await embyClient.deleteUser(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/:id/password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ error: '密码不能为空' });
    }
    await embyClient.setPassword(req.params.id, newPassword);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 会话路由 ============

app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await embyClient.getSessions();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions/:id/stop', async (req, res) => {
  try {
    await embyClient.stopSession(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 静态文件服务（生产环境） ============

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// ============ 错误处理 ============

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message 
  });
});

// ============ 启动服务器 ============

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║   🎬 EmbyHub Server Started                   ║
║                                               ║
║   Port: ${PORT}                                    ║
║   Env: ${process.env.NODE_ENV || 'development'}                           ║
║   Emby: ${process.env.EMBY_URL || 'not configured'}                    ║
║                                               ║
║   API: http://localhost:${PORT}/api/health          ║
║                                               ║
╚═══════════════════════════════════════════════╝
  `);
});

module.exports = app;
