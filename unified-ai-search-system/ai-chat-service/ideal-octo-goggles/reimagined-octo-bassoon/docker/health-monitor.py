#!/usr/bin/env python3
"""
Health monitoring script for the unified AI system.
Monitors both services and provides status reporting.
"""

import asyncio
import aiohttp
import time
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class UnifiedHealthMonitor:
    def __init__(self):
        self.services = {
            'ubiquitous': 'http://localhost:8000/health',
            'ideal-octo': 'http://localhost:8001/health'
        }
        self.check_interval = 30  # seconds
        
    async def check_service(self, name, url):
        """Check the health of a single service"""
        try:
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"✅ {name} is healthy: {data.get('status', 'unknown')}")
                        return True
                    else:
                        logger.warning(f"⚠️  {name} returned status {response.status}")
                        return False
        except Exception as e:
            logger.error(f"❌ {name} health check failed: {e}")
            return False
    
    async def check_all_services(self):
        """Check all services and return overall status"""
        results = {}
        for name, url in self.services.items():
            results[name] = await self.check_service(name, url)
        
        healthy_count = sum(1 for status in results.values() if status)
        total_count = len(results)
        
        logger.info(f"📊 System Status: {healthy_count}/{total_count} services healthy")
        
        return results
    
    async def monitor_loop(self):
        """Main monitoring loop"""
        logger.info("🚀 Starting Unified AI System Health Monitor")
        
        while True:
            try:
                await self.check_all_services()
                await asyncio.sleep(self.check_interval)
            except KeyboardInterrupt:
                logger.info("🛑 Health monitor stopping...")
                break
            except Exception as e:
                logger.error(f"❌ Monitor error: {e}")
                await asyncio.sleep(5)  # Short sleep before retry

if __name__ == "__main__":
    monitor = UnifiedHealthMonitor()
    asyncio.run(monitor.monitor_loop())
