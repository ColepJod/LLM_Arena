"""Simple in-memory per-IP rate limiting."""

import asyncio
import math
import time
from collections import defaultdict, deque
from collections.abc import Callable
from functools import lru_cache

from fastapi import HTTPException, Request, status

from app.core.config import get_settings


class InMemoryRateLimiter:
    """Fixed-window rate limiter backed by monotonic timestamps.

    The limiter is deliberately process-local. It is basic abuse protection
    for this single-process development app, not a distributed rate limiter.
    """

    def __init__(
        self,
        limit: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._limit = max(1, limit)
        self._window = max(1.0, window_seconds)
        self._clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> int | None:
        """Record a hit.

        Return ``None`` when allowed, otherwise the number of seconds until
        the next request should be attempted.
        """
        now = self._clock()
        cutoff = now - self._window
        async with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= self._limit:
                retry_after = max(1, math.ceil(bucket[0] + self._window - now))
                return retry_after
            bucket.append(now)
            return None

    async def clear(self) -> None:
        """Clear all buckets. Used by tests."""
        async with self._lock:
            self._hits.clear()


@lru_cache
def get_rate_limiter() -> InMemoryRateLimiter:
    """Return the process-wide limiter configured from the environment."""
    settings = get_settings()
    return InMemoryRateLimiter(
        limit=settings.rate_limit_requests,
        window_seconds=settings.rate_limit_window_seconds,
    )


async def enforce_compare_rate_limit(request: Request) -> None:
    """FastAPI dependency enforcing the per-IP POST /compare limit."""
    client_ip = request.client.host if request.client else "unknown"
    retry_after = await get_rate_limiter().check(client_ip)
    if retry_after is None:
        return
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many comparison requests. Please wait and try again.",
        headers={"Retry-After": str(retry_after)},
    )
