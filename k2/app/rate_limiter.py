import time
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from .redis_client import get_redis
from .config import get_settings


class RateLimiter:
    def __init__(self):
        self.redis = get_redis()
        self.settings = get_settings()
        self.window_size = 60
        self.max_requests = self.settings.RATE_LIMIT_PER_MINUTE

    def is_allowed(self, ip: str) -> tuple[bool, int]:
        current_time = int(time.time())
        window_key = f"rate_limit:{ip}:{current_time // self.window_size}"
        
        current_count = self.redis.incr(window_key)
        
        if current_count == 1:
            self.redis.expire(window_key, self.window_size)
        
        if current_count > self.max_requests:
            return False, current_count
        
        remaining = self.max_requests - current_count
        return True, remaining


rate_limiter = RateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in ["/docs", "/openapi.json", "/redoc"]:
            response = await call_next(request)
            return response

        client_ip = request.client.host if request.client else "127.0.0.1"
        
        allowed, remaining = rate_limiter.is_allowed(client_ip)
        
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"请求过于频繁，请稍后再试。每分钟最多{rate_limiter.max_requests}次请求。"
            )
        
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(rate_limiter.max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
