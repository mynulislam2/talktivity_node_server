"""
Configuration classes for the voice agent.
Provides type-safe configuration with validation.
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class DatabaseConfig:
    """PostgreSQL database configuration."""
    
    host: str
    port: int
    user: str
    password: str
    database: str
    ssl: bool = True
    
    @classmethod
    def from_env(cls) -> 'DatabaseConfig':
        """Load and validate database configuration from environment."""
        host = os.getenv("PG_HOST")
        if not host:
            raise ValueError("PG_HOST environment variable is required")
        
        user = os.getenv("PG_USER")
        if not user:
            raise ValueError("PG_USER environment variable is required")
        
        password = os.getenv("PG_PASSWORD")
        if not password:
            raise ValueError("PG_PASSWORD environment variable is required")
        
        database = os.getenv("PG_DATABASE")
        if not database:
            raise ValueError("PG_DATABASE environment variable is required")
        
        return cls(
            host=host,
            port=int(os.getenv("PG_PORT", "5432")),
            user=user,
            password=password,
            database=database,
            ssl=os.getenv("PG_SSL", "true").lower() == "true",
        )


@dataclass
class GoogleConfig:
    """Google AI/Cloud configuration."""
    
    api_key: str
    credentials_path: Optional[str] = None
    cloud_project: Optional[str] = None
    cloud_location: Optional[str] = None
    
    @classmethod
    def from_env(cls) -> 'GoogleConfig':
        """Load Google configuration from environment."""
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY environment variable is required")
        
        # Set credentials path in environment if provided
        credentials_path = os.getenv(
            "GOOGLE_APPLICATION_CREDENTIALS",
            "./credentials/google-tts-key.json"
        )
        
        if credentials_path:
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path
        
        return cls(
            api_key=api_key,
            credentials_path=credentials_path,
            cloud_project=os.getenv("GOOGLE_CLOUD_PROJECT"),
            cloud_location=os.getenv("GOOGLE_CLOUD_LOCATION"),
        )


@dataclass
class SecurityConfig:
    """Security and authentication configuration."""
    
    jwt_secret: str
    
    @classmethod
    def from_env(cls) -> 'SecurityConfig':
        """Load security configuration from environment."""
        jwt_secret = os.getenv("JWT_SECRET")
        if not jwt_secret:
            raise ValueError("JWT_SECRET environment variable is required")
        
        return cls(jwt_secret=jwt_secret)


@dataclass
class ApiConfig:
    """External API configuration."""
    
    node_api_url: str
    
    @classmethod
    def from_env(cls) -> 'ApiConfig':
        """Load API configuration from environment."""
        return cls(
            node_api_url=os.getenv("API_URL", "http://localhost:8082"),
        )


@dataclass
class Config:
    """Main application configuration."""
    
    database: DatabaseConfig
    google: GoogleConfig
    security: SecurityConfig
    api: ApiConfig
    
    @classmethod
    def from_env(cls) -> 'Config':
        """Load all configuration from environment variables."""
        return cls(
            database=DatabaseConfig.from_env(),
            google=GoogleConfig.from_env(),
            security=SecurityConfig.from_env(),
            api=ApiConfig.from_env(),
        )
