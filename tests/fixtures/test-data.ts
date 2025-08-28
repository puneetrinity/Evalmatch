/**
 * Test Data Fixtures
 * Realistic test data for all application components
 */

import { InsertUser, InsertResume, InsertJobDescription, InsertAnalysisResult, InsertInterviewQuestions } from '../../shared/schema';

// Test Users
export const testUsers: InsertUser[] = [
  {
    username: 'testuser1',
    email: 'test1@example.com',
    createdAt: new Date('2024-01-01'),
  },
  {
    username: 'testuser2',
    email: 'test2@example.com',
    createdAt: new Date('2024-01-02'),
  },
  {
    username: 'hrmanager',
    email: 'hr@company.com',
    createdAt: new Date('2024-01-03'),
  }
];

// Test Resume Content
export const testResumeContent = {
  softwareEngineer: `
    John Doe
    Software Engineer
    john.doe@email.com | (555) 123-4567 | linkedin.com/in/johndoe

    EXPERIENCE
    Senior Software Engineer - TechCorp (2020-2024)
    • Developed scalable web applications using React, Node.js, and PostgreSQL
    • Led a team of 5 developers on microservices architecture
    • Implemented CI/CD pipelines reducing deployment time by 60%
    • Technologies: JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker, AWS

    Software Engineer - StartupXYZ (2018-2020)  
    • Built RESTful APIs serving 100k+ daily active users
    • Optimized database queries improving performance by 40%
    • Collaborated with cross-functional teams using Agile methodology
    • Technologies: Python, Django, Redis, MongoDB

    EDUCATION
    Bachelor of Science in Computer Science - University of Technology (2014-2018)
    GPA: 3.8/4.0

    SKILLS
    Programming: JavaScript, TypeScript, Python, Java, SQL
    Frameworks: React, Node.js, Django, Express.js
    Databases: PostgreSQL, MongoDB, Redis
    Cloud: AWS, Docker, Kubernetes
    Tools: Git, Jenkins, JIRA, VS Code
  `,
  
  dataScientist: `
    Jane Smith
    Data Scientist
    jane.smith@email.com | (555) 987-6543 | github.com/janesmith

    EXPERIENCE
    Senior Data Scientist - DataCorp (2021-2024)
    • Developed machine learning models improving customer retention by 25%
    • Built data pipelines processing 10TB+ daily using Apache Spark
    • Led A/B testing initiatives increasing conversion rates by 15%
    • Technologies: Python, R, SQL, TensorFlow, PyTorch, Apache Spark

    Data Analyst - Analytics Inc (2019-2021)
    • Created dashboards and reports using Tableau and Power BI
    • Performed statistical analysis on customer behavior data
    • Collaborated with product teams to identify growth opportunities
    • Technologies: SQL, Python, Tableau, Excel, R

    EDUCATION
    Master of Science in Data Science - Data University (2017-2019)
    Bachelor of Science in Mathematics - State University (2013-2017)

    SKILLS
    Programming: Python, R, SQL, Scala
    ML/AI: TensorFlow, PyTorch, Scikit-learn, Keras
    Big Data: Apache Spark, Hadoop, Kafka
    Visualization: Tableau, Power BI, Matplotlib, Seaborn
    Statistics: Hypothesis Testing, Regression Analysis, Time Series
  `,

  projectManager: `
    Mike Johnson
    Project Manager
    mike.johnson@email.com | (555) 456-7890 | linkedin.com/in/mikejohnson

    EXPERIENCE
    Senior Project Manager - Enterprise Solutions (2019-2024)
    • Managed 20+ cross-functional projects with budgets up to $2M
    • Implemented Agile and Scrum methodologies across 5 teams
    • Delivered projects 95% on-time and 10% under budget on average
    • Led digital transformation initiatives for Fortune 500 clients

    Project Coordinator - Tech Innovations (2017-2019)
    • Coordinated software development projects using JIRA and Confluence
    • Facilitated daily standups and sprint planning sessions
    • Managed stakeholder communications and project documentation

    EDUCATION
    MBA in Project Management - Business School (2015-2017)
    Bachelor of Business Administration - Commerce University (2011-2015)

    CERTIFICATIONS
    • Project Management Professional (PMP)
    • Certified Scrum Master (CSM)
    • Agile Certified Practitioner (PMI-ACP)

    SKILLS
    Project Management: Agile, Scrum, Waterfall, Kanban
    Tools: JIRA, Confluence, MS Project, Trello, Slack
    Leadership: Team Management, Stakeholder Communication
    Business: Budget Management, Risk Assessment, Process Improvement
  `
};

