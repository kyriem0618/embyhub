"""
Cookie 加密存储工具
二进制加密，确保用户网盘凭证安全
"""

import base64
import hashlib
import json
from cryptography.fernet import Fernet
from typing import Dict, Any


class CookieEncryptor:
    """Cookie 加密/解密器"""
    
    def __init__(self, key: str):
        """
        初始化加密器
        
        Args:
            key: 加密密钥（建议使用 32 位以上随机字符串）
        """
        # 将密钥转换为 Fernet 兼容的 32 字节 base64 编码
        self.key = hashlib.sha256(key.encode()).digest()
        self.key_b64 = base64.urlsafe_b64encode(self.key)
        self.cipher = Fernet(self.key_b64)
    
    def encrypt(self, cookie_json: str) -> bytes:
        """
        加密 Cookie JSON
        
        Args:
            cookie_json: Cookie JSON 字符串
            
        Returns:
            加密后的二进制数据
        """
        if isinstance(cookie_json, dict):
            cookie_json = json.dumps(cookie_json)
        
        return self.cipher.encrypt(cookie_json.encode('utf-8'))
    
    def decrypt(self, encrypted_data: bytes) -> str:
        """
        解密 Cookie
        
        Args:
            encrypted_data: 加密的二进制数据
            
        Returns:
            解密后的 JSON 字符串
        """
        decrypted = self.cipher.decrypt(encrypted_data)
        return decrypted.decode('utf-8')
    
    def decrypt_to_dict(self, encrypted_data: bytes) -> Dict[str, Any]:
        """
        解密 Cookie 为字典
        
        Args:
            encrypted_data: 加密的二进制数据
            
        Returns:
            解密后的字典
        """
        json_str = self.decrypt(encrypted_data)
        return json.loads(json_str)


class CookieManager:
    """Cookie 管理器（高级封装）"""
    
    def __init__(self, encryptor: CookieEncryptor):
        self.encryptor = encryptor
        self._cache = {}  # 内存缓存
    
    def save(self, user_id: int, cookie: Dict[str, Any], drive_type: str = "115"):
        """
        保存用户 Cookie
        
        Args:
            user_id: 用户 ID
            cookie: Cookie 字典
            drive_type: 网盘类型 (115/aliyun/123pan 等)
        """
        encrypted = self.encryptor.encrypt(cookie)
        # 存入数据库（由上层调用）
        return {
            "user_id": user_id,
            "cookie_encrypted": encrypted,
            "drive_type": drive_type
        }
    
    def load(self, user_id: int, encrypted_data: bytes) -> Dict[str, Any]:
        """
        加载用户 Cookie
        
        Args:
            user_id: 用户 ID
            encrypted_data: 加密数据
            
        Returns:
            Cookie 字典
        """
        # 检查缓存
        cache_key = f"{user_id}:{hash(encrypted_data)}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        # 解密
        cookie = self.encryptor.decrypt_to_dict(encrypted_data)
        
        # 缓存（10 分钟）
        self._cache[cache_key] = cookie
        return cookie
    
    def validate(self, cookie: Dict[str, Any]) -> bool:
        """
        验证 Cookie 是否有效
        
        Args:
            cookie: Cookie 字典
            
        Returns:
            是否有效
        """
        # 检查必要字段
        required_fields = ["cookie", "user_agent"]
        for field in required_fields:
            if field not in cookie:
                return False
        
        # 检查过期时间（如果有）
        if "expires" in cookie:
            try:
                expires = int(cookie["expires"])
                if expires < time.time():
                    return False
            except:
                pass
        
        return True
    
    def refresh_cache(self, user_id: int):
        """刷新用户缓存"""
        keys_to_remove = [k for k in self._cache if k.startswith(f"{user_id}:")]
        for key in keys_to_remove:
            del self._cache[key]


# ========== 使用示例 ==========

if __name__ == "__main__":
    # 示例用法
    encrypt_key = "your-secret-key-at-least-32-chars-long"
    encryptor = CookieEncryptor(encrypt_key)
    manager = CookieManager(encryptor)
    
    # 模拟 Cookie
    test_cookie = {
        "cookie": "UID=xxx; CID=yyy; SEID=zzz",
        "user_agent": "Mozilla/5.0 ...",
        "expires": int(time.time()) + 86400 * 30  # 30 天
    }
    
    # 加密保存
    encrypted = encryptor.encrypt(test_cookie)
    print(f"加密后长度：{len(encrypted)} bytes")
    
    # 解密读取
    decrypted = manager.load(123, encrypted)
    print(f"解密后：{decrypted}")
    
    # 验证
    is_valid = manager.validate(decrypted)
    print(f"Cookie 有效：{is_valid}")
