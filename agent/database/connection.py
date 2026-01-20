"""
Database connection pool management.
Provides async connection pooling with context managers.
"""

import asyncpg
import logging
from contextlib import asynccontextmanager
from typing import Optional

from config import DatabaseConfig

logger = logging.getLogger(__name__)


class DatabasePool:
    """
    Async database connection pool manager.
    
    Provides connection pooling to avoid creating new connections for each query.
    Uses async context managers for safe connection handling.
    """
    
    def __init__(self, config: DatabaseConfig, min_size: int = 5, max_size: int = 20):
        """
        Initialize database pool.
        
        Args:
            config: Database configuration
            min_size: Minimum number of connections in pool
            max_size: Maximum number of connections in pool
        """
        self.config = config
        self.min_size = min_size
        self.max_size = max_size
        self._pool: Optional[asyncpg.Pool] = None
    
    async def connect(self) -> asyncpg.Pool:
        """
        Get or create connection pool.
        
        Returns:
            Active connection pool
        """
        if self._pool is None:
            logger.info(
                f"Creating connection pool (min={self.min_size}, max={self.max_size})"
            )
            self._pool = await asyncpg.create_pool(
                host=self.config.host,
                port=self.config.port,
                user=self.config.user,
                password=self.config.password,
                database=self.config.database,
                ssl=self.config.ssl,
                min_size=self.min_size,
                max_size=self.max_size,
                command_timeout=60,
            )
            logger.info("✅ Database connection pool created successfully")
        return self._pool
    
    async def close(self) -> None:
        """Close the connection pool."""
        if self._pool:
            logger.info("Closing database connection pool")
            await self._pool.close()
            self._pool = None
            logger.info("✅ Database connection pool closed")
    
    @asynccontextmanager
    async def acquire(self):
        """
        Async context manager for acquiring a connection from the pool.
        
        Usage:
            async with pool.acquire() as conn:
                result = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
        
        Yields:
            Database connection from pool
        """
        pool = await self.connect()
        async with pool.acquire() as connection:
            yield connection
    
    async def test_connection(self) -> bool:
        """
        Test database connectivity.
        
        Returns:
            True if connection successful, False otherwise
        """
        try:
            async with self.acquire() as conn:
                result = await conn.fetchval("SELECT 1")
                if result == 1:
                    logger.info("✅ Database connection test successful")
                    return True
            return False
        except Exception as e:
            logger.error(f"❌ Database connection test failed: {e}")
            return False


async def test_connection() -> bool:
    """
    Standalone function to test database connectivity.
    Creates a temporary connection pool and tests it.
    
    Returns:
        True if connection successful, False otherwise
    """
    from config import Config
    
    try:
        config = Config.from_env()
        pool = DatabasePool(config.database)
        result = await pool.test_connection()
        await pool.close()
        return result
    except Exception as e:
        logger.error(f"❌ Database test failed: {e}")
        return False