// Test Resumes
export const createTestResumes = (userId: string, sessionId: string, batchId: string): InsertResume[] => [
  {
    userId,
    sessionId,
    batchId,
    filename: 'john_doe_resume.pdf',
    fileSize: 245760, // ~240KB
    fileType: 'application/pdf',
    content: testResumeContent.softwareEngineer,
    analyzedData: {
      name: 'John Doe',
      skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'AWS'],
      experience: '6 years',
      education: ['Bachelor of Science in Computer Science'],
      summary: 'Experienced software engineer with full-stack development expertise',
      keyStrengths: ['Full-stack development', 'Team leadership', 'Microservices'],
      contactInfo: {
        email: 'john.doe@email.com',
        phone: '(555) 123-4567'
      },
      certifications: []
    },
    createdAt: new Date(),
  },
  {
    userId,
    sessionId,
    batchId,
    filename: 'jane_smith_resume.pdf',
    fileSize: 198432, // ~194KB
    fileType: 'application/pdf',
    content: testResumeContent.dataScientist,
    analyzedData: {
      name: 'Jane Smith',
      skills: ['Python', 'R', 'SQL', 'TensorFlow', 'PyTorch', 'Apache Spark', 'Tableau'],
      experience: '5 years',
      education: ['Master of Science in Data Science'],
      summary: 'Data scientist with machine learning and big data expertise',
      keyStrengths: ['Machine learning', 'Big data processing', 'Statistical analysis'],
      contactInfo: {
        email: 'jane.smith@email.com',
        phone: '(555) 987-6543'
      },
      certifications: []
    },
    createdAt: new Date(),
  },
  {
    userId,
    sessionId,
    batchId,
    filename: 'mike_johnson_resume.pdf',
    fileSize: 187392, // ~183KB
    fileType: 'application/pdf',
    content: testResumeContent.projectManager,
    analyzedData: {
      name: 'Mike Johnson',
      skills: ['Project Management', 'Agile', 'Scrum', 'JIRA', 'Leadership', 'Budget Management'],
      experience: '7 years',
      education: ['MBA in Project Management'],
      summary: 'Experienced project manager with Agile and enterprise project expertise',
      keyStrengths: ['Project leadership', 'Agile methodologies', 'Stakeholder management'],
      contactInfo: {
        email: 'mike.johnson@email.com',
        phone: '(555) 456-7890'
      },
      certifications: [
        { name: 'PMP', issuer: 'PMI' },
        { name: 'CSM', issuer: 'Scrum Alliance' },
        { name: 'PMI-ACP', issuer: 'PMI' }
      ]
    },
    createdAt: new Date(),
  }
];

