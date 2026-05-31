import redis
import json
from typing import Optional, Any
from config import settings


class RedisCache:
    def __init__(self):
        self.redis_client = redis.from_url(settings.REDIS_URL)

    def get(self, key: str) -> Optional[Any]:
        try:
            data = self.redis_client.get(key)
            if data:
                return json.loads(data)
            return None
        except Exception:
            return None

    def set(self, key: str, value: Any, expire: int = 3600) -> bool:
        try:
            self.redis_client.setex(key, expire, json.dumps(value))
            return True
        except Exception:
            return False

    def delete(self, key: str) -> bool:
        try:
            self.redis_client.delete(key)
            return True
        except Exception:
            return False

    def clear_pattern(self, pattern: str) -> int:
        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                return self.redis_client.delete(*keys)
            return 0
        except Exception:
            return 0


cache = RedisCache()
