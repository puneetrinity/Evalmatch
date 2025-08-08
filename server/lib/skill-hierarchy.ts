import { eq, like, or, sql } from "drizzle-orm";
import { db } from "../db";
import { skillCategories, skillsTable, type Skill } from "@shared/schema";
import { generateEmbedding, cosineSimilarity } from "./embeddings";
import { logger } from "./logger";
import stringSimilarity from "string-similarity";
import { escoExtractor, type ESCOSkill } from "./esco-skill-extractor";

// Enhanced skill dictionary with categories (comprehensive pharma and tech domains)
export const SKILL_CATEGORIES = {
  // Technology Categories
  PROGRAMMING_LANGUAGES: "Programming Languages",
  FRAMEWORKS: "Frameworks & Libraries",
  DATABASES: "Databases",
  CLOUD_PLATFORMS: "Cloud Platforms",
  DEVOPS: "DevOps & Infrastructure",
  SOFT_SKILLS: "Soft Skills",
  METHODOLOGIES: "Methodologies",
  DESIGN: "Design & UI/UX",
  TESTING: "Testing & QA",
  DATA_SCIENCE: "Data Science & Analytics",
  MOBILE: "Mobile Development",
  SECURITY: "Security & Compliance",
  BUSINESS: "Business & Domain Knowledge",
  AI_MACHINE_LEARNING: "AI & Machine Learning",
  WEB_DEVELOPMENT: "Web Development",
  
  // Pharmaceutical Categories
  CLINICAL_RESEARCH: "Clinical Research",
  DRUG_DISCOVERY: "Drug Discovery & Development",
  REGULATORY_AFFAIRS: "Regulatory Affairs",
  QUALITY_ASSURANCE_PHARMA: "Pharmaceutical Quality Assurance",
  PHARMACOVIGILANCE: "Pharmacovigilance",
  MEDICAL_AFFAIRS: "Medical Affairs",
  PHARMACEUTICAL_MANUFACTURING: "Pharmaceutical Manufacturing",
  BIOTECHNOLOGY: "Biotechnology",
  BIOINFORMATICS: "Bioinformatics",
  PHARMACEUTICAL_SALES: "Pharmaceutical Sales & Marketing",
  SUPPLY_CHAIN: "Supply Chain Management",
  PROJECT_MANAGEMENT: "Project Management",
};

// Enhanced skill mappings with category assignments (comprehensive pharma and tech skills)
export const ENHANCED_SKILL_DICTIONARY: Record<
  string,
  {
    normalized: string;
    category: string;
    aliases: string[];
    level?: "beginner" | "intermediate" | "advanced";
    relatedSkills?: string[];
  }
