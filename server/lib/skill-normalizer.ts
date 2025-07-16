/**
 * Skill Normalizer Module
 * 
 * Handles normalization of skill names to create a more consistent matching experience.
 * - Converts variations of the same skill to a canonical form
 * - Handles acronyms and abbreviations
 * - Performs basic fuzzy matching for similar terms
 */

import stringSimilarity from 'string-similarity';

// Dictionary of common variations and their canonical forms
const SKILL_DICTIONARY: Record<string, string> = {
  // Programming Languages
  'javascript': 'JavaScript',
  'js': 'JavaScript',
  'typescript': 'TypeScript',
  'ts': 'TypeScript',
  'python': 'Python',
  'py': 'Python',
  'java': 'Java',
  'c#': 'C#',
  'csharp': 'C#',
  'c++': 'C++',
  'cpp': 'C++',
  'php': 'PHP',
  'ruby': 'Ruby',
  'go': 'Go',
  'golang': 'Go',
  'rust': 'Rust',
  'swift': 'Swift',
  'kotlin': 'Kotlin',
  'scala': 'Scala',
  
  // Frameworks & Libraries
  'react': 'React',
  'react.js': 'React',
  'reactjs': 'React',
  'angular': 'Angular',
  'angular.js': 'Angular',
  'angularjs': 'Angular',
  'vue': 'Vue.js',
  'vue.js': 'Vue.js',
  'vuejs': 'Vue.js',
  'node': 'Node.js',
  'node.js': 'Node.js',
  'nodejs': 'Node.js',
  'express': 'Express.js',
  'express.js': 'Express.js',
  'expressjs': 'Express.js',
  'django': 'Django',
  'flask': 'Flask',
  'spring': 'Spring',
  'spring boot': 'Spring Boot',
  'springboot': 'Spring Boot',
  '.net': '.NET',
  'dotnet': '.NET',
  'laravel': 'Laravel',
  'symfony': 'Symfony',
  
  // Databases
  'sql': 'SQL',
  'mysql': 'MySQL',
  'postgresql': 'PostgreSQL',
  'postgres': 'PostgreSQL',
  'mongodb': 'MongoDB',
  'mongo': 'MongoDB',
  'oracle': 'Oracle Database',
  'oracle db': 'Oracle Database',
  'oracle database': 'Oracle Database',
  'sqlserver': 'SQL Server',
  'sql server': 'SQL Server',
  'redis': 'Redis',
  'elasticsearch': 'Elasticsearch',
  
  // Common Acronyms
  'ai': 'Artificial Intelligence',
  'ml': 'Machine Learning',
  'nlp': 'Natural Language Processing',
  'cv': 'Computer Vision',
  'dl': 'Deep Learning',
  'oop': 'Object-Oriented Programming',
  'api': 'API Development',
  'aws': 'AWS',
  'azure': 'Microsoft Azure',
  'gcp': 'Google Cloud Platform',
  'google cloud': 'Google Cloud Platform',
  'ci': 'CI/CD',
  'cd': 'CI/CD',
  'ci/cd': 'CI/CD',
  'devops': 'DevOps',
  'ui': 'UI Design',
  'ux': 'UX Design',
  'ui/ux': 'UI/UX Design',
  
  // Soft Skills
  'leadership': 'Leadership',
  'team management': 'Team Management',
  'project management': 'Project Management',
  'communications': 'Communication',
  'communication skills': 'Communication',
  'problem solving': 'Problem Solving',
  'problem-solving': 'Problem Solving',
  'critical thinking': 'Critical Thinking',
  'time management': 'Time Management',
  'presentation': 'Presentation Skills',
  'presenting': 'Presentation Skills',
  'presentation skills': 'Presentation Skills',
  'teamwork': 'Teamwork',
  'team player': 'Teamwork',
  'team work': 'Teamwork',
  'collaboration': 'Collaboration',
  'analytical': 'Analytical Skills',
  'analytical skills': 'Analytical Skills',
  'analysis': 'Analytical Skills',
  
  // Recruiting related
  'talent acquisition': 'Talent Acquisition',
  'recruitment': 'Recruitment',
  'recruiting': 'Recruitment',
  'sourcing': 'Candidate Sourcing',
  'candidate sourcing': 'Candidate Sourcing',
  'ats': 'ATS',
  'applicant tracking system': 'ATS',
  'applicant tracking systems': 'ATS',
  'interviewing': 'Interviewing',
  'interview': 'Interviewing',
  'headhunting': 'Headhunting',
  'executive search': 'Executive Search',
  'hiring': 'Hiring',
  'onboarding': 'Onboarding',
  'employee retention': 'Employee Retention',
  'talent management': 'Talent Management',
  'hr': 'Human Resources',
  'human resources': 'Human Resources',
};

/**
 * Normalize a skill name to its canonical form
 * @param skillName The raw skill name to normalize
 * @returns The normalized skill name
 */
export function normalizeSkill(skillName: string): string {
  if (!skillName) return '';
  
  // Prepare the skill name
  const prepared = skillName
    .toLowerCase()
    .trim()
    .replace(/^experience (with|in) /i, '')
    .replace(/^knowledge of /i, '')
    .replace(/^proficiency (with|in) /i, '')
    .replace(/^skilled (with|in) /i, '')
    .replace(/ experience$/i, '')
    .replace(/ programming$/i, '');
  
  // Direct lookup
  if (SKILL_DICTIONARY[prepared]) {
    return SKILL_DICTIONARY[prepared];
  }
  
  // Try fuzzy matching if no direct match
  const keys = Object.keys(SKILL_DICTIONARY);
  const matches = stringSimilarity.findBestMatch(prepared, keys);
  
  // Only use fuzzy match if it's a good match (rating > 0.8)
  if (matches.bestMatch.rating > 0.8) {
    const bestMatchKey = matches.bestMatch.target;
    return SKILL_DICTIONARY[bestMatchKey];
  }
  
  // If no good match, return the original with proper capitalization
  return capitalizeFirstLetter(skillName.trim());
}

/**
 * Normalize an array of skills
 * @param skills Array of skill names or skill objects
 * @returns Array of normalized skill objects
 */
export function normalizeSkills(skills: any[]): any[] {
  if (!Array.isArray(skills)) return [];
  
  return skills.map(skill => {
    // If skill is a string
    if (typeof skill === 'string') {
      return {
        skill: normalizeSkill(skill),
        matchPercentage: 100 // Default match percentage
      };
    }
    
    // If skill is an object with a skill property
    if (typeof skill === 'object' && skill !== null && typeof skill.skill === 'string') {
      return {
        ...skill,
        skill: normalizeSkill(skill.skill)
      };
    }
    
    // If skill is an object with a skill_name property
    if (typeof skill === 'object' && skill !== null && typeof skill.skill_name === 'string') {
      return {
        ...skill,
        skill: normalizeSkill(skill.skill_name),
        skill_name: normalizeSkill(skill.skill_name)
      };
    }
    
    // If it's some other format, return as is
    return skill;
  });
}

/**
 * Helper function to capitalize first letter of a string
 */
function capitalizeFirstLetter(string: string): string {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Feature flag to enable/disable skill normalization
export const SKILL_NORMALIZATION_ENABLED = process.env.USE_SKILL_NORMALIZATION !== 'false';