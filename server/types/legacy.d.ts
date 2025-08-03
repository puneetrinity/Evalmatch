// Legacy type declarations - quick fixes for TypeScript errors
declare module 'isomorphic-dompurify' {
  const DOMPurify: any;
  export default DOMPurify;
}

// Augment existing interfaces with missing properties
declare global {
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
      user?: any;
      batchValidation?: any;
    }
  }
  
  interface SimpleBiasAnalysis {
    biasScore?: number;
    fairnessAssessment?: string;
  }
  
  interface UserTierInfo {
    maxAnalyses?: number;
  }
  
  interface ConnectionStats {
    environment?: string;
    serverType?: string;
    lastSuccessfulQuery?: Date;
  }
  
  // Storage interface extension
  interface IStorage {
    storage?: any;
    firebaseConnection?: any;
    updateResume?: any;
  }
  
  // Resume interface extension
  interface Resume {
    created?: Date;
    analysis?: any;
  }
  
  // Job description interface extension  
  interface JobDescription {
    created?: Date;
  }
  
  // Interview questions interface extension
  interface InterviewQuestions {
    technicalQuestions?: any[];
    experienceQuestions?: any[];
    skillGapQuestions?: any[];
  }
}