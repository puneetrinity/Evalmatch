#!/usr/bin/env python3
"""
ESCO Skill Extraction Service
Simple microservice to integrate ESCO skill taxonomy with our Node.js application
"""

import json
import sys
from typing import List, Dict, Any

# For now, let's create a mock implementation that we can replace with actual ESCO
# This allows us to test the integration without waiting for the full ML installation

class ESCOSkillExtractor:
    """Mock ESCO Skill Extractor for initial integration"""
    
    def __init__(self):
        # Mock pharma-specific skills from ESCO taxonomy
        self.pharma_skills = {
            "clinical_research": ["Clinical Research", "Drug Development", "Clinical Trials", "Regulatory Affairs"],
            "pharmaceutical_manufacturing": ["Good Manufacturing Practice", "Process Validation", "Quality Control", "Pharmaceutical Manufacturing"],
            "drug_discovery": ["Drug Discovery", "Molecular Biology", "Biochemistry", "Pharmacology"],
            "regulatory_affairs": ["FDA Regulations", "EMA Guidelines", "Drug Registration", "Compliance"],
            "medical_affairs": ["Medical Writing", "Pharmacovigilance", "Medical Communications", "Clinical Data Analysis"],
            "biotechnology": ["Biotechnology", "Bioinformatics", "Genomics", "Proteomics"],
            "quality_assurance": ["Quality Assurance", "Quality Control", "Validation", "GMP"],
            "pharmacovigilance": ["Adverse Event Reporting", "Drug Safety", "Risk Management", "Signal Detection"]
        }
        
        # Technology skills
        self.tech_skills = {
            "programming": ["Python", "R", "SAS", "SQL", "JavaScript", "Java", "C++"],
            "data_science": ["Machine Learning", "Data Analysis", "Statistics", "Data Visualization"],
            "software_development": ["Web Development", "API Development", "Database Design", "Cloud Computing"],
            "bioinformatics": ["Bioinformatics", "Genomic Analysis", "Protein Modeling", "Sequence Analysis"]
        }
    
    def extract_skills(self, text: str, domain_context: str = "auto") -> List[Dict[str, Any]]:
        """
        Extract skills from text using domain-aware semantic matching
        
        Args:
            text: The text to analyze (resume or job description)
            domain_context: Target domain ('pharmaceutical', 'technology', 'auto')
                          'auto' will detect domain automatically
        """
        text_lower = text.lower()
        extracted_skills = []
        
        # Auto-detect domain if not specified
        if domain_context == "auto":
            domain_context = self._detect_text_domain(text_lower)
            print(f"[ESCO] Auto-detected domain: {domain_context} for text preview: {text_lower[:100]}...", file=sys.stderr)
        
        print(f"[ESCO] Extracting skills for domain: {domain_context}", file=sys.stderr)
        
        # Domain-specific skill extraction to prevent contamination
        if domain_context == "pharmaceutical" or domain_context == "general":
            # Check pharma skills
            for category, skills in self.pharma_skills.items():
                for skill in skills:
                    if any(word in text_lower for word in skill.lower().split()):
                        extracted_skills.append({
                            "skill": skill,
                            "category": category,
                            "confidence": 0.85,
                            "domain": "pharmaceutical",
                            "esco_id": f"pharma_{category}_{len(extracted_skills)}"
                        })
        
        if domain_context == "technology" or domain_context == "general":
            # Check tech skills
            for category, skills in self.tech_skills.items():
                for skill in skills:
                    if any(word in text_lower for word in skill.lower().split()):
                        extracted_skills.append({
                            "skill": skill,
                            "category": category,
                            "confidence": 0.80,
                            "domain": "technology",
                            "esco_id": f"tech_{category}_{len(extracted_skills)}"
                        })
        
        # Apply contamination filter to prevent cross-domain pollution
        filtered_skills = self._filter_contaminated_skills(extracted_skills, domain_context, text_lower)
        
        print(f"[ESCO] Extracted {len(extracted_skills)} raw skills, filtered to {len(filtered_skills)} clean skills", file=sys.stderr)
        return filtered_skills
    
    def _detect_text_domain(self, text_lower: str) -> str:
        """Detect the primary domain of the text"""
        
        # Pharmaceutical indicators
        pharma_keywords = [
            'pharmaceutical', 'pharma', 'drug', 'clinical', 'fda', 'gmp', 
            'medical', 'biotechnology', 'biotech', 'regulatory', 'compliance',
            'manufacturing practice', 'validation', 'quality control'
        ]
        
        # Technology indicators
        tech_keywords = [
            'software', 'developer', 'programming', 'engineer', 'technology',
            'tech', 'development', 'coding', 'digital', 'cloud', 'data',
            'javascript', 'python', 'react', 'angular', 'ios', 'android',
            'cybersecurity', 'saas', 'api', 'database', 'web', 'mobile'
        ]
        
        # Count domain indicators
        pharma_score = sum(1 for keyword in pharma_keywords if keyword in text_lower)
        tech_score = sum(1 for keyword in tech_keywords if keyword in text_lower)
        
        print(f"[ESCO] Domain detection - Pharma: {pharma_score}, Tech: {tech_score}", file=sys.stderr)
        
        # Determine primary domain
        if pharma_score > tech_score and pharma_score >= 2:
            return "pharmaceutical"
        elif tech_score > pharma_score and tech_score >= 2:
            return "technology"
        else:
            return "general"  # Mixed or unclear domain
    
    def _filter_contaminated_skills(self, skills: List[Dict[str, Any]], domain_context: str, text_lower: str) -> List[Dict[str, Any]]:
        """Apply contamination filtering to prevent cross-domain skill pollution"""
        
        if domain_context == "general":
            # For general domain, allow both but with lower confidence for cross-domain skills
            return skills
        
        filtered_skills = []
        blocked_count = 0
        
        for skill_obj in skills:
            skill_name = skill_obj["skill"].lower()
            skill_domain = skill_obj["domain"]
            
            # Check for obvious contamination
            is_contaminated = False
            
            if domain_context == "technology" and skill_domain == "pharmaceutical":
                # Block pharmaceutical skills in technology context
                pharma_indicators = ["manufacturing", "fda", "clinical", "drug", "medical", "regulatory"]
                if any(indicator in skill_name for indicator in pharma_indicators):
                    print(f"[ESCO] ❌ BLOCKED: '{skill_obj['skill']}' (pharma skill in tech context)", file=sys.stderr)
                    is_contaminated = True
                    blocked_count += 1
            
            elif domain_context == "pharmaceutical" and skill_domain == "technology":
                # Block pure technology skills in pharmaceutical context (except data/analysis tools)
                tech_indicators = ["ios", "android", "react", "angular", "javascript", "web development"]
                if any(indicator in skill_name for indicator in tech_indicators):
                    print(f"[ESCO] ❌ BLOCKED: '{skill_obj['skill']}' (tech skill in pharma context)", file=sys.stderr)
                    is_contaminated = True
                    blocked_count += 1
            
            if not is_contaminated:
                filtered_skills.append(skill_obj)
        
        if blocked_count > 0:
            print(f"[ESCO] 🧹 CONTAMINATION CLEANUP: Blocked {blocked_count} cross-domain skills", file=sys.stderr)
        
        return filtered_skills
    
    def get_skill_categories(self) -> Dict[str, List[str]]:
        """Get all available skill categories"""
        all_categories = {}
        all_categories.update(self.pharma_skills)
        all_categories.update(self.tech_skills)
        return all_categories

def main():
    """Command line interface for the ESCO service"""
    if len(sys.argv) < 2:
        print("Usage: python3 esco_service.py <text_to_analyze>")
        sys.exit(1)
    
    text = " ".join(sys.argv[1:])
    extractor = ESCOSkillExtractor()
    
    try:
        skills = extractor.extract_skills(text)
        result = {
            "success": True,
            "skills": skills,
            "total_skills": len(skills),
            "domains": list(set(skill["domain"] for skill in skills))
        }
        print(json.dumps(result, indent=2))
    except Exception as e:
        result = {
            "success": False,
            "error": str(e),
            "skills": []
        }
        print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()