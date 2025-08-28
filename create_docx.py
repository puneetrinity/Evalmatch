#!/usr/bin/env python3
from docx import Document

# Read the text content
with open('/home/ews/Evalmatch/test-resume-full.txt', 'r') as f:
    content = f.read()

# Create document
doc = Document()
doc.add_paragraph(content)

# Save as DOCX
doc.save('/home/ews/Evalmatch/jane-smith-comprehensive.docx')
print("Created comprehensive DOCX resume")