// Test Job Descriptions
export const testJobDescriptions: Omit<InsertJobDescription, 'id' | 'userId'>[] = [
  {
    title: 'Senior Full Stack Developer',
    description: `
      We are seeking a Senior Full Stack Developer to join our growing engineering team.

      RESPONSIBILITIES:
      • Design and develop scalable web applications using modern technologies
      • Lead technical decisions and mentor junior developers
      • Collaborate with product teams to deliver high-quality features
      • Implement best practices for code quality, testing, and deployment
      • Participate in architecture discussions and technical planning

      REQUIREMENTS:
      • 5+ years of experience in full-stack development
      • Proficiency in JavaScript/TypeScript, React, and Node.js
      • Experience with relational databases (PostgreSQL preferred)
      • Knowledge of cloud platforms (AWS, Azure, or GCP)
      • Strong understanding of RESTful APIs and microservices
      • Experience with CI/CD pipelines and DevOps practices
      • Excellent problem-solving and communication skills

      PREFERRED QUALIFICATIONS:
      • Experience with containerization (Docker, Kubernetes)
      • Knowledge of GraphQL and modern state management
      • Background in agile development methodologies
      • Open source contributions or side projects

      We offer competitive compensation, comprehensive benefits, and a collaborative work environment.
    `,
    analyzedData: {
      requiredSkills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'],
      preferredSkills: ['Docker', 'Kubernetes', 'GraphQL', 'DevOps', 'Microservices'],
      experienceLevel: 'senior',
      responsibilities: [
        'Design and develop scalable web applications',
        'Lead technical decisions and mentor junior developers',
        'Collaborate with product teams',
        'Implement best practices'
      ],
      summary: 'Senior full-stack developer role focusing on scalable web development and technical leadership'
    },
    createdAt: new Date(),
  },
  {
    title: 'Data Science Manager',
    description: `
      Join our Data Science team as a Manager to lead data-driven initiatives and build world-class ML models.

      RESPONSIBILITIES:
      • Lead a team of 6-8 data scientists and ML engineers
      • Drive strategic data science initiatives across the organization
      • Develop and deploy machine learning models at scale
      • Collaborate with engineering teams to productionize ML solutions
      • Establish best practices for data science workflows and model deployment

      REQUIREMENTS:
      • 7+ years of experience in data science or machine learning
      • 3+ years of people management experience
      • Strong proficiency in Python, SQL, and statistical analysis
      • Experience with ML frameworks (TensorFlow, PyTorch, Scikit-learn)
      • Knowledge of big data technologies (Spark, Hadoop, Kafka)
      • Experience with cloud ML platforms (AWS SageMaker, GCP Vertex AI)
      • Strong business acumen and communication skills

      PREFERRED QUALIFICATIONS:
      • PhD in Computer Science, Statistics, or related field
      • Experience with MLOps and model monitoring
      • Background in deep learning and NLP
      • Experience in A/B testing and experimentation

      Competitive package including equity, comprehensive benefits, and learning budget.
    `,
    analyzedData: {
      requiredSkills: ['Python', 'SQL', 'TensorFlow', 'PyTorch', 'Apache Spark', 'AWS', 'Leadership'],
      preferredSkills: ['MLOps', 'Deep Learning', 'NLP', 'A/B Testing', 'PhD'],
      experienceLevel: 'manager',
      responsibilities: [
        'Lead data science team',
        'Drive strategic initiatives',
        'Develop ML models at scale',
        'Establish best practices'
      ],
      summary: 'Data science management role focusing on team leadership and ML model development'
    },
    createdAt: new Date(),
  },
  {
    title: 'Junior Frontend Developer',
    description: `
      We're looking for a motivated Junior Frontend Developer to join our UI/UX team.

      RESPONSIBILITIES:
      • Develop responsive web interfaces using React and modern CSS
      • Collaborate with designers to implement pixel-perfect UIs
      • Write clean, maintainable, and testable code
      • Participate in code reviews and team learning sessions
      • Assist with user testing and accessibility improvements

      REQUIREMENTS:
      • 1-3 years of frontend development experience
      • Proficiency in JavaScript, HTML5, and CSS3
      • Experience with React and modern build tools
      • Basic understanding of version control (Git)
      • Strong attention to detail and design sense
      • Willingness to learn and grow in a collaborative environment

      PREFERRED QUALIFICATIONS:
      • Experience with TypeScript
      • Knowledge of testing frameworks (Jest, React Testing Library)
      • Familiarity with design systems and component libraries
      • Basic understanding of backend technologies

      Great opportunity for career growth with mentorship and learning resources.
    `,
    analyzedData: {
      requiredSkills: ['JavaScript', 'HTML5', 'CSS3', 'React', 'Git'],
      preferredSkills: ['TypeScript', 'Jest', 'Testing', 'Design Systems'],
      experienceLevel: 'junior',
      responsibilities: [
        'Develop responsive web interfaces',
        'Collaborate with designers',
        'Write clean code',
        'Participate in code reviews'
      ],
      summary: 'Junior frontend developer role focusing on React development and UI implementation'
    },
    createdAt: new Date(),
  }
];

