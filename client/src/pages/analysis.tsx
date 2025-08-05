import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatFileSize, getInitials, stringToColor } from "@/lib/file-utils";
import { useSteps } from "@/hooks/use-steps";

import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import StepProgress from "@/components/step-progress";

import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import SkillRadarChart from "@/components/skill-radar-chart";

import type {
  JobId,
  SessionId,
  ResumeId,
  AnalysisId,
  JobDetailsResponse,
  AnalysisResponse,
  MatchedSkill,
  FairnessMetrics,
  ApiResult
} from "@shared/api-contracts";
import { isApiSuccess } from "@shared/api-contracts";
import { isJobDetailsResponse, isAnalysisResponse } from "@shared/type-guards";

// Enhanced type definitions for the analysis page
interface JobData {
  id: JobId;
  title: string;
  description: string;
  createdAt: string;
  analyzedData: {
    requiredSkills: string[];
    preferredSkills: string[];
    experienceLevel: string;
    responsibilities: string[];
    summary: string;
  };
}

interface AnalysisResult {
  resumeId: ResumeId;
  filename: string;
  candidateName?: string;
  matchPercentage: number;
  matchedSkills: MatchedSkill[];
  missingSkills: string[];
  candidateStrengths: string[];
  candidateWeaknesses: string[];
  recommendations: string[];
  confidenceLevel: 'low' | 'medium' | 'high';
  analysisId?: AnalysisId;
  scoringDimensions?: {
    skills: number;
    experience: number;
    education: number;
    semantic: number;
    overall: number;
  };
  fairnessMetrics?: FairnessMetrics;
}

interface AnalysisData {
  analysisId: AnalysisId;
  jobId: JobId;
  results: AnalysisResult[];
  processingTime: number;
  metadata: {
    aiProvider: string;
    modelVersion: string;
    totalCandidates: number;
    processedCandidates: number;
    failedCandidates: number;
  };
}