> = {
  // PROGRAMMING LANGUAGES (2024 Top Skills)
  python: {
    normalized: "Python",
    category: SKILL_CATEGORIES.PROGRAMMING_LANGUAGES,
    aliases: ["python3", "py", "python programming"],
    relatedSkills: ["Django", "Flask", "FastAPI", "Pandas", "NumPy", "Machine Learning"],
  },
  javascript: {
    normalized: "JavaScript",
    category: SKILL_CATEGORIES.PROGRAMMING_LANGUAGES,
    aliases: ["js", "ecmascript", "es6", "es2015"],
    relatedSkills: ["TypeScript", "React", "Node.js", "Vue.js"],
  },
  java: {
    normalized: "Java",
    category: SKILL_CATEGORIES.PROGRAMMING_LANGUAGES,
    aliases: ["java programming", "jdk", "jvm"],
    relatedSkills: ["Spring Boot", "Maven", "Gradle", "Android"],
  },
  typescript: {
    normalized: "TypeScript",
    category: SKILL_CATEGORIES.PROGRAMMING_LANGUAGES,
    aliases: ["ts"],
    relatedSkills: ["JavaScript", "Angular", "React", "Node.js"],
  },
  csharp: {
    normalized: "C#",
    category: SKILL_CATEGORIES.PROGRAMMING_LANGUAGES,
    aliases: ["c sharp", "csharp", "dotnet", ".net"],
    relatedSkills: ["ASP.NET", ".NET Core", "Entity Framework"],
  },
  cplusplus: {
    normalized: "C++",
    category: SKILL_CATEGORIES.PROGRAMMING_LANGUAGES,
    aliases: ["cpp", "c plus plus"],
    relatedSkills: ["C", "Systems Programming", "Game Development"],
  },
  go: {
    normalized: "Go",
    category: SKILL_CATEGORIES.PROGRAMMING_LANGUAGES,
    aliases: ["golang", "go language"],
    relatedSkills: ["Docker", "Kubernetes", "Microservices"],
  },
  rust: {
    normalized: "Rust",
    category: SKILL_CATEGORIES.PROGRAMMING_LANGUAGES,
    aliases: ["rust language", "rust programming"],
    relatedSkills: ["Systems Programming", "WebAssembly"],
  },
  swift: {
    normalized: "Swift",
    category: SKILL_CATEGORIES.PROGRAMMING_LANGUAGES,
    aliases: ["swift programming", "ios swift"],
    relatedSkills: ["iOS Development", "Xcode", "UIKit"],
  },
  kotlin: {
    normalized: "Kotlin",
    category: SKILL_CATEGORIES.PROGRAMMING_LANGUAGES,
    aliases: ["kotlin programming"],
    relatedSkills: ["Android", "Java", "Spring"],
  },
  php: {
    normalized: "PHP",
    category: SKILL_CATEGORIES.PROGRAMMING_LANGUAGES,
    aliases: ["php programming"],
    relatedSkills: ["Laravel", "WordPress", "MySQL"],
  },
  r: {
    normalized: "R Programming",
    category: SKILL_CATEGORIES.DATA_SCIENCE,
    aliases: ["r", "r language", "r statistical", "r studio"],
    relatedSkills: ["Statistics", "Data Analysis", "Bioinformatics", "Biostatistics"],
  },
  sql: {
    normalized: "SQL",
    category: SKILL_CATEGORIES.DATABASES,
    aliases: ["structured query language", "sql programming"],
    relatedSkills: ["Database Design", "PostgreSQL", "MySQL", "Data Analysis"],
  },

  // WEB FRAMEWORKS & LIBRARIES
  react: {
    normalized: "React",
    category: SKILL_CATEGORIES.FRAMEWORKS,
    aliases: ["reactjs", "react.js"],
    relatedSkills: ["JavaScript", "TypeScript", "Redux", "Next.js"],
  },
  angular: {
    normalized: "Angular",
    category: SKILL_CATEGORIES.FRAMEWORKS,
    aliases: ["angularjs", "angular2", "angular framework"],
    relatedSkills: ["TypeScript", "RxJS", "NgRx"],
  },
  vue: {
    normalized: "Vue.js",
    category: SKILL_CATEGORIES.FRAMEWORKS,
    aliases: ["vuejs", "vue.js", "vue3", "nuxt"],
    relatedSkills: ["JavaScript", "TypeScript", "Vuex"],
  },
  nodejs: {
    normalized: "Node.js",
    category: SKILL_CATEGORIES.FRAMEWORKS,
    aliases: ["node", "nodejs", "node js"],
    relatedSkills: ["JavaScript", "Express.js", "npm", "API Development"],
  },
  express: {
    normalized: "Express.js",
    category: SKILL_CATEGORIES.FRAMEWORKS,
    aliases: ["express", "expressjs"],
    relatedSkills: ["Node.js", "JavaScript", "API Development"],
  },
  django: {
    normalized: "Django",
    category: SKILL_CATEGORIES.FRAMEWORKS,
    aliases: ["django framework"],
    relatedSkills: ["Python", "PostgreSQL", "REST API"],
  },
  flask: {
    normalized: "Flask",
    category: SKILL_CATEGORIES.FRAMEWORKS,
    aliases: ["flask framework"],
    relatedSkills: ["Python", "API Development", "Microservices"],
  },
  springboot: {
    normalized: "Spring Boot",
    category: SKILL_CATEGORIES.FRAMEWORKS,
    aliases: ["spring", "spring framework"],
    relatedSkills: ["Java", "Maven", "REST API", "Microservices"],
  },

  // CLOUD PLATFORMS
  aws: {
    normalized: "Amazon Web Services",
    category: SKILL_CATEGORIES.CLOUD_PLATFORMS,
    aliases: ["aws", "amazon web services", "ec2", "s3", "lambda"],
    relatedSkills: ["Docker", "Kubernetes", "Terraform", "DevOps"],
  },
  azure: {
    normalized: "Microsoft Azure",
    category: SKILL_CATEGORIES.CLOUD_PLATFORMS,
    aliases: ["azure", "microsoft azure", "azure cloud"],
    relatedSkills: ["Docker", "Kubernetes", "ARM Templates"],
  },
  googlecloud: {
    normalized: "Google Cloud Platform",
    category: SKILL_CATEGORIES.CLOUD_PLATFORMS,
    aliases: ["gcp", "google cloud", "google cloud platform"],
    relatedSkills: ["Docker", "Kubernetes", "Terraform"],
  },

  // DATABASES
  postgresql: {
    normalized: "PostgreSQL",
    category: SKILL_CATEGORIES.DATABASES,
    aliases: ["postgres", "psql"],
    relatedSkills: ["SQL", "Database Design"],
  },
  mysql: {
    normalized: "MySQL",
    category: SKILL_CATEGORIES.DATABASES,
    aliases: ["my sql"],
    relatedSkills: ["SQL", "Database Design"],
  },
  mongodb: {
    normalized: "MongoDB",
    category: SKILL_CATEGORIES.DATABASES,
    aliases: ["mongo", "mongodb atlas"],
    relatedSkills: ["NoSQL", "Database Design"],
  },
  redis: {
    normalized: "Redis",
    category: SKILL_CATEGORIES.DATABASES,
    aliases: ["redis cache", "redis database"],
    relatedSkills: ["Caching", "NoSQL", "Performance Optimization"],
  },

  // AI & MACHINE LEARNING
  machinelearning: {
    normalized: "Machine Learning",
    category: SKILL_CATEGORIES.AI_MACHINE_LEARNING,
    aliases: ["ml", "machine learning", "artificial intelligence", "ai"],
    relatedSkills: ["Python", "TensorFlow", "PyTorch", "Data Science"],
  },
  tensorflow: {
    normalized: "TensorFlow",
    category: SKILL_CATEGORIES.AI_MACHINE_LEARNING,
    aliases: ["tensor flow"],
    relatedSkills: ["Machine Learning", "Python", "Deep Learning"],
  },
  pytorch: {
    normalized: "PyTorch",
    category: SKILL_CATEGORIES.AI_MACHINE_LEARNING,
    aliases: ["py torch"],
    relatedSkills: ["Machine Learning", "Python", "Deep Learning"],
  },

  // DATA SCIENCE
  dataanalysis: {
    normalized: "Data Analysis",
    category: SKILL_CATEGORIES.DATA_SCIENCE,
    aliases: ["data analytics", "data analysis"],
    relatedSkills: ["Python", "R", "SQL", "Statistics"],
  },
  pandas: {
    normalized: "Pandas",
    category: SKILL_CATEGORIES.DATA_SCIENCE,
    aliases: ["pandas python", "python pandas"],
    relatedSkills: ["Python", "Data Analysis", "NumPy"],
  },
  numpy: {
    normalized: "NumPy",
    category: SKILL_CATEGORIES.DATA_SCIENCE,
    aliases: ["numpy python", "python numpy"],
    relatedSkills: ["Python", "Data Analysis", "Pandas"],
  },

  // DEVOPS
  docker: {
    normalized: "Docker",
    category: SKILL_CATEGORIES.DEVOPS,
    aliases: ["containerization", "containers"],
    relatedSkills: ["Kubernetes", "DevOps", "CI/CD"],
  },
  kubernetes: {
    normalized: "Kubernetes",
    category: SKILL_CATEGORIES.DEVOPS,
    aliases: ["k8s", "kube", "orchestration"],
    relatedSkills: ["Docker", "DevOps", "Cloud Platforms"],
  },
  terraform: {
    normalized: "Terraform",
    category: SKILL_CATEGORIES.DEVOPS,
    aliases: ["infrastructure as code", "iac"],
    relatedSkills: ["AWS", "Azure", "GCP", "DevOps"],
  },

  // PHARMACEUTICAL SKILLS
  
  // Clinical Research
  clinicalresearch: {
    normalized: "Clinical Research",
    category: SKILL_CATEGORIES.CLINICAL_RESEARCH,
    aliases: ["clinical trials", "clinical studies", "clinical development"],
    relatedSkills: ["GCP", "Regulatory Affairs", "Data Management"],
  },
  goodclinicalpractice: {
    normalized: "Good Clinical Practice",
    category: SKILL_CATEGORIES.CLINICAL_RESEARCH,
    aliases: ["gcp", "good clinical practice", "gcp guidelines"],
    relatedSkills: ["Clinical Research", "Regulatory Affairs", "ICH"],
  },
  cra: {
    normalized: "Clinical Research Associate",
    category: SKILL_CATEGORIES.CLINICAL_RESEARCH,
    aliases: ["cra", "clinical monitoring", "site management"],
    relatedSkills: ["Clinical Research", "GCP", "Site Management"],
  },
  clinicaldatamanagement: {
    normalized: "Clinical Data Management",
    category: SKILL_CATEGORIES.CLINICAL_RESEARCH,
    aliases: ["cdm", "clinical data", "edc", "electronic data capture"],
    relatedSkills: ["Clinical Research", "SAS", "Database Design"],
  },
  sas: {
    normalized: "SAS Programming",
    category: SKILL_CATEGORIES.DATA_SCIENCE,
    aliases: ["sas", "sas programming", "statistical analysis system"],
    relatedSkills: ["Statistics", "Clinical Data Management", "Biostatistics"],
  },
  biostatistics: {
    normalized: "Biostatistics",
    category: SKILL_CATEGORIES.DATA_SCIENCE,
    aliases: ["biostatistics", "medical statistics", "clinical statistics"],
    relatedSkills: ["Statistics", "SAS", "R Programming", "Clinical Research"],
  },

  // Drug Discovery
  drugdiscovery: {
    normalized: "Drug Discovery",
    category: SKILL_CATEGORIES.DRUG_DISCOVERY,
    aliases: ["drug development", "pharmaceutical research"],
    relatedSkills: ["Medicinal Chemistry", "Pharmacology", "Drug Development"],
  },
  medicinalchemistry: {
    normalized: "Medicinal Chemistry",
    category: SKILL_CATEGORIES.DRUG_DISCOVERY,
    aliases: ["drug design", "pharmaceutical chemistry"],
    relatedSkills: ["Organic Chemistry", "Drug Discovery", "Pharmacology"],
  },
  pharmacology: {
    normalized: "Pharmacology",
    category: SKILL_CATEGORIES.DRUG_DISCOVERY,
    aliases: ["drug action", "pharmacokinetics", "pharmacodynamics"],
    relatedSkills: ["Drug Discovery", "Toxicology", "Clinical Pharmacology"],
  },
  toxicology: {
    normalized: "Toxicology",
    category: SKILL_CATEGORIES.DRUG_DISCOVERY,
    aliases: ["safety assessment", "preclinical safety"],
    relatedSkills: ["Pharmacology", "Drug Discovery", "Safety Assessment"],
  },

  // Regulatory Affairs
  regulatoryaffairs: {
    normalized: "Regulatory Affairs",
    category: SKILL_CATEGORIES.REGULATORY_AFFAIRS,
    aliases: ["regulatory", "drug registration", "regulatory compliance"],
    relatedSkills: ["FDA Regulations", "EMA Guidelines", "Drug Registration"],
  },
  fda: {
    normalized: "FDA Regulations",
    category: SKILL_CATEGORIES.REGULATORY_AFFAIRS,
    aliases: ["fda", "food drug administration", "fda guidelines"],
    relatedSkills: ["Regulatory Affairs", "Drug Registration", "Compliance"],
  },
  ema: {
    normalized: "EMA Guidelines",
    category: SKILL_CATEGORIES.REGULATORY_AFFAIRS,
    aliases: ["ema", "european medicines agency"],
    relatedSkills: ["Regulatory Affairs", "EU Regulations", "Drug Registration"],
  },
  ich: {
    normalized: "ICH Guidelines",
    category: SKILL_CATEGORIES.REGULATORY_AFFAIRS,
    aliases: ["ich", "international council harmonisation"],
    relatedSkills: ["Regulatory Affairs", "GCP", "Quality Assurance"],
  },

  // Quality Assurance
  gmp: {
    normalized: "Good Manufacturing Practice",
    category: SKILL_CATEGORIES.QUALITY_ASSURANCE_PHARMA,
    aliases: ["gmp", "good manufacturing practice", "manufacturing quality"],
    relatedSkills: ["Quality Control", "Manufacturing", "Compliance"],
  },
  qualitycontrol: {
    normalized: "Quality Control",
    category: SKILL_CATEGORIES.QUALITY_ASSURANCE_PHARMA,
    aliases: ["qc", "analytical testing", "quality testing"],
    relatedSkills: ["HPLC", "GMP", "Analytical Chemistry"],
  },
  hplc: {
    normalized: "High Performance Liquid Chromatography",
    category: SKILL_CATEGORIES.QUALITY_ASSURANCE_PHARMA,
    aliases: ["hplc", "chromatography"],
    relatedSkills: ["Analytical Chemistry", "Quality Control", "Method Development"],
  },
  validationaqualification: {
    normalized: "Validation and Qualification",
    category: SKILL_CATEGORIES.QUALITY_ASSURANCE_PHARMA,
    aliases: ["validation", "qualification", "equipment validation"],
    relatedSkills: ["GMP", "Quality Assurance", "Compliance"],
  },

  // Pharmacovigilance
  pharmacovigilance: {
    normalized: "Pharmacovigilance",
    category: SKILL_CATEGORIES.PHARMACOVIGILANCE,
    aliases: ["drug safety", "adverse event reporting", "safety surveillance"],
    relatedSkills: ["Drug Safety", "Regulatory Affairs", "Medical Writing"],
  },
  adverseevents: {
    normalized: "Adverse Event Reporting",
    category: SKILL_CATEGORIES.PHARMACOVIGILANCE,
    aliases: ["ae reporting", "adverse events", "safety reporting"],
    relatedSkills: ["Pharmacovigilance", "Drug Safety", "Regulatory Affairs"],
  },
  signaldetection: {
    normalized: "Signal Detection",
    category: SKILL_CATEGORIES.PHARMACOVIGILANCE,
    aliases: ["safety signal", "signal management"],
    relatedSkills: ["Pharmacovigilance", "Statistics", "Data Analysis"],
  },

  // Medical Affairs
  medicalaffairs: {
    normalized: "Medical Affairs",
    category: SKILL_CATEGORIES.MEDICAL_AFFAIRS,
    aliases: ["medical communication", "scientific affairs"],
    relatedSkills: ["Medical Writing", "KOL Management", "Scientific Communication"],
  },
  msl: {
    normalized: "Medical Science Liaison",
    category: SKILL_CATEGORIES.MEDICAL_AFFAIRS,
    aliases: ["msl", "medical liaison", "field medical"],
    relatedSkills: ["Medical Affairs", "KOL Management", "Scientific Communication"],
  },
  medicalwriting: {
    normalized: "Medical Writing",
    category: SKILL_CATEGORIES.MEDICAL_AFFAIRS,
    aliases: ["scientific writing", "regulatory writing", "clinical writing"],
    relatedSkills: ["Medical Affairs", "Regulatory Affairs", "Clinical Research"],
  },

  // Bioinformatics
  bioinformatics: {
    normalized: "Bioinformatics",
    category: SKILL_CATEGORIES.BIOINFORMATICS,
    aliases: ["computational biology", "genomics", "proteomics"],
    relatedSkills: ["Python", "R Programming", "Statistics", "Biology"],
  },
  genomics: {
    normalized: "Genomics",
    category: SKILL_CATEGORIES.BIOINFORMATICS,
    aliases: ["genome analysis", "genetic analysis", "dna sequencing"],
    relatedSkills: ["Bioinformatics", "NGS", "Molecular Biology"],
  },
  ngs: {
    normalized: "Next Generation Sequencing",
    category: SKILL_CATEGORIES.BIOINFORMATICS,
    aliases: ["ngs", "high throughput sequencing", "sequencing analysis"],
    relatedSkills: ["Genomics", "Bioinformatics", "Data Analysis"],
  },

  // Pharmaceutical Manufacturing
  pharmaceuticalmanufacturing: {
    normalized: "Pharmaceutical Manufacturing",
    category: SKILL_CATEGORIES.PHARMACEUTICAL_MANUFACTURING,
    aliases: ["pharma manufacturing", "drug manufacturing", "production"],
    relatedSkills: ["GMP", "Quality Control", "Process Engineering"],
  },
  processengineering: {
    normalized: "Process Engineering",
    category: SKILL_CATEGORIES.PHARMACEUTICAL_MANUFACTURING,
    aliases: ["manufacturing engineering", "process optimization"],
    relatedSkills: ["Manufacturing", "Engineering", "Quality Systems"],
  },

  // Formulation & Analytical Development
  formulationscience: {
    normalized: "Formulation Science",
    category: SKILL_CATEGORIES.DRUG_DISCOVERY,
    aliases: ["drug formulation", "preformulation", "dosage form design"],
    relatedSkills: ["Pharmaceutical Chemistry", "Stability Testing", "Process Development"],
  },
  analyticaldevelopment: {
    normalized: "Analytical Development",
    category: SKILL_CATEGORIES.QUALITY_ASSURANCE_PHARMA,
    aliases: ["method development", "analytical method validation", "impurity analysis"],
    relatedSkills: ["HPLC", "GC-MS", "Method Validation", "Analytical Chemistry"],
  },
  stabilityTesting: {
    normalized: "Stability Testing",
    category: SKILL_CATEGORIES.QUALITY_ASSURANCE_PHARMA,
    aliases: ["stability studies", "shelf life testing", "degradation studies"],
    relatedSkills: ["Analytical Development", "ICH Guidelines", "Regulatory Affairs"],
  },
  bioequivalence: {
    normalized: "Bioavailability/Bioequivalence",
    category: SKILL_CATEGORIES.CLINICAL_RESEARCH,
    aliases: ["ba be studies", "bioequivalence testing", "pk studies"],
    relatedSkills: ["Clinical Research", "Pharmacokinetics", "Regulatory Affairs"],
  },
  dsc: {
    normalized: "Differential Scanning Calorimetry",
    category: SKILL_CATEGORIES.QUALITY_ASSURANCE_PHARMA,
    aliases: ["dsc", "thermal analysis", "tga"],
    relatedSkills: ["Analytical Chemistry", "Formulation Science", "Quality Control"],
  },
  doe: {
    normalized: "Design of Experiments",
    category: SKILL_CATEGORIES.DATA_SCIENCE,
    aliases: ["doe", "experimental design", "statistical design"],
    relatedSkills: ["Statistics", "Process Optimization", "Data Analysis"],
  },

  // Pharmaceutical Packaging & Supply Chain
  packagingengineering: {
    normalized: "Pharmaceutical Packaging Engineering",
    category: SKILL_CATEGORIES.PHARMACEUTICAL_MANUFACTURING,
    aliases: ["package design", "packaging development", "blister packaging"],
    relatedSkills: ["Materials Science", "Regulatory Affairs", "Supply Chain"],
  },
  coldchain: {
    normalized: "Cold Chain Management",
    category: SKILL_CATEGORIES.SUPPLY_CHAIN,
    aliases: ["temperature controlled logistics", "cold storage", "temperature mapping"],
    relatedSkills: ["Supply Chain Management", "GDP", "Distribution"],
  },
  gdp: {
    normalized: "Good Distribution Practice",
    category: SKILL_CATEGORIES.SUPPLY_CHAIN,
    aliases: ["gdp", "distribution compliance", "supply chain compliance"],
    relatedSkills: ["GMP", "Cold Chain Management", "Quality Assurance"],
  },
  serialization: {
    normalized: "Product Serialization",
    category: SKILL_CATEGORIES.SUPPLY_CHAIN,
    aliases: ["track and trace", "pharmaceutical serialization", "anti-counterfeiting"],
    relatedSkills: ["Supply Chain Management", "Regulatory Affairs", "Packaging"],
  },

  // Pharmacoeconomics & Outcomes Research
  pharmacoeconomics: {
    normalized: "Pharmacoeconomics",
    category: SKILL_CATEGORIES.MEDICAL_AFFAIRS,
    aliases: ["health economics", "cost effectiveness analysis", "health technology assessment"],
    relatedSkills: ["Health Economics", "Medical Affairs", "Outcomes Research"],
  },
  healtheconomics: {
    normalized: "Health Economics",
    category: SKILL_CATEGORIES.MEDICAL_AFFAIRS,
    aliases: ["economic evaluation", "budget impact modeling", "payer research"],
    relatedSkills: ["Pharmacoeconomics", "Statistics", "Healthcare Policy"],
  },
  outcomesresearch: {
    normalized: "Outcomes Research",
    category: SKILL_CATEGORIES.MEDICAL_AFFAIRS,
    aliases: ["real world evidence", "patient reported outcomes", "comparative effectiveness"],
    relatedSkills: ["Epidemiology", "Health Economics", "Medical Affairs"],
  },
  realworlddata: {
    normalized: "Real World Data",
    category: SKILL_CATEGORIES.DATA_SCIENCE,
    aliases: ["rwd", "real world evidence", "rwe", "observational studies"],
    relatedSkills: ["Outcomes Research", "Epidemiology", "Data Analysis"],
  },
  proms: {
    normalized: "Patient Reported Outcome Measures",
    category: SKILL_CATEGORIES.CLINICAL_RESEARCH,
    aliases: ["proms", "patient reported outcomes", "quality of life measures"],
    relatedSkills: ["Outcomes Research", "Clinical Research", "Patient Engagement"],
  },

  // Pharmacometrics & Biostatistics
  pharmacometrics: {
    normalized: "Pharmacometrics",
    category: SKILL_CATEGORIES.DATA_SCIENCE,
    aliases: ["population pk pd", "model based drug development", "quantitative pharmacology"],
    relatedSkills: ["Pharmacology", "Statistics", "Clinical Development"],
  },
  nonmem: {
    normalized: "NONMEM",
    category: SKILL_CATEGORIES.DATA_SCIENCE,
    aliases: ["nonlinear mixed effects modeling", "population modeling"],
    relatedSkills: ["Pharmacometrics", "Statistics", "Pharmacology"],
  },
  pkpd: {
    normalized: "Pharmacokinetics/Pharmacodynamics",
    category: SKILL_CATEGORIES.DRUG_DISCOVERY,
    aliases: ["pk pd", "pharmacokinetics", "pharmacodynamics", "adme"],
    relatedSkills: ["Pharmacology", "Clinical Research", "Drug Development"],
  },
  survivalanalysis: {
    normalized: "Survival Analysis",
    category: SKILL_CATEGORIES.DATA_SCIENCE,
    aliases: ["time to event analysis", "kaplan meier", "cox regression"],
    relatedSkills: ["Biostatistics", "Clinical Research", "Epidemiology"],
  },

  // Additional Technology Skills from 2024 Research
  flutter: {
    normalized: "Flutter",
    category: SKILL_CATEGORIES.MOBILE,
    aliases: ["flutter framework", "dart flutter"],
    relatedSkills: ["Dart", "Mobile Development", "Cross-platform Development"],
  },
  reactnative: {
    normalized: "React Native",
    category: SKILL_CATEGORIES.MOBILE,
    aliases: ["react-native", "rn"],
    relatedSkills: ["React", "JavaScript", "Mobile Development"],
  },
  xamarin: {
    normalized: "Xamarin",
    category: SKILL_CATEGORIES.MOBILE,
    aliases: ["xamarin forms", "xamarin native"],
    relatedSkills: ["C#", ".NET", "Mobile Development"],
  },
  jenkins: {
    normalized: "Jenkins",
    category: SKILL_CATEGORIES.DEVOPS,
    aliases: ["jenkins ci cd", "jenkins pipeline"],
    relatedSkills: ["CI/CD", "DevOps", "Automation"],
  },
  githubactions: {
    normalized: "GitHub Actions",
    category: SKILL_CATEGORIES.DEVOPS,
    aliases: ["github ci cd", "gh actions"],
    relatedSkills: ["Git", "CI/CD", "DevOps"],
  },
  ansible: {
    normalized: "Ansible",
    category: SKILL_CATEGORIES.DEVOPS,
    aliases: ["ansible automation", "configuration management"],
    relatedSkills: ["DevOps", "Infrastructure as Code", "Automation"],
  },
  prometheus: {
    normalized: "Prometheus",
    category: SKILL_CATEGORIES.DEVOPS,
    aliases: ["prometheus monitoring"],
    relatedSkills: ["Monitoring", "Grafana", "DevOps"],
  },
  grafana: {
    normalized: "Grafana",
    category: SKILL_CATEGORIES.DEVOPS,
    aliases: ["grafana dashboard", "data visualization"],
    relatedSkills: ["Prometheus", "Monitoring", "Data Visualization"],
  },
  elasticsearch: {
    normalized: "Elasticsearch",
    category: SKILL_CATEGORIES.DATABASES,
    aliases: ["elastic search", "elk stack"],
    relatedSkills: ["Search Engine", "Data Analysis", "Kibana"],
  },
  solidity: {
    normalized: "Solidity",
    category: SKILL_CATEGORIES.PROGRAMMING_LANGUAGES,
    aliases: ["solidity programming", "smart contracts"],
    relatedSkills: ["Blockchain", "Ethereum", "Smart Contracts"],
  },
  blockchain: {
    normalized: "Blockchain",
    category: SKILL_CATEGORIES.SECURITY,
    aliases: ["blockchain technology", "distributed ledger", "cryptocurrency"],
    relatedSkills: ["Solidity", "Smart Contracts", "Cryptography"],
  },

  // SOFT SKILLS
  leadership: {
    normalized: "Leadership",
    category: SKILL_CATEGORIES.SOFT_SKILLS,
    aliases: ["team leadership", "team lead", "management"],
    relatedSkills: ["Communication", "Project Management", "Team Building"],
  },
  communication: {
    normalized: "Communication",
    category: SKILL_CATEGORIES.SOFT_SKILLS,
    aliases: ["verbal communication", "written communication", "presentation skills"],
    relatedSkills: ["Leadership", "Collaboration", "Public Speaking"],
  },
  projectmanagement: {
    normalized: "Project Management",
    category: SKILL_CATEGORIES.PROJECT_MANAGEMENT,
    aliases: ["project planning", "pmp", "agile", "scrum"],
    relatedSkills: ["Leadership", "Planning", "Risk Management"],
  },
  analyticalthinking: {
    normalized: "Analytical Thinking",
    category: SKILL_CATEGORIES.SOFT_SKILLS,
    aliases: ["problem solving", "critical thinking", "analysis"],
    relatedSkills: ["Data Analysis", "Decision Making", "Research"],
  },
  collaboration: {
    normalized: "Collaboration",
    category: SKILL_CATEGORIES.SOFT_SKILLS,
    aliases: ["teamwork", "team collaboration", "cross functional"],
    relatedSkills: ["Communication", "Leadership", "Interpersonal Skills"],
  },
};

