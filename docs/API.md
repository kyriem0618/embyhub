# EmbyHub API 文档

## 基础信息

- **Base URL**: `http://localhost:3000/api`
- **认证**: JWT (待实现)
- **格式**: JSON

## 端点列表

### 系统

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/emby/test` | 测试 Emby 连接 |
| GET | `/emby/system` | 获取系统信息 |

### 用户管理

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/users` | 获取所有用户 |
| GET | `/users/:id` | 获取单个用户 |
| POST | `/users` | 创建用户 |
| PUT | `/users/:id` | 更新用户 |
| DELETE | `/users/:id` | 删除用户 |
| POST | `/users/:id/password` | 设置密码 |

### 会话管理

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/sessions` | 获取活跃会话 |
| POST | `/sessions/:id/stop` | 停止会话 |

## 请求示例

### 创建用户

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "testuser"}'
```

### 获取用户列表

```bash
curl http://localhost:3000/api/users
```

### 停止会话

```bash
curl -X POST http://localhost:3000/api/sessions/{sessionId}/stop
```

## 响应格式

成功响应：
```json
{
  "success": true,
  "data": { ... }
}
```

错误响应：
```json
{
  "success": false,
  "error": "错误信息"
}
```

## Emby API 参考

完整 Emby API 文档：https://dev.emby.media/doc/restapi/index.html
