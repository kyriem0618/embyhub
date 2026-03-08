/**
 * 数据库抽象层
 * 支持 SQLite (开发) 和 MySQL (生产)
 */

const DatabaseAdapter = require('./adapter');

let dbInstance = null;

/**
 * 获取数据库实例
 */
function getDatabase() {
  if (!dbInstance) {
    const dbType = process.env.DB_TYPE || 'sqlite';
    
    if (dbType === 'mysql') {
      dbInstance = new (require('./mysql'))();
    } else {
      dbInstance = new (require('./sqlite'))();
    }
    
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
  DatabaseAdapter
};
