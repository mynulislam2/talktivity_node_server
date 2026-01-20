"""
Environment variable loaders with validation.
"""

import logging
import os
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)


def load_environment() -> bool:
    """
    Load environment variables from .env file.
    
    Returns:
        True if .env file was found and loaded, False otherwise.
    """
    # Find .env file
    env_path = Path(__file__).parent.parent / ".env"
    
    # Load environment
    loaded = load_dotenv(env_path)
    
    if loaded:
        logger.info("✅ Environment variables loaded from .env file")
    else:
        logger.warning("⚠️ No .env file found, using system environment variables")
    
    return loaded


def validate_google_credentials() -> bool:
    """
    Validate Google credentials file exists.
    
    Returns:
        True if credentials file exists, False otherwise.
    """
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    
    if not credentials_path:
        logger.warning("⚠️ GOOGLE_APPLICATION_CREDENTIALS not set")
        return False
    
    if not Path(credentials_path).exists():
        logger.warning(
            f"⚠️ Google credentials file not found: {credentials_path}"
        )
        return False
    
    logger.info(f"✅ Google credentials file found: {credentials_path}")
    return True


def log_configuration_summary(config) -> None:
    """
    Log configuration summary (without sensitive data).
    
    Args:
        config: Configuration object to log.
    """
    logger.info("=" * 50)
    logger.info("CONFIGURATION SUMMARY")
    logger.info("=" * 50)
    
    # Database
    logger.info(
        f"Database: {config.database.user}@{config.database.host}:{config.database.port}/{config.database.database}"
    )
    
    # Google
    if config.google.credentials_path:
        logger.info(f"Google Credentials: {config.google.credentials_path}")
    logger.info(f"Google API Key: {'*' * 10}{config.google.api_key[-4:]}")
    
    # API
    logger.info(f"Node.js API URL: {config.api.node_api_url}")
    
    # Security
    logger.info(f"JWT Secret: {'*' * 10}{config.security.jwt_secret[-4:]}")
    
    logger.info("=" * 50)
