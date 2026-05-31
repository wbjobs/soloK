import redis
import json
import hashlib
from typing import Optional, Any
from .config import get_settings

settings = get_settings()


class RedisCache:
    def __init__(self):
        self.redis_client = redis.from_url(settings.REDIS_URL)
        self.ttl = settings.CACHE_TTL

    def _generate_key(self, prefix: str, params: dict) -> str:
        params_str = json.dumps(params, sort_keys=True)
        hash_obj = hashlib.md5(params_str.encode())
        return f"{prefix}:{hash_obj.hexdigest()}"

    def get(self, prefix: str, params: dict) -> Optional[Any]:
        key = self._generate_key(prefix, params)
        data = self.redis_client.get(key)
        if data:
            return json.loads(data)
        return None

    def set(self, prefix: str, params: dict, value: Any) -> None:
        key = self._generate_key(prefix, params)
        self.redis_client.setex(key, self.ttl, json.dumps(value))


cache = RedisCache()
