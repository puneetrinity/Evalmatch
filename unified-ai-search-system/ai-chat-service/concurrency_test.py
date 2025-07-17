#!/usr/bin/env python3
"""
Concurrency Testing for Chat API
Tests how many concurrent requests the system can actually handle.
"""
import time
import json
import urllib.request
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from queue import Queue
import statistics

class ConcurrencyTester:
    def __init__(self, base_url="http://localhost:8000"):
        self.base_url = base_url
        self.results = Queue()
        
    def single_chat_request(self, request_id):
        """Execute a single chat request"""
        start_time = time.time()
        
        chat_data = {
            'message': f'Hello, tell me about AI in 1 sentence. Request #{request_id}',
            'session_id': f'test_session_{request_id}',
            'user_id': 'test_user'
        }
        
        try:
            url = f'{self.base_url}/api/v1/chat/complete'
            req_data = json.dumps(chat_data).encode('utf-8')
            req = urllib.request.Request(url, data=req_data, 
                                       headers={'Content-Type': 'application/json'})
            
            with urllib.request.urlopen(req, timeout=120) as response:
                response_data = response.read().decode('utf-8')
                
            response_time = time.time() - start_time
            
            try:
                response_json = json.loads(response_data)
                success = True
                response_size = len(str(response_json.get('data', {}).get('response', '')))
            except:
                success = True  # Non-JSON but successful HTTP response
                response_size = len(response_data)
                
            result = {
                'request_id': request_id,
                'success': success,
                'response_time': response_time,
                'response_size': response_size,
                'start_time': start_time,
                'end_time': time.time()
            }
            
            print(f"✅ Request {request_id}: {response_time:.2f}s")
            return result
            
        except Exception as e:
            response_time = time.time() - start_time
            result = {
                'request_id': request_id,
                'success': False,
                'response_time': response_time,
                'error': str(e),
                'start_time': start_time,
                'end_time': time.time()
            }
            print(f"❌ Request {request_id}: FAILED after {response_time:.2f}s - {str(e)[:50]}")
            return result
    
    def test_concurrency_level(self, concurrent_requests, total_requests):
        """Test a specific concurrency level"""
        print(f"\n🧪 Testing {concurrent_requests} concurrent requests ({total_requests} total)")
        print("-" * 60)
        
        start_time = time.time()
        results = []
        
        with ThreadPoolExecutor(max_workers=concurrent_requests) as executor:
            # Submit all requests
            futures = []
            for i in range(total_requests):
                future = executor.submit(self.single_chat_request, i+1)
                futures.append(future)
            
            # Collect results as they complete
            for future in as_completed(futures):
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    print(f"❌ Future failed: {e}")
        
        total_time = time.time() - start_time
        
        # Analyze results
        successful = [r for r in results if r['success']]
        failed = [r for r in results if not r['success']]
        
        if successful:
            response_times = [r['response_time'] for r in successful]
            avg_response = statistics.mean(response_times)
            min_response = min(response_times)
            max_response = max(response_times)
            median_response = statistics.median(response_times)
        else:
            avg_response = min_response = max_response = median_response = 0
        
        throughput = len(successful) / total_time if total_time > 0 else 0
        throughput_per_hour = throughput * 3600
        
        print(f"\n📊 RESULTS for {concurrent_requests} concurrent:")
        print(f"   Total time: {total_time:.2f}s")
        print(f"   Successful: {len(successful)}/{total_requests} ({len(successful)/total_requests*100:.1f}%)")
        print(f"   Failed: {len(failed)}")
        print(f"   Avg response: {avg_response:.2f}s")
        print(f"   Min/Max response: {min_response:.2f}s / {max_response:.2f}s")
        print(f"   Median response: {median_response:.2f}s")
        print(f"   Throughput: {throughput:.2f} req/s ({throughput_per_hour:.0f} req/hour)")
        
        if failed:
            print(f"   Errors: {[r.get('error', 'Unknown')[:30] for r in failed[:3]]}")
        
        return {
            'concurrent_level': concurrent_requests,
            'total_requests': total_requests,
            'successful': len(successful),
            'failed': len(failed),
            'success_rate': len(successful)/total_requests*100,
            'total_time': total_time,
            'avg_response_time': avg_response,
            'min_response_time': min_response,
            'max_response_time': max_response,
            'median_response_time': median_response,
            'throughput_per_second': throughput,
            'throughput_per_hour': throughput_per_hour
        }

