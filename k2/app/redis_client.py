import redis
from .config import get_settings

settings = get_settings()

redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)


def get_redis():
    return redis_client
