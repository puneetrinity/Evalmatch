#!/usr/bin/env python3
"""
Create a comprehensive test PDF resume for testing the PDF extraction functionality.
"""

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch
import sys

def create_comprehensive_resume_pdf():
    filename = "/home/ews/Evalmatch/test-resume-comprehensive.pdf"
    
    # Create document
    doc = SimpleDocTemplate(filename, pagesize=letter,
                           rightMargin=72,leftMargin=72,
                           topMargin=72,bottomMargin=18)
    
    # Container for the 'Flowable' objects
    story = []
    
    styles = getSampleStyleSheet()
    
    # Resume content
    resume_text = """
JANE SMITH
Senior Full Stack Developer

Email: jane.smith@email.com
Phone: (555) 987-6543
Location: San Francisco, CA
LinkedIn: linkedin.com/in/janesmith

PROFESSIONAL SUMMARY
Experienced Senior Full Stack Developer with 6+ years of expertise in React, Node.js, TypeScript, and PostgreSQL. Proven track record in building scalable microservices architectures, implementing Docker containerization, and deploying applications on AWS and GCP. Strong problem-solving abilities with extensive experience in agile development methodologies, code reviews, and mentoring junior developers.

TECHNICAL SKILLS
• Frontend: React, TypeScript, JavaScript, HTML5, CSS3, Redux, Next.js
• Backend: Node.js, Express.js, Python, Java, RESTful APIs, GraphQL
• Databases: PostgreSQL, MongoDB, Redis, MySQL
• Cloud & DevOps: AWS (EC2, S3, Lambda), GCP, Docker, Kubernetes, Jenkins
• Tools: Git, JIRA, Webpack, Jest, Cypress, Postman

PROFESSIONAL EXPERIENCE

Senior Full Stack Developer | TechCorp Solutions | 2021 - Present
• Lead development of microservices architecture serving 500K+ daily active users
• Built and maintained React/TypeScript frontend applications with 99.9% uptime
• Designed and implemented PostgreSQL database schemas with optimized queries
• Implemented Docker containerization reducing deployment time by 70%
• Collaborated with product managers in agile sprints, consistently meeting deadlines
• Mentored 5 junior developers and conducted comprehensive code reviews

Full Stack Developer | StartupXYZ | 2019 - 2021  
• Developed responsive web applications using React, Node.js, and PostgreSQL
• Built RESTful APIs handling 100K+ daily requests with sub-200ms response times
• Implemented automated testing suites achieving 95% code coverage
• Integrated third-party services and payment gateways (Stripe, PayPal)
• Participated in agile development processes and daily standups

Software Developer | DevCorp Inc. | 2018 - 2019
• Created dynamic web applications using JavaScript, HTML5, and CSS3
• Developed backend services with Node.js and Express.js
• Worked with PostgreSQL and MongoDB databases
• Collaborated with cross-functional teams in agile environment

EDUCATION
Bachelor of Science in Computer Science
University of California, Berkeley | 2014 - 2018
GPA: 3.9/4.0

Relevant Coursework: Data Structures, Algorithms, Database Systems, Software Engineering, Computer Networks

PROJECTS
E-Commerce Platform (2023)
• Built full-stack application with React/TypeScript and Node.js
• Implemented microservices architecture with Docker containers
• Deployed on AWS with automatic scaling and load balancing
• Achieved 99.9% uptime serving 10K+ concurrent users

Task Management System (2022) 
• Developed real-time collaboration tool with React and Socket.io
• Used PostgreSQL for data persistence and Redis for caching
• Implemented comprehensive test suite with Jest and Cypress
• Deployed using Docker containers on GCP

CERTIFICATIONS
• AWS Certified Solutions Architect - Associate (2023)
• Google Cloud Professional Developer (2022)
• Certified Scrum Master (CSM) (2021)

ACHIEVEMENTS
• Led team that increased application performance by 60%
• Reduced critical bugs by 85% through implementation of automated testing
• Successfully delivered $2M revenue-generating feature ahead of schedule
• Recognized as "Developer of the Year" at TechCorp Solutions (2023)
"""
    
    # Split into paragraphs and add to story
    paragraphs = resume_text.strip().split('\n\n')
    for para in paragraphs:
        if para.strip():
            p = Paragraph(para.strip(), styles['Normal'])
            story.append(p)
            story.append(Spacer(1, 12))
    
    # Build PDF
    doc.build(story)
    print(f"Created comprehensive resume PDF: {filename}")
    return filename

if __name__ == "__main__":
    try:
        create_comprehensive_resume_pdf()
    except ImportError as e:
        print(f"Error: Missing required library: {e}")
        print("Please install reportlab: pip install reportlab")
        sys.exit(1)
    except Exception as e:
        print(f"Error creating PDF: {e}")
        sys.exit(1)