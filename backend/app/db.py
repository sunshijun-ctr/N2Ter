from collections.abc import AsyncGenerator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core import get_settings


class Base(DeclarativeBase):
    pass


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    AsyncSessionLocal = get_sessionmaker()
    async with AsyncSessionLocal() as session:
        yield session
