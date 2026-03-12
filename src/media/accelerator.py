"""
EmbyHub Pro - 三级智能播放加速系统
原创实现，参考网盘媒体加速架构逻辑
"""

import asyncio
import hashlib
import time
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import aiohttp


class MediaAccelerator:
    """三级智能播放加速引擎"""
    
    def __init__(self, db, config):
        self.db = db
        self.config = config
        self.cache = {}  # 内存缓存
        
    async def get_play_url(self, user_id: int, file_sha1: str, file_name: str = None) -> Dict[str, Any]:
        """
        获取播放 URL - 三级智能加速
        
        Returns:
            {
                "url": "播放直链",
                "accel_level": 1/2/3,  # 加速层级
                "response_time": 50,    # 响应时间 (ms)
                "source": "user/self|user/other|source"
            }
        """
        start_time = time.time()
        result = {
            "url": None,
            "accel_level": 0,
            "response_time": 0,
            "source": ""
        }
        
        # STEP 1: 检查用户自有文件 (目标 <50ms)
        result = await self._step1_user_file(user_id, file_sha1)
        if result["url"]:
            result["accel_level"] = 1
            result["response_time"] = int((time.time() - start_time) * 1000)
            return result
        
        # STEP 2: 用户间智能秒传 (目标 <5ms)
        result = await self._step2_peer_transfer(user_id, file_sha1)
        if result["url"]:
            result["accel_level"] = 2
            result["response_time"] = int((time.time() - start_time) * 1000)
            # 记录加速缓存
            await self._record_accel_cache(file_sha1, user_id, result["response_time"])
            return result
        
        # STEP 3: 源网盘兜底
        result = await self._step3_source_transfer(user_id, file_sha1, file_name)
        result["accel_level"] = 3
        result["response_time"] = int((time.time() - start_time) * 1000)
        return result
    
    async def _step1_user_file(self, user_id: int, file_sha1: str) -> Dict[str, Any]:
        """STEP 1: 检查用户自有文件"""
        # 查询用户是否有该文件
        cookie = await self._get_user_cookie(user_id)
        if not cookie:
            return {"url": None, "source": ""}
        
        # 调用网盘 API 检查文件
        file_info = await self._check_drive_file(cookie, file_sha1)
        if file_info and file_info.get("exists"):
            # 获取直链
            play_url = await self._get_direct_link(cookie, file_info["file_id"])
            if play_url:
                # 记录播放记录
                await self._record_play(user_id, file_sha1, file_info.get("name"))
                return {"url": play_url, "source": "user/self"}
        
        return {"url": None, "source": ""}
    
    async def _step2_peer_transfer(self, user_id: int, file_sha1: str) -> Dict[str, Any]:
        """STEP 2: 用户间智能秒传加速"""
        # 查询最近播放过该文件的其他用户 (24 小时内)
        peer_users = await self._find_recent_players(file_sha1, limit_hours=24, limit=5)
        
        for peer in peer_users:
            if peer["user_id"] == user_id:
                continue
            
            # 尝试从该用户秒传
            result = await self._quick_transfer(peer["user_id"], user_id, file_sha1)
            if result.get("success"):
                # 获取目标用户的直链
                target_cookie = await self._get_user_cookie(user_id)
                if target_cookie:
                    play_url = await self._get_direct_link(target_cookie, result["target_file_id"])
                    if play_url:
                        await self._record_play(user_id, file_sha1, peer.get("file_name"))
                        return {"url": play_url, "source": f"user/{peer['user_id']}"}
        
        return {"url": None, "source": ""}
    
    async def _step3_source_transfer(self, user_id: int, file_sha1: str, file_name: str = None) -> Dict[str, Any]:
        """STEP 3: 源网盘兜底传输"""
        # 获取源网盘 Cookie
        source_cookie = self.config.get("source_drive_cookie")
        if not source_cookie:
            return {"url": None, "source": "error/no_source"}
        
        # 源网盘秒传到用户
        target_cookie = await self._get_user_cookie(user_id)
        if not target_cookie:
            return {"url": None, "source": "error/no_user_cookie"}
        
        # 执行秒传
        transfer_result = await self._source_to_user_transfer(
            source_cookie, target_cookie, file_sha1, file_name
        )
        
        if transfer_result.get("success"):
            # 获取直链
            play_url = await self._get_direct_link(target_cookie, transfer_result["target_file_id"])
            if play_url:
                await self._record_play(user_id, file_sha1, file_name)
                return {"url": play_url, "source": "source"}
        
        return {"url": None, "source": "error/transfer_failed"}
    
    # ========== 数据库操作 ==========
    
    async def _record_play(self, user_id: int, file_sha1: str, file_name: str = None):
        """记录播放历史"""
        await self.db.query("""
            INSERT INTO play_records (user_id, file_sha1, file_name)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE 
                play_count = play_count + 1,
                last_played = NOW()
        """, (user_id, file_sha1, file_name))
    
    async def _find_recent_players(self, file_sha1: str, limit_hours: int = 24, limit: int = 5) -> list:
        """查找最近播放过该文件的用户"""
        rows = await self.db.query("""
            SELECT user_id, file_name, last_played, play_count
            FROM play_records
            WHERE file_sha1 = %s 
              AND last_played >= DATE_SUB(NOW(), INTERVAL %s HOUR)
              AND user_id != %s
            ORDER BY last_played DESC
            LIMIT %s
        """, (file_sha1, limit_hours, limit))
        return [dict(row) for row in rows] if rows else []
    
    async def _record_accel_cache(self, file_sha1: str, user_id: int, response_time: int):
        """记录加速缓存"""
        await self.db.query("""
            INSERT INTO accel_cache (file_sha1, target_user_id, transfer_time)
            VALUES (%s, %s, %s)
        """, (file_sha1, user_id, response_time))
    
    async def _get_user_cookie(self, user_id: int) -> Optional[Dict]:
        """获取用户网盘 Cookie（解密）"""
        row = await self.db.query("""
            SELECT cookie_encrypted, drive_type 
            FROM user_drive_cookies 
            WHERE user_id = %s
        """, (user_id,))
        if not row:
            return None
        
        # 解密 Cookie
        from src.utils.cookie_encrypt import CookieEncryptor
        encryptor = CookieEncryptor(self.config["cookie_encrypt_key"])
        try:
            decrypted = encryptor.decrypt(row[0]["cookie_encrypted"])
            return json.loads(decrypted)
        except:
            return None
    
    async def _save_user_cookie(self, user_id: int, cookie_json: Dict, drive_type: str = "115"):
        """保存用户网盘 Cookie（加密）"""
        from src.utils.cookie_encrypt import CookieEncryptor
        encryptor = CookieEncryptor(self.config["cookie_encrypt_key"])
        encrypted = encryptor.encrypt(json.dumps(cookie_json))
        
        await self.db.query("""
            INSERT INTO user_drive_cookies (user_id, cookie_encrypted, drive_type)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE cookie_encrypted = VALUES(cookie_encrypted)
        """, (user_id, encrypted, drive_type))
    
    # ========== 网盘 API 封装（待实现）==========
    
    async def _check_drive_file(self, cookie: Dict, file_sha1: str) -> Optional[Dict]:
        """检查网盘文件是否存在"""
        # TODO: 实现具体网盘 API（115/阿里云盘等）
        pass
    
    async def _get_direct_link(self, cookie: Dict, file_id: str) -> Optional[str]:
        """获取网盘直链"""
        # TODO: 实现具体网盘 API
        pass
    
    async def _quick_transfer(self, from_user_id: int, to_user_id: int, file_sha1: str) -> Dict:
        """用户间秒传"""
        # TODO: 实现秒传逻辑
        pass
    
    async def _source_to_user_transfer(self, source_cookie: Dict, target_cookie: Dict, 
                                        file_sha1: str, file_name: str) -> Dict:
        """源网盘到用户网盘传输"""
        # TODO: 实现源传输逻辑
        pass


class AcceleratorStats:
    """加速统计"""
    
    def __init__(self, db):
        self.db = db
    
    async def get_stats(self, user_id: int = None) -> Dict:
        """获取加速统计"""
        if user_id:
            # 个人统计
            stats = await self.db.query("""
                SELECT 
                    COUNT(DISTINCT file_sha1) as total_files,
                    COUNT(*) as total_plays,
                    AVG(response_time) as avg_response_time
                FROM accel_cache
                WHERE target_user_id = %s
            """, (user_id,))
        else:
            # 全局统计
            stats = await self.db.query("""
                SELECT 
                    COUNT(DISTINCT file_sha1) as total_files,
                    COUNT(*) as total_transfers,
                    AVG(response_time) as avg_response_time
                FROM accel_cache
            """)
        
        return dict(stats[0]) if stats else {}
