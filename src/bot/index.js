/**
 * Telegram Bot - EmbyHub
 * 集成 Telegram Bot 管理 Emby 用户
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const EmbyClient = require('../api/emby');
const { initDatabase } = require('../db');
const bcrypt = require('bcryptjs');

// 配置
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_IDS = process.env.TELEGRAM_ADMIN_IDS 
  ? process.env.TELEGRAM_ADMIN_IDS.split(',').map(id => parseInt(id.trim()))
  : [];

if (!BOT_TOKEN) {
  console.error('[Bot] TELEGRAM_BOT_TOKEN not configured. Bot disabled.');
  process.exit(1);
}

// 初始化
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const emby = new EmbyClient(
  process.env.EMBY_URL || 'http://localhost:8096',
  process.env.EMBY_API_KEY || ''
);

let db = null;

// ============ 辅助函数 ============

/**
 * 检查是否是管理员
 */
function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

/**
 * 发送消息（安全包装）
 */
async function sendMessage(chatId, text, options = {}) {
  try {
    return await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...options
    });
  } catch (error) {
    console.error('[Bot] Send message error:', error.message);
  }
}

/**
 * 发送带按钮的消息
 */
async function sendMessageWithButtons(chatId, text, buttons) {
  return await sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}

// ============ Bot 命令处理 ============

/**
 * /start - 欢迎命令
 */
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;
  
  const welcomeText = `
🎬 *欢迎使用 EmbyHub!*

你好，${username}！我是你的 Emby 管理助手。

*可用命令:*
/start - 显示此菜单
/help - 帮助信息
/status - 服务器状态
/myaccount - 我的账号
/admin - 管理面板 (仅管理员)

*需要帮助？* 联系管理员获取支持。
  `.trim();
  
  await sendMessage(chatId, welcomeText);
});

/**
 * /help - 帮助命令
 */
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  const helpText = `
📖 *EmbyHub 使用帮助*

*普通用户:*
• 注册账号 - 联系管理员获取邀请码
• 查看账号 - /myaccount
• 修改密码 - 在管理面板操作

*管理员:*
• 创建用户 - /admin → 用户管理
• 查看会话 - /admin → 会话监控
• 服务器状态 - /status

*快捷操作:*
发送 \`/start\` 获取主菜单
  `.trim();
  
  await sendMessage(chatId, helpText);
});

/**
 * /status - 服务器状态
 */
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const systemInfo = await emby.getSystemInfo();
    const users = await emby.getUsers();
    const sessions = await await emby.getSessions();
    
    const statusText = `
🖥️ *Emby 服务器状态*

*服务器:* ${systemInfo.ServerName || 'Unknown'}
*版本:* ${systemInfo.Version || 'Unknown'}
*系统:* ${systemInfo.OperatingSystem || 'Unknown'}

*统计:*
• 用户总数：${users.length}
• 活跃会话：${sessions.length}

*运行时间:* ${formatUptime(systemInfo.StartupTime)}
    `.trim();
    
    await sendMessage(chatId, statusText);
  } catch (error) {
    await sendMessage(chatId, `❌ 获取状态失败：${error.message}`);
  }
});

/**
 * /myaccount - 我的账号
 */
bot.onText(/\/myaccount/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    if (!db) {
      await sendMessage(chatId, '❌ 数据库未初始化，请联系管理员');
      return;
    }
    
    const user = await db.getUserByTelegramId(userId.toString());
    
    if (!user) {
      await sendMessage(chatId, `
⚠️ *未找到关联账号*

您的 Telegram 账号尚未绑定 Emby 账号。

请联系管理员获取帮助，或使用 /register 注册。
      `.trim());
      return;
    }
    
    const embyUser = await emby.getUser(user.emby_id);
    
    await sendMessage(chatId, `
👤 *我的账号*

*用户名:* ${embyUser.Name || user.username}
*邮箱:* ${user.email || '未设置'}
*管理员:* ${user.is_admin ? '是' : '否'}
*状态:* ${user.is_active ? '✅ 活跃' : '❌ 已禁用'}

*Emby 用户 ID:* \`${user.emby_id}\`
      `.trim());
  } catch (error) {
    await sendMessage(chatId, `❌ 获取账号失败：${error.message}`);
  }
});

/**
 * /admin - 管理面板 (仅管理员)
 */
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) {
    await sendMessage(chatId, '❌ 权限不足：此命令仅限管理员使用');
    return;
  }
  
  const adminText = `
🔧 *管理面板*

请选择操作:
    `.trim();
  
  const buttons = [
    [{ text: '👥 用户管理', callback_data: 'admin_users' }],
    [{ text: '📊 会话监控', callback_data: 'admin_sessions' }],
    [{ text: '🖥️ 服务器信息', callback_data: 'admin_server' }],
    [{ text: '📝 操作日志', callback_data: 'admin_logs' }]
  ];
  
  await sendMessageWithButtons(chatId, adminText, buttons);
});

// ============ 回调查询处理 ============

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (!isAdmin(query.from.id)) {
    await bot.answerCallbackQuery(query.id, { text: '权限不足' });
    return;
  }
  
  switch (data) {
    case 'admin_users':
      await handleAdminUsers(chatId);
      break;
    case 'admin_sessions':
      await handleAdminSessions(chatId);
      break;
    case 'admin_server':
      await handleAdminServer(chatId);
      break;
    case 'admin_logs':
      await handleAdminLogs(chatId);
      break;
  }
  
  await bot.answerCallbackQuery(query.id);
});

/**
 * 处理用户管理
 */
