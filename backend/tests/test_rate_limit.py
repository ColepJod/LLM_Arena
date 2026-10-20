import pytest

from app.core.rate_limit import InMemoryRateLimiter


@pytest.mark.asyncio
async def test_rate_limiter_allows_then_rejects() -> None:
    now = [100.0]
    limiter = InMemoryRateLimiter(limit=2, window_seconds=10, clock=lambda: now[0])

    assert await limiter.check("1.2.3.4") is None
    assert await limiter.check("1.2.3.4") is None
    assert await limiter.check("1.2.3.4") == 10
    assert await limiter.check("5.6.7.8") is None

    now[0] += 10.1
    assert await limiter.check("1.2.3.4") is None


@pytest.mark.asyncio
async def test_rate_limiter_clear() -> None:
    limiter = InMemoryRateLimiter(limit=1, window_seconds=60)
    assert await limiter.check("ip") is None
    assert await limiter.check("ip") is not None
    await limiter.clear()
    assert await limiter.check("ip") is None