/**
 * Initialize skill categories and skills in the database
 */
export async function initializeSkillHierarchy(): Promise<void> {
  try {
    logger.info("Initializing skill hierarchy...");

    // Create skill categories
    for (const [key, categoryName] of Object.entries(SKILL_CATEGORIES)) {
      await db
        .insert(skillCategories)
        .values({
          name: categoryName,
          level: 0,
          description: `Skills related to ${categoryName.toLowerCase()}`,
        })
        .onConflictDoNothing();
    }

    // Create skills with embeddings
    for (const [key, skillData] of Object.entries(ENHANCED_SKILL_DICTIONARY)) {
      try {
        // Find category ID
        const category = await db
          .select()
          .from(skillCategories)
          .where(eq(skillCategories.name, skillData.category))
          .limit(1);

        if (category.length === 0) {
          logger.warn(`Category not found: ${skillData.category}`);
          continue;
        }

        // Generate embedding for the skill
        const embedding = await generateEmbedding(skillData.normalized);

        // Insert skill (only if not exists to avoid conflicts)
        try {
          await db
            .insert(skillsTable)
            .values({
              name: skillData.normalized,
              normalizedName: skillData.normalized.toLowerCase(),
              categoryId: category[0].id,
              aliases: skillData.aliases,
              embedding: embedding,
              description: `${skillData.normalized} - ${skillData.category}`,
            })
            .onConflictDoNothing();
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (
            !errorMessage?.includes("duplicate") &&
            !errorMessage?.includes("unique")
          ) {
            throw error;
          }
        }
      } catch (error) {
        logger.error(`Error creating skill ${skillData.normalized}:`, error);
      }
    }

    logger.info("Skill hierarchy initialization completed");
  } catch (error) {
    logger.error("Error initializing skill hierarchy:", error);
    throw error;
  }
}