export default function AnalysisPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const { steps } = useSteps(["Resume Upload", "Job Description", "Bias Detection", "Fit Analysis", "Interview Prep"], 3);
  
  const [match, routeParams] = useRoute("/analysis/:jobId");
  const jobId = match ? parseInt(routeParams.jobId) as JobId : 0 as JobId;
  
  const [expanded, setExpanded] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Initialize session ID and batch ID from localStorage synchronously
  const [sessionId, setSessionId] = useState<SessionId | null>(() => {
    console.log('=== LOADING LOCALSTORAGE VALUES SYNCHRONOUSLY ===');
    const storedSessionId = localStorage.getItem('currentUploadSession');
    console.log(`localStorage.getItem('currentUploadSession'): ${storedSessionId}`);
    return storedSessionId as SessionId | null;
  });
  
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(() => {
    const storedBatchId = localStorage.getItem('currentBatchId');
    console.log(`localStorage.getItem('currentBatchId'): ${storedBatchId}`);
    console.log(`Initial state will be set to:
      - sessionId: ${localStorage.getItem('currentUploadSession')}
      - currentBatchId: ${storedBatchId}
    `);
    return storedBatchId;
  });
  
  // Add a loading state to track when we're ready for auto-analysis
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Mark as initialized after first render to ensure state is properly set
  useEffect(() => {
    console.log('=== MARKING COMPONENT AS INITIALIZED ===');
    console.log(`Current state after initialization:
      - sessionId: ${sessionId}
      - currentBatchId: ${currentBatchId}
      - jobId: ${jobId}
    `);
    setIsInitialized(true);
  }, [sessionId, currentBatchId, jobId]);
  
  
  // Job data interface moved to top level with proper typing

  // Fetch job details with authentication
  const { 
    data: jobData, 
    isLoading: isJobLoading, 
    error: jobError,
    isError: isJobError 
  } = useQuery<JobData>({
    queryKey: [`/api/job-descriptions/${jobId}`],
    queryFn: async ({ queryKey }) => {
      const response = await apiRequest("GET", String(queryKey[0]));
      const data = await response.json();
      // Extract jobDescription from the response
      if (data.jobDescription) {
        // Add isAnalyzed flag from the parent response
        return { ...data.jobDescription, isAnalyzed: data.isAnalyzed };
      }
      return data;
    },
    enabled: !!jobId,
    retry: 1
  });
  
  // Analyze mutation
  const analyzeMutation = useMutation<AnalysisData, Error, void>({
    mutationFn: async (): Promise<AnalysisData> => {
      setIsAnalyzing(true);
      
      // Get fresh values from localStorage to ensure we have the latest data
      const currentSessionId = localStorage.getItem('currentUploadSession');
      const currentBatchIdValue = localStorage.getItem('currentBatchId');
      
      console.log(`Starting analysis mutation with sessionId: ${currentSessionId}, batchId: ${currentBatchIdValue}, jobId: ${jobId}`);
      
      // Include the sessionId and batchId in the request body if available
      const requestBody: { sessionId?: string; batchId?: string } = {};
      if (currentSessionId) requestBody.sessionId = currentSessionId;
      if (currentBatchIdValue) requestBody.batchId = currentBatchIdValue;
      
      console.log(`Making POST request to: /api/analysis/analyze/${jobId}`, requestBody);
      
      const response = await apiRequest("POST", `/api/analysis/analyze/${jobId}`, requestBody);
      console.log('Raw response status:', response.status, 'OK:', response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Analysis request failed with status:', response.status, 'Response:', errorText);
        throw new Error(`Analysis request failed (${response.status}): ${errorText}`);
      }
      
      const result = await response.json() as ApiResult<AnalysisData>;
      console.log('Parsed response result:', JSON.stringify(result, null, 2));
      
      if (isApiSuccess(result)) {
        console.log('Response marked as success, checking analysis response format...');
        if (isAnalysisResponse(result.data)) {
          console.log('Analysis response format is valid!');
          return result.data;
        }
        console.error('Invalid analysis response format. Expected fields:', {
          hasAnalysisId: 'analysisId' in result.data,
          hasJobId: 'jobId' in result.data,
          hasResults: 'results' in result.data,
          hasCreatedAt: 'createdAt' in result.data,
          hasProcessingTime: 'processingTime' in result.data,
          actualKeys: Object.keys(result.data)
        });
        throw new Error('Invalid analysis response format');
      }
      
      console.error('API response indicates failure:', result);
      throw new Error(result.message || "Analysis failed");
    },
    onSuccess: (data) => {
      const resultCount = data.results?.length || 0;
      toast({
        title: "Analysis complete",
        description: `${resultCount} resume${resultCount !== 1 ? 's' : ''} analyzed successfully.`,
      });
      setIsAnalyzing(false);
      refetch();
    },
    onError: (error) => {
      console.error("Analysis error:", error);
      
      const willRetry = retryCount < MAX_RETRIES;
      const retryMessage = willRetry ? ` Will retry automatically (${retryCount + 1}/${MAX_RETRIES}).` : " Maximum retries reached.";
      
      toast({
        title: "Analysis failed",
        description: (error.message || "There was an error analyzing resumes against this job description.") + retryMessage,
        variant: "destructive",
      });
      setIsAnalyzing(false);
      
      if (!willRetry) {
        console.log("❌ MAX RETRIES REACHED - Auto-analysis stopped");
      }
    },
  });
  
  // Track if we've attempted automatic analysis to prevent loops
  const [hasAttemptedAutoAnalysis, setHasAttemptedAutoAnalysis] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  
  // Remove duplicate interface definition - using shared types
  
  // Fetch analysis data using proper auth
  const { 
    data: analysisData, 
    isLoading, 
    isError, 
    error: fetchError, 
    refetch 
  } = useQuery<AnalysisResponse>({
    queryKey: [`/api/analysis/analyze/${jobId}`, sessionId, currentBatchId],
    queryFn: async ({ queryKey }) => {
      const baseUrl = String(queryKey[0]);
      const params = new URLSearchParams();
      
      if (sessionId) params.append('sessionId', sessionId);
      if (currentBatchId) params.append('batchId', currentBatchId);
      
      const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
      
      console.log(`Fetching analysis data from: ${url} with session: ${sessionId || 'none'} and batch: ${currentBatchId || 'none'}`);
      
      const response = await apiRequest("GET", url);
      const data = await response.json();
      console.log(`Analysis data received, count: ${data.results?.length || 0} results`);
      return data as AnalysisResponse;
    },
    enabled: !!jobId && sessionId !== null && currentBatchId !== null && isInitialized, // Only fetch when initialized and have all required IDs
    retry: 1
  });
  
  // Reset auto-analysis flag when currentBatchId changes
  useEffect(() => {
    console.log('=== BATCH ID CHANGE EFFECT ===');
    console.log(`Current batch ID changed to: ${currentBatchId}`);
    
    if (currentBatchId) {
      console.log('✅ Resetting hasAttemptedAutoAnalysis due to batch change');
      setHasAttemptedAutoAnalysis(false);
      setRetryCount(0);
    }
  }, [currentBatchId]);
  
  // Automatic analysis trigger with retry mechanism
  useEffect(() => {
    console.log('=== AUTO ANALYSIS EFFECT TRIGGERED ===');
    console.log(`Conditions check:
      - isInitialized: ${isInitialized}
      - isLoading: ${isLoading}
      - isError: ${isError}
      - analysisData?.results: ${analysisData?.results ? 'exists' : 'null'}
      - resultsCount: ${analysisData?.results?.length || 0}
      - hasAttemptedAutoAnalysis: ${hasAttemptedAutoAnalysis}
      - sessionId: ${sessionId || 'null'}
      - jobId: ${jobId || 'null'}
      - currentBatchId: ${currentBatchId || 'null'}
      - isAnalyzing: ${isAnalyzing}
      - analyzeMutation.isPending: ${analyzeMutation.isPending}
      - retryCount: ${retryCount}
      - analyzeMutation.isError: ${analyzeMutation.isError}
    `);
    
    // Only run automatic analysis when:
    // 1. Component is fully initialized with localStorage values
    // 2. Initial data loading is complete
    // 3. There are no existing analysis results
    // 4. We haven't attempted auto-analysis yet OR we're retrying after an error
    // 5. We have sessionId, jobId, and currentBatchId
    // 6. Not currently analyzing
    // 7. Haven't exceeded max retries
    const shouldAttemptAnalysis = isInitialized &&
        !isLoading && 
        !isError &&
        (!analysisData?.results || analysisData.results.length === 0) && 
        (!hasAttemptedAutoAnalysis || (analyzeMutation.isError && retryCount < MAX_RETRIES)) && 
        sessionId && 
        jobId && 
        currentBatchId &&
        !isAnalyzing &&
        !analyzeMutation.isPending &&
        retryCount < MAX_RETRIES; // Additional check to prevent infinite checking after max retries
    
    if (shouldAttemptAnalysis) {
      console.log(`✅ AUTO-STARTING ANALYSIS for job ${jobId}, batch ${currentBatchId} (attempt ${retryCount + 1})`);
      
      if (!hasAttemptedAutoAnalysis) {
        setHasAttemptedAutoAnalysis(true);
        toast({
          title: "Starting automatic analysis",
          description: `Analyzing resumes from batch ${currentBatchId.slice(-8)} against this job description.`,
        });
      } else if (analyzeMutation.isError) {
        console.log(`🔄 RETRYING ANALYSIS (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        setRetryCount(prev => prev + 1);
        toast({
          title: "Retrying analysis",
          description: `Retry attempt ${retryCount + 1} of ${MAX_RETRIES}`,
        });
      }
      
      analyzeMutation.mutate();
    } else {
      console.log('❌ Auto-analysis conditions not met');
      
      // Log specific reasons why conditions aren't met
      if (!isInitialized) console.log('  - Not yet initialized');
      if (isLoading) console.log('  - Still loading data');
      if (isError) console.log('  - Error state present');
      if (analysisData?.results && analysisData.results.length > 0) console.log('  - Analysis results already exist');
      if (hasAttemptedAutoAnalysis && !analyzeMutation.isError) console.log('  - Already attempted auto-analysis');
      if (analyzeMutation.isError && retryCount >= MAX_RETRIES) console.log('  - Max retries exceeded');
      if (!sessionId) console.log('  - Missing sessionId');
      if (!jobId) console.log('  - Missing jobId');
      if (!currentBatchId) console.log('  - Missing currentBatchId');
      if (isAnalyzing) console.log('  - Currently analyzing');
      if (analyzeMutation.isPending) console.log('  - Mutation pending');
    }
  }, [
    isInitialized,
    isLoading, 
    isError,
    analysisData?.results?.length, 
    hasAttemptedAutoAnalysis, 
    sessionId, 
    jobId, 
    currentBatchId,
    isAnalyzing,
    analyzeMutation.isPending,
    analyzeMutation.isError,
    retryCount
    // Note: analyzeMutation and toast removed from deps to prevent infinite loops
  ]);
  
  const handleAnalyze = () => {
    console.log('🔄 Manual analysis triggered - resetting retry state');
    setRetryCount(0);
    setHasAttemptedAutoAnalysis(true);
    analyzeMutation.mutate();
  };
  
  const handleReAnalyze = () => {
    console.log('🔄 Manual re-analysis triggered - resetting all auto-analysis state');
    setRetryCount(0);
    setHasAttemptedAutoAnalysis(false);
    analyzeMutation.mutate();
  };
  
  const handleViewDetails = (resumeId: number) => {
    if (expanded === resumeId) {
      setExpanded(null);
    } else {
      setExpanded(resumeId);
    }
  };
  
  const handleGenerateQuestions = (resumeId: number) => {
    setLocation(`/interview/${resumeId}/${jobId}`);
  };
  
  const noResults = !isLoading && (!analysisData?.results || analysisData.results.length === 0);
  const hasResumes = noResults && !isAnalyzing && !isError;
  const shouldShowJobError = isJobError || !jobData;
  
  if (!jobId) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-8">
          <div className="text-center p-12">
            <h1 className="text-3xl font-bold mb-6">Invalid Job ID</h1>
            <p className="mb-6">No job description ID was provided.</p>
            <Button onClick={() => setLocation("/job-description")}>
              Add a Job Description
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        <StepProgress steps={steps} />
        
        <h1 className="text-3xl font-bold mb-6">Candidate Fit Analysis</h1>
        
        {shouldShowJobError ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Job Description Not Found</AlertTitle>
            <AlertDescription>
              The job description you're looking for doesn't exist or has been deleted.
              <div className="mt-4">
                <Button onClick={() => setLocation("/job-description")}>
                  Go to Job Descriptions
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : isJobLoading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="mb-6">
            <Card>
              <CardHeader>
                <CardTitle>{jobData?.title || 'Job Description'}</CardTitle>
                <CardDescription>
                  Analysis of candidate resumes against this job description
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        )}
        
        <div className="mb-8">
          <p className="text-gray-600">
            We've analyzed your job description and candidate resumes. Here are the results ranked by overall fit.
          </p>
          
          {currentBatchId && (
            <div className="mt-4 p-3 border border-blue-200 bg-blue-50 rounded-md text-sm text-blue-800">
              <p className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <span><strong>Analyzing Batch:</strong> {currentBatchId.slice(-8)} - Only resumes from the current upload batch</span>
              </p>
            </div>
          )}
        </div>
        
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : isError ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Error Loading Analysis</AlertTitle>
            <AlertDescription>
              There was a problem loading the analysis data. The job description or resumes may no longer exist.
              <div className="mt-4">
                <Button onClick={handleReAnalyze}>
                  Try Again
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : noResults ? (
          <div className="bg-gray-50 p-8 rounded-lg border text-center">
            <h3 className="text-xl font-medium mb-4">No Analysis Results Available</h3>
            
            {isAnalyzing || analyzeMutation.isPending ? (
              <div className="flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4"></div>
                <p className="text-gray-600">Analyzing resumes against job description...</p>
                <p className="text-sm text-gray-500 mt-2">This may take a moment</p>
                {sessionId && currentBatchId && (
                  <p className="text-xs text-blue-600 mt-2">Auto-analyzing batch: {currentBatchId.slice(-8)}</p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-gray-600 mb-6">This could be due to one of the following reasons:</p>
                <ul className="text-left max-w-md mx-auto mb-6">
                  <li className="mb-2 flex">
                    <i className="fas fa-circle text-xs text-gray-400 mt-2 mr-2"></i>
                    <span>No resumes were uploaded</span>
                  </li>
                  <li className="mb-2 flex">
                    <i className="fas fa-circle text-xs text-gray-400 mt-2 mr-2"></i>
                    <span>The job description analysis is still in progress</span>
                  </li>
                  <li className="flex">
                    <i className="fas fa-circle text-xs text-gray-400 mt-2 mr-2"></i>
                    <span>There was an error during the analysis</span>
                  </li>
                </ul>
                <Button onClick={handleReAnalyze}>
                  Try Again
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6 mb-8">
            {analysisData?.results && analysisData.results.map((result: AnalysisResult) => (
              <Card key={`resume-${result.resumeId}-analysis-${result.analysisId || 'unknown'}`} className="overflow-hidden">
                <div className="flex items-center justify-between bg-gray-50 p-4 border-b">
                  <div className="flex items-center">
                    <div className={`h-12 w-12 rounded-full ${stringToColor(result.candidateName || result.filename)} flex items-center justify-center font-bold text-xl`}>
                      {getInitials(result.candidateName || result.filename)}
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-gray-900">{result.candidateName || "Unknown Candidate"}</h3>
                      <p className="text-sm text-gray-500">{result.filename}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="mr-6">
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-3xl font-bold text-primary">{result.matchPercentage}%</span>
                          <span className="text-sm text-gray-500 ml-1">match</span>
                        </div>
                        {result.confidenceLevel && (
                          <div className="flex flex-col items-center">
                            <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              result.confidenceLevel === 'high' ? 'bg-green-100 text-green-800' :
                              result.confidenceLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {result.confidenceLevel} confidence
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleViewDetails(result.resumeId)}
                      variant={expanded === result.resumeId ? "default" : "outline"}
                    >
                      {expanded === result.resumeId ? "Hide Details" : "View Details"}
                    </Button>
                  </div>
                </div>
                
                {expanded === result.resumeId && (
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">Key Skills</h4>
                        <div className="space-y-3">
                          {result.matchedSkills && result.matchedSkills.slice(0, 5).map((skill: any, index: number) => {
                            // Extract skill name and match percentage
                            const skillName = typeof skill === 'string' 
                              ? skill 
                              : (skill && typeof skill === 'object' && skill.skill && typeof skill.skill === 'string') 
                                ? skill.skill 
                                : `Relevant Skill ${index + 1}`;
                                
                            const matchPercentage = (skill && typeof skill === 'object' && typeof skill.matchPercentage === 'number') 
                              ? skill.matchPercentage 
                              : 100;
                            
                            return (
                              <div key={index}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="font-medium text-gray-800">{skillName}</span>
                                  <span 
                                    className={`font-medium ${
                                      matchPercentage >= 80 
                                        ? 'text-green-600' 
                                        : matchPercentage >= 40 
                                          ? 'text-amber-600' 
                                          : 'text-red-600'
                                    }`}
                                  >
                                    {matchPercentage}% match
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div 
                                    className={`skill-match rounded-full h-full ${
                                      matchPercentage >= 80 
                                        ? 'bg-green-500' 
                                        : matchPercentage >= 40 
                                          ? 'bg-amber-500' 
                                          : 'bg-red-500'
                                    }`} 
                                    style={{ width: `${matchPercentage}%` }}
                                  ></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Add Radar Chart for skills visualization */}
                        <div className="mt-6">
                          <h5 className="text-sm font-semibold text-gray-600 mb-3">Skill Match Visualization</h5>
                          <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                            <SkillRadarChart 
                              matchedSkills={
                                Array.isArray(result.matchedSkills) 
                                  ? result.matchedSkills.map(skill => {
                                      // Log individual skill for debugging
                                      console.log('Processing skill for radar chart:', skill);
                                      
                                      // Handle different formats of skill data
                                      if (typeof skill === 'string') {
                                        return { skill, matchPercentage: 100 };
                                      }
                                      
                                      if (skill && typeof skill === 'object') {
                                        // Get skill name, prefer skill property, fall back to other properties
                                        let skillName;
                                        if (typeof skill.skill === 'string' && skill.skill.trim() !== '') {
                                          skillName = skill.skill;
                                        } else if (typeof (skill as any).name === 'string' && (skill as any).name.trim() !== '') {
                                          skillName = (skill as any).name;
                                        } else if (typeof (skill as any).skill_name === 'string' && (skill as any).skill_name.trim() !== '') {
                                          skillName = (skill as any).skill_name;
                                        } else {
                                          skillName = 'Unnamed Skill';
                                        }
                                        
                                        // Get match percentage, prefer matchPercentage property, fall back to other properties
                                        let matchPct;
                                        if (typeof skill.matchPercentage === 'number') {
                                          matchPct = skill.matchPercentage;
                                        } else if (typeof (skill as any).match_percentage === 'number') {
                                          matchPct = (skill as any).match_percentage;
                                        } else {
                                          matchPct = 100;
                                        }
                                        
                                        return { 
                                          skill: skillName,
                                          matchPercentage: matchPct
                                        };
                                      }
                                      
                                      return { skill: 'Unnamed Skill', matchPercentage: 0 };
                                    })
                                  : []
                              } 
                              height={240} 
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">Experience & Missing Skills</h4>
                        <div className="space-y-4">
                          {result.candidateStrengths && result.candidateStrengths.slice(0, 2).map((strength, index) => (
                            <div key={index}>
                              <p className="font-medium text-gray-800">{strength}</p>
                            </div>
                          ))}
                          
                          {result.missingSkills?.length > 0 && (
                            <div className="pt-2">
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Missing Skills</h5>
                              <div className="flex flex-wrap gap-2">
                                {result.missingSkills.map((skill, index) => (
                                  <Badge key={index} variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                    {skill}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Confidence Level Section */}
                          {result.confidenceLevel && (
                            <div className="pt-4 mt-4 border-t border-gray-200">
                              <h5 className="text-sm font-semibold text-gray-600 mb-3">Analysis Confidence</h5>
                              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-800">Confidence Level</span>
                                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                    result.confidenceLevel === 'high' ? 'bg-green-100 text-green-800' :
                                    result.confidenceLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {result.confidenceLevel.toUpperCase()}
                                  </div>
                                </div>
                                <p className="text-xs text-gray-600 mt-2">
                                  {result.confidenceLevel === 'high' && 'High confidence: Analysis based on comprehensive data with clear skill matches.'}
                                  {result.confidenceLevel === 'medium' && 'Medium confidence: Analysis based on adequate data but some areas may need more information.'}
                                  {result.confidenceLevel === 'low' && 'Low confidence: Analysis based on limited data. Consider providing more detailed information.'}
                                </p>
                              </div>
                            </div>
                          )}
                          
                          {/* Fairness Metrics Section */}
                          {result.fairnessMetrics && (
                            <div className="pt-4 mt-4 border-t border-gray-200">
                              <h5 className="text-sm font-semibold text-gray-600 mb-3">Fairness Analysis</h5>
                              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <div className="mb-3">
                                  <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-800">Bias Confidence Score</span>
                                    <span className={`font-medium ${
                                      result.fairnessMetrics.biasConfidenceScore >= 80 
                                        ? 'text-green-600' 
                                        : result.fairnessMetrics.biasConfidenceScore >= 40 
                                          ? 'text-amber-600' 
                                          : 'text-red-600'
                                    }`}>
                                      {result.fairnessMetrics.biasConfidenceScore}%
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className={`rounded-full h-full ${
                                        result.fairnessMetrics.biasConfidenceScore >= 80 
                                          ? 'bg-green-500' 
                                          : result.fairnessMetrics.biasConfidenceScore >= 40 
                                            ? 'bg-amber-500' 
                                            : 'bg-red-500'
                                      }`} 
                                      style={{ width: `${result.fairnessMetrics.biasConfidenceScore}%` }}
                                    ></div>
                                  </div>
                                </div>
                                
                                {result.fairnessMetrics.fairnessAssessment && (
                                  <p className="text-sm text-gray-700 mt-2">
                                    {result.fairnessMetrics.fairnessAssessment}
                                  </p>
                                )}
                                
                                {result.fairnessMetrics.potentialBiasAreas && 
                                  result.fairnessMetrics.potentialBiasAreas.length > 0 && (
                                    <div className="mt-3">
                                      <h6 className="text-xs font-medium text-gray-700 mb-2">Potential Bias Areas</h6>
                                      <div className="flex flex-wrap gap-2">
                                        {result.fairnessMetrics.potentialBiasAreas.map((area, index) => (
                                          <Badge key={index} variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                            {area}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          <div className="pt-4">
                            <Button onClick={() => handleGenerateQuestions(result.resumeId)}>
                              Generate Interview Questions
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}