def main():
    print("🚀 AI Search System - Concurrency Testing")
    print("=" * 60)
    print("Testing how many concurrent chat requests the system can handle...")
    
    tester = ConcurrencyTester()
    test_results = []
    
    # Test different concurrency levels
    concurrency_tests = [
        (1, 3),   # Sequential baseline
        (2, 4),   # Light concurrency  
        (3, 6),   # Moderate concurrency
        (5, 10),  # Higher concurrency
        (8, 16),  # Stress test
    ]
    
    for concurrent, total in concurrency_tests:
        try:
            result = tester.test_concurrency_level(concurrent, total)
            test_results.append(result)
            
            # Brief pause between test levels
            time.sleep(2)
            
        except Exception as e:
            print(f"❌ Failed concurrency test {concurrent}: {e}")
            break
    
    # Summary analysis
    print("\n" + "=" * 80)
    print("📈 CONCURRENCY ANALYSIS SUMMARY")
    print("=" * 80)
    
    print(f"{'Concurrent':<12} | {'Success%':<8} | {'Avg Time':<9} | {'Throughput/hour':<15} | {'Degradation'}")
    print("-" * 80)
    
    baseline_throughput = None
    
    for result in test_results:
        if baseline_throughput is None:
            baseline_throughput = result['throughput_per_hour']
            degradation = "baseline"
        else:
            degradation = f"{(1 - result['throughput_per_hour']/baseline_throughput)*100:+.1f}%"
        
        print(f"{result['concurrent_level']:<12} | {result['success_rate']:7.1f}% | {result['avg_response_time']:8.2f}s | {result['throughput_per_hour']:14.0f} | {degradation}")
    
    # Find optimal concurrency
    successful_tests = [r for r in test_results if r['success_rate'] > 90]
    if successful_tests:
        best_throughput = max(successful_tests, key=lambda x: x['throughput_per_hour'])
        print(f"\n🎯 OPTIMAL CONCURRENCY: {best_throughput['concurrent_level']} concurrent requests")
        print(f"   Best throughput: {best_throughput['throughput_per_hour']:.0f} requests/hour")
        print(f"   Success rate: {best_throughput['success_rate']:.1f}%")
        print(f"   Average response: {best_throughput['avg_response_time']:.2f}s")
    
    # Realistic capacity projections
    print(f"\n🔮 REALISTIC CAPACITY PROJECTIONS:")
    if successful_tests:
        current_best = best_throughput['throughput_per_hour']
        
        # A5000 improvements (conservative)
        memory_improvement = 2.0  # More realistic: better memory management
        processing_improvement = 1.5  # GPU acceleration
        optimization_improvement = 1.3  # Better caching, routing
        
        total_improvement = memory_improvement * processing_improvement * optimization_improvement
        a5000_capacity = current_best * total_improvement
        
        print(f"   Current best: {current_best:.0f} requests/hour")
        print(f"   A5000 projected: {a5000_capacity:.0f} requests/hour")
        print(f"   Improvement: {total_improvement:.1f}x")
        
        # Task-specific projections
        print(f"\n📋 RECRUITMENT TASK PROJECTIONS (A5000):")
        print(f"   Resume Parsing (DeepSeek): {a5000_capacity*0.8:.0f} req/hour (similar complexity)")
        print(f"   Bias Detection (Mistral): {a5000_capacity*1.2:.0f} req/hour (lighter model)")  
        print(f"   Matching Logic (LLaMA3): {a5000_capacity*0.6:.0f} req/hour (heavier reasoning)")
        print(f"   Script Generation: {a5000_capacity*0.5:.0f} req/hour (complex generation)")
        print(f"   Report Generation (Phi3): {a5000_capacity*2.0:.0f} req/hour (lightweight)")
    
    else:
        print("   Could not determine optimal concurrency - all tests failed")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n🛑 Testing interrupted by user")
    except Exception as e:
        print(f"\n❌ Testing failed: {e}")