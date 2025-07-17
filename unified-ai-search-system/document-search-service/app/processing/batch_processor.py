
import asyncio
from typing import List, Dict, Callable, Optional
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
import multiprocessing as mp
import time

class MathematicalBatchProcessor:
    """
    High-performance batch processor for processing large volumes of documents.
    """

    def __init__(self, max_workers: int = None):
        self.max_workers = max_workers or mp.cpu_count()
        self.thread_pool = ThreadPoolExecutor(max_workers=self.max_workers)
        self.process_pool = ProcessPoolExecutor(max_workers=self.max_workers)

    async def process_document_batch(
        self,
        documents: List[Dict],
        processing_function: Callable,
        batch_size: int = 100
    ) -> List[Dict]:
        """
        Process a large batch of documents in parallel.
        """
        loop = asyncio.get_event_loop()
        tasks = []
        for i in range(0, len(documents), batch_size):
            batch = documents[i:i+batch_size]
            task = loop.run_in_executor(
                self.process_pool,
                self._process_batch,
                batch,
                processing_function
            )
            tasks.append(task)
        
        results = []
        for future in asyncio.as_completed(tasks):
            batch_results = await future
            results.extend(batch_results)
        
        return results

    @staticmethod
    def _process_batch(batch: List[Dict], processing_function: Callable) -> List[Dict]:
        return [processing_function(doc) for doc in batch]

    async def shutdown(self):
        self.thread_pool.shutdown(wait=True)
        self.process_pool.shutdown(wait=True)
