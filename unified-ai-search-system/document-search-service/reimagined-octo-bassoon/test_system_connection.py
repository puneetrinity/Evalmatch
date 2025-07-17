#!/usr/bin/env python3
"""
System Connection Test Script
Tests the integration between ubiquitous-octo-invention and ideal-octo-goggles
"""

import asyncio
import aiohttp
import json
import time
from typing import Dict, Any
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SystemConnector:
    """Handles connection between the two AI systems"""
    
    def __init__(self):
        self.ubiquitous_url = "http://localhost:8000"  # ubiquitous-octo-invention
        self.ideal_url = "http://localhost:80"         # ideal-octo-goggles
        self.timeout = 30
        
    async def test_ubiquitous_health(self) -> Dict[str, Any]:
        """Test ubiquitous-octo-invention health"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.ubiquitous_url}/health/live", timeout=self.timeout) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info("✅ ubiquitous-octo-invention is healthy")
                        return {"status": "healthy", "data": data}
                    else:
                        logger.error(f"❌ ubiquitous-octo-invention health check failed: {response.status}")
                        return {"status": "unhealthy", "error": f"HTTP {response.status}"}
        except Exception as e:
            logger.error(f"❌ ubiquitous-octo-invention connection failed: {str(e)}")
            return {"status": "connection_failed", "error": str(e)}
    
    async def test_ideal_health(self) -> Dict[str, Any]:
        """Test ideal-octo-goggles health"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.ideal_url}/api/v2/health", timeout=self.timeout) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info("✅ ideal-octo-goggles is healthy")
                        return {"status": "healthy", "data": data}
                    else:
                        logger.error(f"❌ ideal-octo-goggles health check failed: {response.status}")
                        return {"status": "unhealthy", "error": f"HTTP {response.status}"}
        except Exception as e:
            logger.error(f"❌ ideal-octo-goggles connection failed: {str(e)}")
            return {"status": "connection_failed", "error": str(e)}
    
    async def test_document_search(self, query: str = "AI machine learning") -> Dict[str, Any]:
        """Test document search on ideal-octo-goggles"""
        try:
            payload = {
                "query": query,
                "num_results": 5,
                "search_type": "hybrid"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ideal_url}/api/v2/search/ultra-fast",
                    json=payload,
                    timeout=self.timeout
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"✅ Document search successful: {len(data.get('results', []))} results")
                        return {"status": "success", "data": data}
                    else:
                        logger.error(f"❌ Document search failed: {response.status}")
                        return {"status": "failed", "error": f"HTTP {response.status}"}
        except Exception as e:
            logger.error(f"❌ Document search error: {str(e)}")
            return {"status": "error", "error": str(e)}
    
    async def test_conversation_search(self, query: str = "Tell me about AI") -> Dict[str, Any]:
        """Test conversation search on ubiquitous-octo-invention"""
        try:
            payload = {
                "query": query,
                "use_search": True,
                "search_provider": "brave"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ubiquitous_url}/api/v1/search",
                    json=payload,
                    timeout=self.timeout
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info("✅ Conversation search successful")
                        return {"status": "success", "data": data}
                    else:
                        logger.error(f"❌ Conversation search failed: {response.status}")
                        return {"status": "failed", "error": f"HTTP {response.status}"}
        except Exception as e:
            logger.error(f"❌ Conversation search error: {str(e)}")
            return {"status": "error", "error": str(e)}
    
    async def test_integrated_workflow(self, query: str = "machine learning research papers") -> Dict[str, Any]:
        """Test integrated workflow: conversation system calling document search"""
        try:
            logger.info(f"🔄 Testing integrated workflow with query: '{query}'")
            
            # Step 1: Get document search results
            doc_results = await self.test_document_search(query)
            
            if doc_results["status"] != "success":
                return {"status": "failed", "error": "Document search failed", "details": doc_results}
            
            # Step 2: Use document results in conversation
            context = f"Based on document search results: {json.dumps(doc_results['data'], indent=2)}"
            
            conversation_payload = {
                "query": f"Based on the following search results, summarize the key findings: {query}",
                "context": context,
                "use_search": False  # We already have the search results
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ubiquitous_url}/api/v1/chat",
                    json=conversation_payload,
                    timeout=self.timeout
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info("✅ Integrated workflow successful")
                        return {
                            "status": "success",
                            "document_results": doc_results["data"],
                            "conversation_response": data
                        }
                    else:
                        logger.error(f"❌ Conversation processing failed: {response.status}")
                        return {"status": "failed", "error": f"HTTP {response.status}"}
        
        except Exception as e:
            logger.error(f"❌ Integrated workflow error: {str(e)}")
            return {"status": "error", "error": str(e)}

async def main():
    """Main test function"""
    print("🚀 Starting System Connection Test")
    print("=" * 60)
    
    connector = SystemConnector()
    
    # Test 1: Health checks
    print("\n🔍 Testing System Health...")
    ubiquitous_health = await connector.test_ubiquitous_health()
    ideal_health = await connector.test_ideal_health()
    
    if ubiquitous_health["status"] != "healthy" or ideal_health["status"] != "healthy":
        print("\n❌ One or both systems are not healthy. Please check the services.")
        print(f"ubiquitous-octo-invention: {ubiquitous_health['status']}")
        print(f"ideal-octo-goggles: {ideal_health['status']}")
        return
    
    print("\n✅ Both systems are healthy!")
    
    # Test 2: Individual system tests
    print("\n🔍 Testing Individual Systems...")
    
    # Test document search
    doc_search_result = await connector.test_document_search("artificial intelligence")
    print(f"Document Search: {doc_search_result['status']}")
    
    # Test conversation search
    conv_search_result = await connector.test_conversation_search("What is AI?")
    print(f"Conversation Search: {conv_search_result['status']}")
    
    # Test 3: Integrated workflow
    print("\n🔍 Testing Integrated Workflow...")
    integrated_result = await connector.test_integrated_workflow("machine learning research")
    
    if integrated_result["status"] == "success":
        print("✅ Integrated workflow successful!")
        print(f"Found {len(integrated_result['document_results'].get('results', []))} documents")
        print("Conversation AI processed the results successfully")
    else:
        print(f"❌ Integrated workflow failed: {integrated_result.get('error', 'Unknown error')}")
    
    # Summary
    print("\n" + "=" * 60)
    print("🎯 SYSTEM CONNECTION TEST SUMMARY")
    print("=" * 60)
    print(f"ubiquitous-octo-invention: {'✅ HEALTHY' if ubiquitous_health['status'] == 'healthy' else '❌ UNHEALTHY'}")
    print(f"ideal-octo-goggles: {'✅ HEALTHY' if ideal_health['status'] == 'healthy' else '❌ UNHEALTHY'}")
    print(f"Document Search: {'✅ WORKING' if doc_search_result['status'] == 'success' else '❌ FAILED'}")
    print(f"Conversation Search: {'✅ WORKING' if conv_search_result['status'] == 'success' else '❌ FAILED'}")
    print(f"Integrated Workflow: {'✅ WORKING' if integrated_result['status'] == 'success' else '❌ FAILED'}")
    
    if all([
        ubiquitous_health["status"] == "healthy",
        ideal_health["status"] == "healthy",
        doc_search_result["status"] == "success",
        conv_search_result["status"] == "success",
        integrated_result["status"] == "success"
    ]):
        print("\n🎉 ALL TESTS PASSED! Systems are fully connected and working together!")
    else:
        print("\n⚠️  Some tests failed. Check the logs above for details.")

if __name__ == "__main__":
    asyncio.run(main())