async function handleAdminUsers(chatId) {
  try {
    const users = await emby.getUsers();
    
    if (users.length === 0) {
      await sendMessage(chatId, '暂无用户');
      return;
    }
    
    const userList = users.slice(0, 10).map((u, i) => 
      `${i + 1}. ${u.Name} (\`${u.Id}\`)`
    ).join('\n');
    
    const text = `
👥 *用户管理* (显示前 10 个)

${userList}

*操作:*
• 创建用户：/createuser <用户名>
• 删除用户：/deleteuser <用户 ID>
• 重置密码：/resetpw <用户 ID>
    `.trim();
    
    const buttons = [
      [{ text: '➕ 创建用户', callback_data: 'admin_create_user' }],
      [{ text: '🔙 返回管理面板', callback_data: 'admin' }]
    ];
    
    await sendMessageWithButtons(chatId, text, buttons);
  } catch (error) {
    await sendMessage(chatId, `❌ 获取用户列表失败：${error.message}`);
  }
}

/**
 * 处理会话监控
 */
async function handleAdminSessions(chatId) {
  try {
    const sessions = await emby.getSessions();
    
    if (sessions.length === 0) {
      await sendMessage(chatId, '✅ 当前无活跃会话');
      return;
    }
    
    const sessionList = sessions.map((s, i) => 
      `${i + 1}. ${s.UserName || '未知'} - ${s.DeviceName || '未知设备'}`
    ).join('\n');
    
    const text = `
📊 *活跃会话* (${sessions.length})

${sessionList}

*操作:*
• 停止会话：/stopsession <会话 ID>
    `.trim();
    
    await sendMessage(chatId, text);
  } catch (error) {
    await sendMessage(chatId, `❌ 获取会话失败：${error.message}`);
  }
}

/**
 * 处理服务器信息
 */
async function handleAdminServer(chatId) {
  try {
    const info = await emby.getSystemInfo();
    
    const text = `
🖥️ *服务器详细信息*

*名称:* ${info.ServerName}
*版本:* ${info.Version}
*系统:* ${info.OperatingSystem} ${info.OperatingSystemVersion}
*架构:* ${info.SystemArchitecture}
*CPU:* ${info.CpuAlphabet} (核心数：${info.LogicalCpuCount})
*内存:* ${formatBytes(info.TranscoderMemoryLimit || 0)}

*启动时间:* ${new Date(info.StartupTime).toLocaleString('zh-CN')}
    `.trim();
    
    await sendMessage(chatId, text);
  } catch (error) {
    await sendMessage(chatId, `❌ 获取服务器信息失败：${error.message}`);
  }
}

/**
 * 处理日志
 */
async function handleAdminLogs(chatId) {
  if (!db) {
    await sendMessage(chatId, '❌ 数据库未初始化');
    return;
  }
  
  try {
    const logs = await db.getLogs(null, 10);
    
    if (logs.length === 0) {
      await sendMessage(chatId, '暂无日志记录');
      return;
    }
    
    const logList = logs.map(log => 
      `• [${new Date(log.created_at).toLocaleString()}] ${log.action}`
    ).join('\n');
    
    await sendMessage(chatId, `📝 *最近日志*\n\n${logList}`);
  } catch (error) {
    await sendMessage(chatId, `❌ 获取日志失败：${error.message}`);
  }
}

// ============ 其他命令 ============

/**
 * /createuser - 创建用户 (管理员)
 */
bot.onText(/\/createuser (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) {
    await sendMessage(chatId, '❌ 权限不足');
    return;
  }
  
  const username = match[1].trim();
  
  try {
    const user = await emby.createUser(username);
    await sendMessage(chatId, `✅ 用户创建成功!\n\n*用户名:* ${user.Name}\n*ID:* \`${user.Id}\``);
  } catch (error) {
    await sendMessage(chatId, `❌ 创建失败：${error.message}`);
  }
});

/**
 * /deleteuser - 删除用户 (管理员)
 */
bot.onText(/\/deleteuser (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) {
    await sendMessage(chatId, '❌ 权限不足');
    return;
  }
  
  const userId = match[1].trim();
  
  try {
    await emby.deleteUser(userId);
    await sendMessage(chatId, `✅ 用户已删除`);
  } catch (error) {
    await sendMessage(chatId, `❌ 删除失败：${error.message}`);
  }
});

/**
 * /stopsession - 停止会话 (管理员)
 */
bot.onText(/\/stopsession (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) {
    await sendMessage(chatId, '❌ 权限不足');
    return;
  }
  
  const sessionId = match[1].trim();
  
  try {
    await emby.stopSession(sessionId);
    await sendMessage(chatId, `✅ 会话已停止`);
  } catch (error) {
    await sendMessage(chatId, `❌ 停止失败：${error.message}`);
  }
});

// ============ 工具函数 ============

function formatUptime(startTime) {
  if (!startTime) return '未知';
  const ms = Date.now() - new Date(startTime).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}天 ${hours % 24}小时`;
  }
  return `${hours}小时`;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============ 启动 ============

async function start() {
  console.log('[Bot] Starting Telegram Bot...');
  
  try {
    db = await initDatabase();
    console.log('[Bot] Database initialized');
  } catch (error) {
    console.error('[Bot] Database initialization failed:', error.message);
  }
  
  const botInfo = await bot.getMe();
  console.log(`[Bot] Logged in as @${botInfo.username}`);
  console.log(`[Bot] Admin IDs: ${ADMIN_IDS.length > 0 ? ADMIN_IDS.join(', ') : 'None configured'}`);
}

start().catch(console.error);