// Test Analysis Results
export const createTestAnalysisResults = (
  userId: string,
  resumeIds: number[],
  jobDescriptionId: number
): Omit<InsertAnalysisResult, 'id'>[] => [
  {
    userId,
    resumeId: resumeIds[0], // John Doe - Software Engineer
    jobDescriptionId,
    matchPercentage: 87,
    matchedSkills: [
      { skill: 'JavaScript', matchPercentage: 95, category: 'programming', importance: 'critical', source: 'exact' },
      { skill: 'TypeScript', matchPercentage: 90, category: 'programming', importance: 'critical', source: 'exact' },
      { skill: 'React', matchPercentage: 92, category: 'frontend', importance: 'critical', source: 'exact' },
      { skill: 'Node.js', matchPercentage: 88, category: 'backend', importance: 'critical', source: 'exact' },
      { skill: 'PostgreSQL', matchPercentage: 85, category: 'database', importance: 'important', source: 'exact' }
    ],
    missingSkills: ['GraphQL', 'Kubernetes'],
    analysis: {
      overallFit: 'excellent',
      experienceAlignment: 'strong',
      skillsAlignment: 'strong',
      summary: 'Strong candidate with excellent technical skills and relevant experience'
    },
    candidateStrengths: [
      'Extensive full-stack development experience',
      'Strong leadership and team management skills',
      'Experience with microservices architecture',
      'DevOps and CI/CD expertise'
    ],
    candidateWeaknesses: [
      'Limited GraphQL experience',
      'No Kubernetes experience mentioned'
    ],
    recommendations: [
      'Excellent fit for senior full-stack role',
      'Could benefit from GraphQL training',
      'Strong candidate for technical leadership'
    ],
    confidenceLevel: 'high',
    fairnessMetrics: {
      biasConfidenceScore: 92,
      fairnessAssessment: 'Analysis shows no signs of bias, focused on technical qualifications',
      potentialBiasAreas: []
    },
    createdAt: new Date(),
  },
  {
    userId,
    resumeId: resumeIds[1], // Jane Smith - Data Scientist
    jobDescriptionId,
    matchPercentage: 43,
    matchedSkills: [
      { skill: 'SQL', matchPercentage: 85, category: 'database', importance: 'important', source: 'exact' },
      { skill: 'Python', matchPercentage: 90, category: 'programming', importance: 'important', source: 'exact' }
    ],
    missingSkills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL'],
    analysis: {
      overallFit: 'poor',
      experienceAlignment: 'weak',
      skillsAlignment: 'weak',
      summary: 'Skilled professional but in different domain than required'
    },
    candidateStrengths: [
      'Strong analytical and problem-solving skills',
      'Advanced Python programming',
      'Machine learning expertise'
    ],
    candidateWeaknesses: [
      'No web development experience',
      'Missing core frontend/backend technologies',
      'Different career focus (data science vs web development)'
    ],
    recommendations: [
      'Not suitable for full-stack developer role',
      'Would be excellent for data science positions',
      'Could consider data engineering roles'
    ],
    confidenceLevel: 'high',
    fairnessMetrics: {
      biasConfidenceScore: 94,
      fairnessAssessment: 'Fair assessment based on technical skill alignment',
      potentialBiasAreas: []
    },
    createdAt: new Date(),
  },
  {
    userId,
    resumeId: resumeIds[2], // Mike Johnson - Project Manager
    jobDescriptionId,
    matchPercentage: 25,
    matchedSkills: [
      { skill: 'Leadership', matchPercentage: 95, category: 'soft-skills', importance: 'important', source: 'exact' },
      { skill: 'Agile', matchPercentage: 88, category: 'methodology', importance: 'important', source: 'exact' }
    ],
    missingSkills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'],
    analysis: {
      overallFit: 'poor',
      experienceAlignment: 'weak',
      skillsAlignment: 'very weak',
      summary: 'Strong management skills but lacks technical development background'
    },
    candidateStrengths: [
      'Excellent project management experience',
      'Strong leadership and communication skills',
      'Agile methodology expertise',
      'Budget and risk management experience'
    ],
    candidateWeaknesses: [
      'No programming or development experience',
      'Missing all required technical skills',
      'Different career path (management vs development)'
    ],
    recommendations: [
      'Not suitable for developer role',
      'Would be excellent for technical project manager positions',
      'Could consider product management roles'
    ],
    confidenceLevel: 'high',
    fairnessMetrics: {
      biasConfidenceScore: 96,
      fairnessAssessment: 'Objective assessment based on role requirements',
      potentialBiasAreas: []
    },
    createdAt: new Date(),
  }
];

