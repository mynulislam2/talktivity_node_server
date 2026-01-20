"""
Logging utilities for the voice agent.
Provides consistent logging across all modules.
"""

import logging
import sys
from typing import Optional


def setup_logging(level: int = logging.INFO, name: Optional[str] = None) -> logging.Logger:
    """
    Setup and configure logger for the application.
    
    Args:
        level: Logging level (DEBUG, INFO, WARNING, ERROR)
        name: Logger name (defaults to root logger)
        
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name or "voice-assistant")
    
    # Don't add handlers if already configured
    if logger.handlers:
        return logger
    
    # Create handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    
    # Add handler to logger
    logger.addHandler(handler)
    logger.setLevel(level)
    
    # Prevent propagation to root logger
    logger.propagate = False
    
    return logger


def get_logger(module_name: str) -> logging.Logger:
    """
    Get logger for a specific module.
    
    Args:
        module_name: Name of the module (usually __name__)
        
    Returns:
        Logger instance for the module
    """
    return logging.getLogger(module_name)
