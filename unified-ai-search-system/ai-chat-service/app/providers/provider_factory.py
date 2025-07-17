# app/providers/provider_factory.py
"""
Provider Factory for standardized provider instantiation with environment-based config and validation.
"""
import logging
from typing import Optional

from app.core.config import get_settings
from app.providers.brave_search_provider import BraveSearchProvider
from app.providers.brave_search_provider import ProviderConfig as BraveConfig
from app.providers.scrapingbee_provider import ProviderConfig as ScrapingBeeConfig
from app.providers.scrapingbee_provider import ScrapingBeeProvider

logger = logging.getLogger(__name__)


def create_brave_search_provider() -> Optional[BraveSearchProvider]:
    settings = get_settings()
    api_key = settings.brave_search_api_key or getattr(settings, "BRAVE_API_KEY", None)
    
    if not api_key:
        logger.warning("Brave Search API key is missing in settings.")
        return None
        
    # Check for demo/test keys
    if api_key.startswith("demo_") or api_key == "your_brave_key_here":
        logger.info("Demo Brave Search API key detected - provider will use fallback mode")
        # Still create provider but it will gracefully handle demo keys
        
    config = BraveConfig(api_key=api_key, cost_per_request=0.008, timeout=30)
    return BraveSearchProvider(config)


def create_scrapingbee_provider() -> Optional[ScrapingBeeProvider]:
    settings = get_settings()
    api_key = settings.scrapingbee_api_key or getattr(
        settings, "SCRAPINGBEE_API_KEY", None
    )
    
    if not api_key:
        logger.warning("ScrapingBee API key is missing in settings.")
        return None
        
    # Check for demo/test keys
    if api_key.startswith("demo_") or api_key == "your_scrapingbee_key_here":
        logger.info("Demo ScrapingBee API key detected - provider will use fallback mode")
        # Still create provider but it will gracefully handle demo keys
        
    config = ScrapingBeeConfig(api_key=api_key, cost_per_request=0.002, timeout=60)
    return ScrapingBeeProvider(config)


def create_demo_search_provider():
    """Create a demo search provider for testing when no real API keys are available"""
    from app.providers.search_providers import DuckDuckGoProvider
    logger.info("Creating demo search provider using DuckDuckGo fallback")
    return DuckDuckGoProvider()
