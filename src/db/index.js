/**
 * 数据库抽象层 - MySQL Only
 */

const MySQLAdapter = require('./mysql');

let dbInstance = null;

/**
 * 获取数据库实例
 */
function getDatabase() {
  if (!dbInstance) {
    dbInstance = new MySQLAdapter();
    dbInstance.connect();
  }
  return dbInstance;
}

/**
 * 初始化数据库
 */
async function initDatabase() {
  const db = getDatabase();
  await db.initialize();
  return db;
}

module.exports = {
  getDatabase,
  initDatabase,
  MySQLAdapter
};