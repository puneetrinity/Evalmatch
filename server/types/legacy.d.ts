// Legacy type declarations - quick fixes for TypeScript errors
declare module 'isomorphic-dompurify' {
  const DOMPurify: { sanitize: (_input: string, _config?: object) => string };
  export default DOMPurify;
}

// Augment existing interfaces with missing properties
declare global {
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
      user?: { uid: string; email?: string };
      batchValidation?: object;
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
    storage?: object;
    firebaseConnection?: object;
    updateResume?: (_id: number, _data: object) => Promise<object>;
  }
  
  // Resume interface extension
  interface Resume {
    created?: Date;
    analysis?: object;
  }
  
  // Job description interface extension  
  interface JobDescription {
    created?: Date;
  }
  
  // Interview questions interface extension
  interface InterviewQuestions {
    technicalQuestions?: string[];
    experienceQuestions?: string[];
    skillGapQuestions?: string[];
  }
}