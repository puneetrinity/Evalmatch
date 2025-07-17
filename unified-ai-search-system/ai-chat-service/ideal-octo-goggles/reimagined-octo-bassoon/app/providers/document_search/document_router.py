"""
Document Search Router
Intelligent routing for document vs web search queries
"""

import re
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

from app.core.logging import get_logger

logger = get_logger("providers.document_search.router")


@dataclass
class QueryAnalysis:
    """Analysis results for a search query"""
    is_document_query: bool
    confidence: float
    suggested_provider: str
    reasoning: List[str]
    query_type: str
    filters: Optional[Dict] = None


class DocumentSearchRouter:
    """Intelligent router to determine whether to use document search or web search"""
    
    def __init__(self):
        # Document-specific keywords and patterns
        self.document_keywords = {
            'file_types': ['pdf', 'doc', 'docx', 'txt', 'email', 'resume', 'cv'],
            'document_actions': ['find', 'search', 'locate', 'show', 'get', 'retrieve'],
            'content_indicators': ['in my files', 'in documents', 'from files', 'uploaded'],
            'specific_content': ['contract', 'agreement', 'report', 'invoice', 'letter']
        }
        
        # Web search indicators
        self.web_keywords = {
            'current_events': ['news', 'latest', 'current', 'today', 'recent'],
            'general_info': ['what is', 'how to', 'define', 'explain'],
            'live_data': ['weather', 'stock', 'price', 'score', 'status']
        }
        
        # Hybrid search indicators
        self.hybrid_keywords = {
            'research': ['research', 'compare', 'analyze', 'study'],
            'comprehensive': ['everything about', 'all information', 'complete guide']
        }
    
    def analyze_query(self, query: str) -> QueryAnalysis:
        """Analyze query to determine best search approach"""
        
        query_lower = query.lower()
        reasoning = []
        confidence = 0.0
        
        # Check for document-specific indicators
        doc_score = self._calculate_document_score(query_lower, reasoning)
        
        # Check for web-specific indicators  
        web_score = self._calculate_web_score(query_lower, reasoning)
        
        # Check for hybrid indicators
        hybrid_score = self._calculate_hybrid_score(query_lower, reasoning)
        
        # Determine best approach
        if hybrid_score > 0.7:
            suggested_provider = "hybrid"
            query_type = "hybrid"
            confidence = hybrid_score
            is_document_query = True  # Will use both systems
        elif doc_score > web_score and doc_score > 0.5:
            suggested_provider = "ultra_fast_search"
            query_type = "document"
            confidence = doc_score
            is_document_query = True
        elif web_score > 0.6:
            suggested_provider = "web_search"
            query_type = "web"
            confidence = web_score
            is_document_query = False
        else:
            # Default to hybrid for uncertain queries
            suggested_provider = "hybrid"
            query_type = "hybrid"
            confidence = 0.5
            is_document_query = True
            reasoning.append("Uncertain query type, using hybrid approach")
        
        # Extract potential filters
        filters = self._extract_filters(query_lower)
        
        return QueryAnalysis(
            is_document_query=is_document_query,
            confidence=confidence,
            suggested_provider=suggested_provider,
            reasoning=reasoning,
            query_type=query_type,
            filters=filters
        )
    
    def _calculate_document_score(self, query: str, reasoning: List[str]) -> float:
        """Calculate likelihood this is a document search query"""
        score = 0.0
        
        # Check for file type mentions
        for file_type in self.document_keywords['file_types']:
            if file_type in query:
                score += 0.3
                reasoning.append(f"Contains file type: {file_type}")
        
        # Check for document actions
        for action in self.document_keywords['document_actions']:
            if action in query:
                score += 0.2
                reasoning.append(f"Contains document action: {action}")
        
        # Check for content indicators
        for indicator in self.document_keywords['content_indicators']:
            if indicator in query:
                score += 0.4
                reasoning.append(f"Contains content indicator: {indicator}")
        
        # Check for specific content types
        for content in self.document_keywords['specific_content']:
            if content in query:
                score += 0.3
                reasoning.append(f"Contains specific content type: {content}")
        
        # Look for quoted text (often searching for exact phrases in documents)
        if '"' in query and query.count('"') >= 2:
            score += 0.3
            reasoning.append("Contains quoted text (exact phrase search)")
        
        return min(score, 1.0)
    
    def _calculate_web_score(self, query: str, reasoning: List[str]) -> float:
        """Calculate likelihood this is a web search query"""
        score = 0.0
        
        # Check for current events
        for keyword in self.web_keywords['current_events']:
            if keyword in query:
                score += 0.4
                reasoning.append(f"Contains current events keyword: {keyword}")
        
        # Check for general information requests
        for keyword in self.web_keywords['general_info']:
            if keyword in query:
                score += 0.3
                reasoning.append(f"Contains general info keyword: {keyword}")
        
        # Check for live data requests
        for keyword in self.web_keywords['live_data']:
            if keyword in query:
                score += 0.5
                reasoning.append(f"Contains live data keyword: {keyword}")
        
        # Questions typically go to web search
        if query.strip().endswith('?'):
            score += 0.2
            reasoning.append("Query is a question")
        
        return min(score, 1.0)
    
    def _calculate_hybrid_score(self, query: str, reasoning: List[str]) -> float:
        """Calculate likelihood this needs hybrid search"""
        score = 0.0
        
        # Check for research keywords
        for keyword in self.hybrid_keywords['research']:
            if keyword in query:
                score += 0.4
                reasoning.append(f"Contains research keyword: {keyword}")
        
        # Check for comprehensive requests
        for keyword in self.hybrid_keywords['comprehensive']:
            if keyword in query:
                score += 0.5
                reasoning.append(f"Contains comprehensive keyword: {keyword}")
        
        # Long, complex queries often benefit from hybrid
        if len(query.split()) > 8:
            score += 0.2
            reasoning.append("Complex query benefits from hybrid search")
        
        return min(score, 1.0)
    
    def _extract_filters(self, query: str) -> Optional[Dict]:
        """Extract potential filters from the query"""
        filters = {}
        
        # Date filters
        date_patterns = [
            r'from (\d{4})',
            r'in (\d{4})',
            r'after (\d{4})',
            r'before (\d{4})'
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, query)
            if match:
                filters['year'] = match.group(1)
                break
        
        # File type filters
        for file_type in self.document_keywords['file_types']:
            if file_type in query:
                filters['file_type'] = file_type
                break
        
        # Author/sender filters
        author_patterns = [
            r'by ([A-Za-z]+ [A-Za-z]+)',
            r'from ([A-Za-z]+ [A-Za-z]+)',
            r'author ([A-Za-z]+ [A-Za-z]+)'
        ]
        
        for pattern in author_patterns:
            match = re.search(pattern, query)
            if match:
                filters['author'] = match.group(1)
                break
        
        return filters if filters else None