/**
 * Enhanced skill normalization using hierarchy and embeddings
 */
export async function normalizeSkillWithHierarchy(skill: string): Promise<{
  normalized: string;
  category?: string;
  confidence: number;
  method: "exact" | "alias" | "fuzzy" | "semantic";
}> {
  const lowerSkill = skill.toLowerCase().trim();

  try {
    // 1. Try exact match
    const exactMatch = await db
      .select()
      .from(skillsTable)
      .where(eq(skillsTable.normalizedName, lowerSkill))
      .limit(1);

    if (exactMatch.length > 0) {
      const category = await db
        .select()
        .from(skillCategories)
        .where(eq(skillCategories.id, exactMatch[0].categoryId || 0))
        .limit(1);

      return {
        normalized: exactMatch[0].name,
        category: category[0]?.name,
        confidence: 1.0,
        method: "exact",
      };
    }

    // 2. Try alias matching
    const aliasMatches = await db
      .select()
      .from(skillsTable)
      .where(sql`aliases::text LIKE ${`%"${lowerSkill}"%`}`);

    if (aliasMatches.length > 0) {
      const bestMatch = aliasMatches[0];
      const category = await db
        .select()
        .from(skillCategories)
        .where(eq(skillCategories.id, bestMatch.categoryId || 0))
        .limit(1);

      return {
        normalized: bestMatch.name,
        category: category[0]?.name,
        confidence: 0.95,
        method: "alias",
      };
    }

    // 3. Try fuzzy string matching
    const allSkills = await db.select().from(skillsTable);
    
    // If skills database is empty or has issues, return original skill with appropriate confidence
    if (!allSkills || allSkills.length === 0) {
      logger.warn("Skills database is empty or unavailable, returning original skill without normalization", {
        skill,
        timestamp: new Date().toISOString(),
      });
      return {
        normalized: skill,
        confidence: 0.1, // Very low confidence since no processing occurred
        method: "fuzzy", // Use fuzzy as fallback method for unprocessed skills
      };
    }
    
    const skillNames = allSkills.map((s: any) => s.name);
    const fuzzyMatch = stringSimilarity.findBestMatch(skill, skillNames);

    if (fuzzyMatch.bestMatch.rating > 0.7) {
      const matchedSkill = allSkills.find(
        (s: any) => s.name === fuzzyMatch.bestMatch.target,
      );
      if (matchedSkill) {
        const category = await db
          .select()
          .from(skillCategories)
          .where(eq(skillCategories.id, matchedSkill.categoryId || 0))
          .limit(1);

        return {
          normalized: matchedSkill.name,
          category: category[0]?.name,
          confidence: fuzzyMatch.bestMatch.rating,
          method: "fuzzy",
        };
      }
    }

    // 4. Try semantic similarity using embeddings
    const queryEmbedding = await generateEmbedding(skill);
    let bestSemanticMatch = null;
    let bestSimilarity = 0;

    for (const dbSkill of allSkills) {
      if (dbSkill.embedding && Array.isArray(dbSkill.embedding)) {
        const similarity = cosineSimilarity(queryEmbedding, dbSkill.embedding);
        if (similarity > bestSimilarity && similarity > 0.6) {
          bestSimilarity = similarity;
          bestSemanticMatch = dbSkill;
        }
      }
    }

    if (bestSemanticMatch) {
      const category = await db
        .select()
        .from(skillCategories)
        .where(eq(skillCategories.id, bestSemanticMatch.categoryId || 0))
        .limit(1);

      return {
        normalized: bestSemanticMatch.name,
        category: category[0]?.name,
        confidence: bestSimilarity,
        method: "semantic",
      };
    }

    // 5. Final fallback - no matches found at all
    logger.debug("No skill matches found, returning original skill", {
      skill,
      timestamp: new Date().toISOString(),
    });
    return {
      normalized: skill,
      confidence: 0.2, // Low confidence for unmatched skills
      method: "fuzzy", // Use fuzzy as fallback method for unmatched skills
    };
  } catch (error) {
    logger.error("Error in skill normalization:", {
      error: error instanceof Error ? error.message : "Unknown error",
      skill,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      normalized: skill,
      confidence: 0.05, // Very low confidence for error cases
      method: "fuzzy", // Use fuzzy as fallback method for error cases
    };
  }
}

/**
 * Get skills by category
 */
export async function getSkillsByCategory(
  categoryName: string,
): Promise<Skill[]> {
  try {
    const category = await db
      .select()
      .from(skillCategories)
      .where(eq(skillCategories.name, categoryName))
      .limit(1);

    if (category.length === 0) {
      return [];
    }

    return await db
      .select()
      .from(skillsTable)
      .where(eq(skillsTable.categoryId, category[0].id));
  } catch (error) {
    logger.error("Error getting skills by category:", error);
    return [];
  }
}

/**
 * Find related skills using embeddings
 */
export async function findRelatedSkills(
  skill: string,
  limit: number = 5,
): Promise<
  Array<{
    skill: string;
    similarity: number;
    category?: string;
  }>
> {
  try {
    const queryEmbedding = await generateEmbedding(skill);
    const allSkills = await db.select().from(skillsTable);

    const similarities: Array<{
      skill: string;
      similarity: number;
      category?: string;
    }> = [];

    for (const dbSkill of allSkills) {
      if (
        dbSkill.embedding &&
        Array.isArray(dbSkill.embedding) &&
        dbSkill.name !== skill
      ) {
        const similarity = cosineSimilarity(queryEmbedding, dbSkill.embedding);
        if (similarity > 0.5) {
          const category = await db
            .select()
            .from(skillCategories)
            .where(eq(skillCategories.id, dbSkill.categoryId || 0))
            .limit(1);

          similarities.push({
            skill: dbSkill.name,
            similarity: similarity,
            category: category[0]?.name,
          });
        }
      }
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  } catch (error) {
    logger.error("Error finding related skills:", error);
    return [];
  }
}

/**
 * Enhanced skill extraction using ESCO taxonomy
 * Combines traditional skill matching with ESCO skill extraction
 */
export async function extractSkillsWithESCO(text: string): Promise<{
  skills: string[];
  escoSkills: ESCOSkill[];
  pharmaRelated: boolean;
  categories: string[];
}> {
  try {
    logger.info('Starting enhanced skill extraction with ESCO', {
      textLength: text.length
    });

    // Run ESCO extraction
    const escoResult = await escoExtractor.extractSkills(text);
    const pharmaRelated = await escoExtractor.isPharmaRelated(text);

    // Extract skills from ESCO results
    const escoSkills = escoResult.skills || [];
    const escoSkillNames = escoSkills.map(skill => skill.skill);

    // Get traditional skills using existing normalization
    const traditionalSkills: string[] = [];
    
    // Try to normalize each ESCO skill through our existing system
    for (const escoSkillName of escoSkillNames) {
      try {
        const normalized = await normalizeSkillWithHierarchy(escoSkillName);
        if (normalized.confidence > 0.5) {
          traditionalSkills.push(normalized.normalized);
        } else {
          // Add ESCO skill directly if not found in traditional system
          traditionalSkills.push(escoSkillName);
        }
      } catch (error) {
        // If database access fails (memory storage mode), add ESCO skill directly
        logger.debug('Database normalization failed, using ESCO skill directly', {
          skill: escoSkillName,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        traditionalSkills.push(escoSkillName);
      }
    }

    // Combine and deduplicate skills
    const allSkills = [...new Set([...traditionalSkills, ...escoSkillNames])];
    
    // Get unique categories
    const categories = [...new Set([
      ...escoSkills.map(skill => skill.category),
      ...escoResult.domains
    ])];

    logger.info('Enhanced skill extraction completed', {
      totalSkills: allSkills.length,
      escoSkills: escoSkills.length,
      traditionalSkills: traditionalSkills.length,
      pharmaRelated,
      categories: categories.length
    });

    return {
      skills: allSkills,
      escoSkills,
      pharmaRelated,
      categories
    };
  } catch (error) {
    logger.error('Enhanced skill extraction failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // Fallback to empty result
    return {
      skills: [],
      escoSkills: [],
      pharmaRelated: false,
      categories: []
    };
  }
}

/**
 * Get enhanced skills for resume or job analysis
 * This replaces the traditional skill extraction in our ML pipeline
 */
export async function getEnhancedSkills(text: string, existingSkills: string[] = []): Promise<string[]> {
  try {
    const enhanced = await extractSkillsWithESCO(text);
    
    // Combine ESCO skills with existing skills
    const combinedSkills = [...new Set([...existingSkills, ...enhanced.skills])];
    
    logger.info('Enhanced skills generated', {
      originalSkills: existingSkills.length,
      escoSkills: enhanced.escoSkills.length,
      finalSkills: combinedSkills.length,
      pharmaContent: enhanced.pharmaRelated
    });
    
    return combinedSkills;
  } catch (error) {
    logger.error('Failed to get enhanced skills', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return existingSkills;
  }
}
