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
    
    def extract_skills(self, text: str) -> List[Dict[str, Any]]:
        """Extract skills from text using semantic matching"""
        text_lower = text.lower()
        extracted_skills = []
        
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
        
        return extracted_skills
    
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