import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import StepProgress from "@/components/step-progress";
import { useSteps } from "@/hooks/use-steps";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { getInitials, stringToColor } from "@/lib/file-utils";

// Question can be either a string or an object with question and difficulty properties
type Question = string | {
  question: string;
  difficulty?: 'Green' | 'Orange' | 'Red' | string;
};

type InterviewQuestions = {
  id: number;
  resumeId: number;
  resumeName: string;
  jobDescriptionId: number;
  jobTitle: string;
  matchPercentage: number;
  technicalQuestions: Question[];
  experienceQuestions: Question[];
  skillGapQuestions: Question[];
  inclusionQuestions?: Question[];
};

// Types for analysis data
type MatchedSkill = {
  skill: string;
  matchPercentage: number;
};

type MatchAnalysis = {
  matchPercentage: number;
  matchedSkills: MatchedSkill[];
  missingSkills: string[];
  candidateStrengths?: string[];
  candidateWeaknesses?: string[];
  fairnessMetrics?: {
    biasConfidenceScore: number;
    potentialBiasAreas: string[];
    fairnessAssessment: string;
  };
};

type AnalysisData = {
  match?: MatchAnalysis;
};

export default function InterviewPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const { steps } = useSteps(["Resume Upload", "Job Description", "Bias Detection", "Fit Analysis", "Interview Prep"], 4);
  // This is the fifth step (Interview Prep)
  
  const [match, routeParams] = useRoute("/interview/:resumeId/:jobId");
  const resumeId = match ? parseInt(routeParams.resumeId) : 0;
  const jobId = match ? parseInt(routeParams.jobId) : 0;
  
  // Get the current session ID from localStorage
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  // Load session ID from localStorage when component mounts
  useEffect(() => {
    const storedSessionId = localStorage.getItem('currentUploadSession');
    setSessionId(storedSessionId);
    console.log(`Loaded upload session for interview questions: ${storedSessionId}`);
  }, []);
  
  // Fetch interview questions
  const {
    data: questionsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: [`/api/interview-questions/${resumeId}/${jobId}`, sessionId],
    queryFn: async ({ queryKey }) => {
      const url = sessionId 
        ? `${queryKey[0]}?sessionId=${encodeURIComponent(sessionId)}`
        : String(queryKey[0]);
      
      console.log(`Fetching interview questions from: ${url}`);
      
      const response = await apiRequest("POST", url);
      
      if (!response.ok) {
        throw new Error("Failed to generate interview questions");
      }
      
      return response.json();
    },
    enabled: !!resumeId && !!jobId,
  });

  // Fetch analysis data to get missing skills details with authentication
  const {
    data: analysisData,
    isLoading: isAnalysisLoading,
  } = useQuery<AnalysisData>({
    queryKey: [`/api/analysis/analyze/${jobId}/${resumeId}`],
    queryFn: async ({ queryKey }) => {
      const response = await apiRequest("GET", String(queryKey[0]));
      return response.json();
    },
    enabled: !!resumeId && !!jobId,
    retry: 1,
  });
  
  // Handle print button click
  const handlePrint = () => {
    window.print();
  };

  // Get missing skills from analysis data
  const getMissingSkills = (): string[] => {
    if (!analysisData || !analysisData.match) return [];
    return analysisData.match.missingSkills || [];
  };

  // Get matched skills from analysis data
  const getMatchedSkills = (): MatchedSkill[] => {
    if (!analysisData || !analysisData.match) return [];
    
    const matchedSkills = analysisData.match.matchedSkills || [];
    
    // Handle both array of strings and array of objects formats
    return matchedSkills.map((skill: any, index: number) => {
      if (typeof skill === 'string') {
        return { skill, matchPercentage: 100 };
      } else if (skill && typeof skill === 'object') {
        // Make sure the skill property exists and is a string
        return { 
          skill: (skill.skill && typeof skill.skill === 'string') 
            ? skill.skill 
            : `Relevant Skill ${index + 1}`,
          matchPercentage: typeof skill.matchPercentage === 'number' 
            ? skill.matchPercentage 
            : 100
        };
      }
      // Fallback for any other unexpected format
      return { skill: `Relevant Skill ${index + 1}`, matchPercentage: 100 };
    });
  };
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <StepProgress steps={steps} />
        
        <div className="mt-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Interview Preparation</h1>
          <p className="text-gray-600 mb-8">
            Based on the job requirements and candidate profile, here are custom interview questions to help assess the candidate.
          </p>
          
          {isLoading || isAnalysisLoading ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4 mx-auto"></div>
              <h3 className="text-xl font-semibold mb-2">Generating Interview Questions</h3>
              <p className="text-gray-600">
                Our AI is creating customized questions based on the candidate's profile and job requirements. This might take a moment...
              </p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <div className="mb-4 mx-auto">
                <i className="fas fa-exclamation-circle text-4xl text-red-500"></i>
              </div>
              <h3 className="text-xl font-semibold mb-2">Error Generating Questions</h3>
              <p className="text-gray-600 mb-6">
                {error instanceof Error ? error.message : "An unknown error occurred"}
              </p>
              <Button
                onClick={() => setLocation(`/analysis/${jobId}`)}
              >
                Back to Analysis
              </Button>
            </div>
          ) : (
            <Card className="overflow-hidden mb-8">
              <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`h-10 w-10 rounded-full ${stringToColor(questionsData.resumeName)} flex items-center justify-center font-bold`}>
                    {getInitials(questionsData.resumeName)}
                  </div>
                  <h3 className="ml-3 text-lg font-semibold text-gray-900">
                    {questionsData.resumeName} <span className="text-primary">({questionsData.matchPercentage}% match)</span>
                  </h3>
                </div>
                <div>
                  <Button
                    variant="outline"
                    onClick={handlePrint}
                    className="text-primary hover:text-primary/90"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print
                  </Button>
                </div>
              </div>
              
              {/* NEW: Skills Gap Visualization */}
              <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Skills Analysis
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left column: Missing Skills */}
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <h4 className="text-md font-semibold text-red-700 mb-3 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      Missing Skills
                    </h4>
                    
                    {getMissingSkills().length === 0 ? (
                      <Alert className="bg-green-50 text-green-800 border-green-200">
                        <AlertDescription>
                          No significant skill gaps detected! The candidate has all the required skills for this position.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div className="space-y-2">
                        {getMissingSkills().map((skill: string, index: number) => (
                          <Badge key={index} variant="outline" className="mr-2 mb-2 bg-red-50 text-red-700 border-red-200">
                            {skill}
                          </Badge>
                        ))}
                        <p className="text-sm text-gray-600 mt-2">
                          These skills were mentioned in the job description but not found in the candidate's resume.
                          Use the questions below to assess the candidate's actual knowledge in these areas.
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {/* Right column: Matching Skills */}
                  <div className="bg-white p-4 rounded-lg shadow-sm">
                    <h4 className="text-md font-semibold text-green-700 mb-3 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Matching Skills
                    </h4>
                    
                    <div className="space-y-3">
                      {getMatchedSkills().slice(0, 5).map((skill: MatchedSkill, index: number) => (
                        <div key={index}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-gray-800">{skill.skill}</span>
                            <span className={`font-medium ${
                              skill.matchPercentage >= 80 ? 'text-green-600' : 
                              skill.matchPercentage >= 40 ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {skill.matchPercentage}% match
                            </span>
                          </div>
                          <Progress
                            value={skill.matchPercentage}
                            className="h-2 bg-gray-100"
                            indicatorClassName={
                              skill.matchPercentage >= 80 ? 'bg-green-500' : 
                              skill.matchPercentage >= 40 ? 'bg-amber-500' : 'bg-red-500'
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              <CardContent className="p-6">
                <div className="space-y-6">
                  {questionsData.technicalQuestions && questionsData.technicalQuestions.length > 0 && (
                    <div>
                      <h4 className="text-md font-semibold text-gray-800 mb-3 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                        </svg>
                        Technical Assessment
                      </h4>
                      <ul className="space-y-3 text-gray-700">
                        {questionsData.technicalQuestions.map((questionItem: Question, index: number) => {
                          // Handle both string and object formats
                          const questionText = typeof questionItem === 'string' 
                            ? questionItem 
                            : questionItem.question;
                            
                          const difficulty = typeof questionItem === 'object' && questionItem.difficulty
                            ? questionItem.difficulty
                            : 'Medium';
                            
                          // Color based on difficulty
                          const difficultyColor = 
                            difficulty === 'Green' ? 'bg-green-500' :
                            difficulty === 'Red' ? 'bg-red-500' :
                            'bg-blue-500';
                            
                          return (
                            <li key={index} className="pl-6 relative">
                              <div className={`absolute left-0 top-1.5 h-3 w-3 rounded-full ${difficultyColor}`}></div>
                              <p>{questionText}</p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  
                  {questionsData.experienceQuestions && questionsData.experienceQuestions.length > 0 && (
                    <div>
                      <h4 className="text-md font-semibold text-gray-800 mb-3 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                          <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
                        </svg>
                        Experience Verification
                      </h4>
                      <ul className="space-y-3 text-gray-700">
                        {questionsData.experienceQuestions.map((questionItem: Question, index: number) => {
                          // Handle both string and object formats
                          const questionText = typeof questionItem === 'string' 
                            ? questionItem 
                            : (questionItem && typeof questionItem === 'object' && 'question' in questionItem) 
                              ? questionItem.question 
                              : String(questionItem);
                            
                          // Determine difficulty color if available
                          const difficulty = typeof questionItem === 'object' && questionItem && 'difficulty' in questionItem 
                            ? questionItem.difficulty 
                            : null;
                            
                          const difficultyColor = 
                            difficulty === 'Green' ? 'bg-green-500' :
                            difficulty === 'Red' ? 'bg-red-500' :
                            'bg-green-500'; // Default green for experience questions
                            
                          return (
                            <li key={index} className="pl-6 relative">
                              <div className={`absolute left-0 top-1.5 h-3 w-3 rounded-full ${difficultyColor}`}></div>
                              <p>{questionText}</p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  
                  {questionsData.skillGapQuestions && questionsData.skillGapQuestions.length > 0 && (
                    <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                      <h4 className="text-md font-semibold text-red-800 mb-3 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                        Skill Gap Assessment
                      </h4>
                      <p className="text-sm text-red-700 mb-3 italic">
                        These questions help evaluate how the candidate might overcome the skill gaps identified in the analysis.
                      </p>
                      <ul className="space-y-3 text-gray-700">
                        {questionsData.skillGapQuestions.map((questionItem: Question, index: number) => {
                          // Handle both string and object formats
                          const questionText = typeof questionItem === 'string' 
                            ? questionItem 
                            : (questionItem && typeof questionItem === 'object' && 'question' in questionItem) 
                              ? questionItem.question 
                              : String(questionItem);
                              
                          // Determine difficulty color if available
                          const difficulty = typeof questionItem === 'object' && questionItem && 'difficulty' in questionItem 
                            ? questionItem.difficulty 
                            : null;
                            
                          // Keep red for skill gap questions regardless of difficulty
                          const difficultyColor = 'bg-red-500';
                            
                          return (
                            <li key={index} className="pl-6 relative">
                              <div className={`absolute left-0 top-1.5 h-3 w-3 rounded-full ${difficultyColor}`}></div>
                              <p>{questionText}</p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  
                  {questionsData.inclusionQuestions && questionsData.inclusionQuestions.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <h4 className="text-md font-semibold text-purple-800 mb-3 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
                        </svg>
                        Diversity & Inclusion Questions
                      </h4>
                      <p className="text-sm text-purple-600 mb-3 italic">
                        These questions address potential bias identified in the job description and explore the candidate's perspective on workplace diversity and inclusion.
                      </p>
                      <ul className="space-y-3 text-gray-700">
                        {questionsData.inclusionQuestions.map((questionItem: Question, index: number) => {
                          // Handle both string and object formats
                          const questionText = typeof questionItem === 'string' 
                            ? questionItem 
                            : (questionItem && typeof questionItem === 'object' && 'question' in questionItem) 
                              ? questionItem.question 
                              : String(questionItem);
                              
                          // Determine difficulty color if available
                          const difficulty = typeof questionItem === 'object' && questionItem && 'difficulty' in questionItem 
                            ? questionItem.difficulty 
                            : null;
                            
                          // Keep purple for inclusion questions regardless of difficulty
                          const difficultyColor = 'bg-purple-500'; 
                            
                          return (
                            <li key={index} className="pl-6 relative">
                              <div className={`absolute left-0 top-1.5 h-3 w-3 rounded-full ${difficultyColor}`}></div>
                              <p>{questionText}</p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setLocation(`/analysis/${jobId}`)}
            >
              Back to Fit Analysis
            </Button>
            
            <Button
              onClick={() => {
                toast({
                  title: "Results saved",
                  description: "Interview questions have been saved successfully.",
                });
              }}
            >
              Save Results
            </Button>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}