// Test Interview Questions
export const createTestInterviewQuestions = (
  userId: string,
  resumeId: number,
  jobDescriptionId: number
): Omit<InsertInterviewQuestions, 'id'> => ({
  userId,
  resumeId,
  jobDescriptionId,
  questions: [
    {
      category: 'technical',
      question: 'Can you walk me through how you would design a scalable microservices architecture for a high-traffic web application?',
      difficulty: 'medium',
      expectedAnswer: 'Should cover service decomposition, communication patterns, data management, and deployment strategies',
      skillsAssessed: ['System Design', 'Microservices', 'Architecture'],
    },
    {
      category: 'behavioral',
      question: 'Tell me about a time when you had to optimize database performance. What was your approach and what were the results?',
      difficulty: 'medium',
      expectedAnswer: 'Should demonstrate database optimization experience, methodology, and measurable results',
      skillsAssessed: ['Database Optimization', 'Problem Solving', 'Performance Analysis'],
    },
    {
      category: 'technical',
      question: 'How would you implement error handling and retry logic in a distributed system?',
      difficulty: 'hard',
      expectedAnswer: 'Should cover circuit breakers, exponential backoff, idempotency, and monitoring',
      skillsAssessed: ['Distributed Systems', 'Error Handling', 'System Reliability'],
    },
    {
      category: 'technical',
      question: 'We use GraphQL extensively. How would you approach learning it, and how does it compare to REST?',
      difficulty: 'easy',
      expectedAnswer: 'Should show learning approach and basic understanding of GraphQL vs REST differences',
      skillsAssessed: ['GraphQL', 'API Design', 'Learning Ability'],
    },
    {
      category: 'cultural',
      question: 'How do you ensure code quality and knowledge sharing when working with developers of different experience levels?',
      difficulty: 'easy',
      expectedAnswer: 'Should demonstrate mentoring approach, code review practices, and inclusive team culture',
      skillsAssessed: ['Mentorship', 'Code Quality', 'Team Collaboration'],
    }
  ],
  createdAt: new Date(),
});

// Test File Data (for upload testing)
export const testFileData = {
  validPDF: {
    name: 'test-resume.pdf',
    type: 'application/pdf',
    size: 245760,
    content: Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n174\n%%EOF')
  },
  
  validDOCX: {
    name: 'test-resume.docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 198432,
    content: Buffer.from('UEsDBBQABgAIAAAAIQDfpNJsWgEAACAFAAATAAgCW0NvbnRlbnRfVHlwZXNdLnhtbCCiBAIooAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADjVP+9rnHJGRJ/N6n8Aqy9v8LgQAAAABJRU5ErkJggg==')
  },
  
  invalidFile: {
    name: 'test-image.jpg',
    type: 'image/jpeg',
    size: 1024,
    content: Buffer.from('invalid file content')
  },
  
  oversizedFile: {
    name: 'large-resume.pdf',
    type: 'application/pdf',
    size: 10 * 1024 * 1024, // 10MB - over the limit
    content: Buffer.alloc(10 * 1024 * 1024, 'a')
  }
};

// Test Batch IDs and Session IDs
export const testBatchData = {
  validBatchId: 'batch_test_2024_abc123',
  validSessionId: 'session_test_2024_def456',
  expiredBatchId: 'batch_old_2023_xyz789',
  invalidBatchId: 'invalid-batch-id',
  orphanedBatchId: 'batch_orphaned_2024_ghi789'
};

// Mock AI Responses
export const mockAIResponses = {
  resumeAnalysis: {
    skills: ['JavaScript', 'TypeScript', 'React', 'Node.js'],
    experience: '5 years',
    education: 'Bachelor of Science in Computer Science',
    summary: 'Experienced software engineer with full-stack expertise',
    certifications: [],
    contactInfo: {
      name: 'Test Candidate',
      email: 'test@example.com',
      phone: '(555) 123-4567'
    }
  },
  
  jobAnalysis: {
    requiredSkills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL'],
    preferredSkills: ['TypeScript', 'Docker', 'AWS'],
    experienceLevel: 'senior',
    responsibilities: ['Develop applications', 'Lead team', 'Code review'],
    summary: 'Senior full-stack developer position'
  },
  
  matchAnalysis: {
    matchPercentage: 85,
    matchedSkills: [
      { skill: 'JavaScript', matchPercentage: 95, category: 'programming', importance: 'critical', source: 'exact' },
      { skill: 'React', matchPercentage: 90, category: 'frontend', importance: 'critical', source: 'exact' }
    ],
    missingSkills: ['Docker', 'AWS'],
    candidateStrengths: ['Strong technical skills', 'Relevant experience'],
    candidateWeaknesses: ['Limited cloud experience'],
    confidenceLevel: 'high' as const,
    fairnessMetrics: {
      biasConfidenceScore: 92,
      fairnessAssessment: 'Fair assessment based on technical qualifications'
    }
  },
  
  biasAnalysis: {
    hasBias: false,
    biasTypes: [],
    biasedPhrases: [],
    suggestions: [],
    overallScore: 95,
    summary: 'No significant bias detected in job description'
  }
};

export default {
  testUsers,
  testResumeContent,
  createTestResumes,
  testJobDescriptions,
  createTestAnalysisResults,
  createTestInterviewQuestions,
  testFileData,
  testBatchData,
  mockAIResponses
};