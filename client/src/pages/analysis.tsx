import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
import MatchInsightsCard from "@/components/match-insights-card";
import SimpleMatchSummary from "@/components/simple-match-summary";

import type {
  JobId,
  SessionId,
  ResumeId,
  AnalysisId,
  JobDetailsResponse,
  AnalysisResponse,
  MatchedSkill,
  FairnessMetrics,
  MatchInsights,
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
  matchInsights?: MatchInsights;
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
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] === LOADING LOCALSTORAGE VALUES SYNCHRONOUSLY ===`);
    const storedSessionId = localStorage.getItem('currentUploadSession');
    console.log(`[${timestamp}] localStorage.getItem('currentUploadSession'): ${storedSessionId}`);
    return storedSessionId as SessionId | null;
  });
  
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(() => {
    const timestamp = new Date().toISOString();
    const storedBatchId = localStorage.getItem('currentBatchId');
    console.log(`[${timestamp}] localStorage.getItem('currentBatchId'): ${storedBatchId}`);
    console.log(`[${timestamp}] Initial state will be set to:
      - sessionId: ${localStorage.getItem('currentUploadSession')}
      - currentBatchId: ${storedBatchId}
    `);
    return storedBatchId;
  });
  
  // Initialize as ready immediately if we have required data
  const [isInitialized, setIsInitialized] = useState(() => {
    const hasRequiredData = !!(sessionId && currentBatchId && jobId);
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] === SYNCHRONOUS INITIALIZATION ===`);
    console.log(`[${timestamp}] Initial isInitialized state: ${hasRequiredData}`);
    return hasRequiredData;
  });
  
  // Update initialization state when dependencies change
  useEffect(() => {
    const timestamp = new Date().toISOString();
    const shouldBeInitialized = !!(sessionId && currentBatchId && jobId);
    if (shouldBeInitialized !== isInitialized) {
      console.log(`[${timestamp}] === UPDATING INITIALIZATION STATE ===`);
      console.log(`[${timestamp}] Setting isInitialized: ${shouldBeInitialized}`);
      setIsInitialized(shouldBeInitialized);
    }
  }, [sessionId, currentBatchId, jobId, isInitialized]);
  
  
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
  
  // Analyze mutation with abort controller and timeout handling
  const analyzeMutation = useMutation<AnalysisData, Error, void>({
    mutationFn: async (): Promise<AnalysisData> => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] === STARTING ANALYSIS MUTATION ===`);
      
      // Clear any existing timeout
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
      
      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Create new abort controller
      abortControllerRef.current = new AbortController();
      
      setIsAnalyzing(true);
      
      // Get fresh values from localStorage to ensure we have the latest data
      const currentSessionId = localStorage.getItem('currentUploadSession');
      const currentBatchIdValue = localStorage.getItem('currentBatchId');
      
      console.log(`[${timestamp}] Starting analysis mutation with sessionId: ${currentSessionId}, batchId: ${currentBatchIdValue}, jobId: ${jobId}`);
      
      // Include the sessionId and batchId in the request body if available
      const requestBody: { sessionId?: string; batchId?: string } = {};
      if (currentSessionId) requestBody.sessionId = currentSessionId;
      if (currentBatchIdValue) requestBody.batchId = currentBatchIdValue;
      
      console.log(`[${timestamp}] Making POST request to: /api/analysis/analyze/${jobId}`, requestBody);
      
      // Set a timeout for the request
      const timeoutPromise = new Promise<never>((_, reject) => {
        analysisTimeoutRef.current = setTimeout(() => {
          console.log(`[${new Date().toISOString()}] Analysis request timed out after 5 minutes`);
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
          reject(new Error('Analysis request timed out after 5 minutes'));
        }, 5 * 60 * 1000); // 5 minute timeout
      });
      
      try {
        const response = await Promise.race([
          apiRequest("POST", `/api/analysis/analyze/${jobId}`, requestBody, {
            signal: abortControllerRef.current.signal
          }),
          timeoutPromise
        ]);
        
        console.log(`[${new Date().toISOString()}] Raw response status:`, response.status, 'OK:', response.ok);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[${new Date().toISOString()}] Analysis request failed with status:`, response.status, 'Response:', errorText);
          throw new Error(`Analysis request failed (${response.status}): ${errorText}`);
        }
        
        const result = await response.json() as ApiResult<AnalysisData>;
        console.log(`[${new Date().toISOString()}] Parsed response result:`, JSON.stringify(result, null, 2));
        
        if (isApiSuccess(result)) {
          console.log(`[${new Date().toISOString()}] Response marked as success, checking analysis response format...`);
          if (isAnalysisResponse(result.data)) {
            console.log(`[${new Date().toISOString()}] Analysis response format is valid!`);
            return result.data;
          }
          console.error(`[${new Date().toISOString()}] Invalid analysis response format. Expected fields:`, {
            hasAnalysisId: 'analysisId' in result.data,
            hasJobId: 'jobId' in result.data,
            hasResults: 'results' in result.data,
            hasCreatedAt: 'createdAt' in result.data,
            hasProcessingTime: 'processingTime' in result.data,
            actualKeys: Object.keys(result.data)
          });
          throw new Error('Invalid analysis response format');
        }
        
        console.error(`[${new Date().toISOString()}] API response indicates failure:`, result);
        throw new Error(result.message || "Analysis failed");
      } finally {
        // Clear timeout on completion
        if (analysisTimeoutRef.current) {
          clearTimeout(analysisTimeoutRef.current);
          analysisTimeoutRef.current = null;
        }
      }
    },
    onSuccess: (data) => {
      const timestamp = new Date().toISOString();
      const resultCount = data.results?.length || 0;
      console.log(`[${timestamp}] === ANALYSIS SUCCESS ===`);
      console.log(`[${timestamp}] Results count: ${resultCount}`);
      
      toast({
        title: "Analysis complete",
        description: `${resultCount} resume${resultCount !== 1 ? 's' : ''} analyzed successfully.`,
      });
      setIsAnalyzing(false);
      
      // Clear timeout and abort controller
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
      
      refetch();
    },
    onError: (error) => {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] === ANALYSIS ERROR ===`, error);
      
      const currentRetryCount = analysisStateRef.current.retryCount;
      const willRetry = currentRetryCount < MAX_RETRIES;
      const retryMessage = willRetry ? ` Will retry automatically (${currentRetryCount + 1}/${MAX_RETRIES}).` : " Maximum retries reached.";
      
      console.log(`[${timestamp}] Will retry: ${willRetry}, Current retry count: ${currentRetryCount}`);
      
      toast({
        title: "Analysis failed",
        description: (error.message || "There was an error analyzing resumes against this job description.") + retryMessage,
        variant: "destructive",
      });
      setIsAnalyzing(false);
      
      // Clear timeout and abort controller
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
      
      if (!willRetry) {
        console.log(`[${timestamp}] ❌ MAX RETRIES REACHED - Auto-analysis stopped`);
      }
    },
  });
  
  // Track analysis attempts and retries with refs for stable references
  const [hasAttemptedAutoAnalysis, setHasAttemptedAutoAnalysis] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  
  // Use refs to prevent stale closures and provide stable references
  const analysisStateRef = useRef({ hasAttemptedAutoAnalysis, retryCount });
  const abortControllerRef = useRef<AbortController | null>(null);
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Update refs when state changes
  useEffect(() => {
    analysisStateRef.current = { hasAttemptedAutoAnalysis, retryCount };
  }, [hasAttemptedAutoAnalysis, retryCount]);
  
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
  
  // Reset auto-analysis state when currentBatchId changes - with cleanup
  useEffect(() => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] === BATCH ID CHANGE EFFECT ===`);
    console.log(`[${timestamp}] Current batch ID changed to: ${currentBatchId}`);
    
    if (currentBatchId) {
      console.log(`[${timestamp}] ✅ Resetting hasAttemptedAutoAnalysis due to batch change`);
      
      // Cancel any ongoing analysis
      if (abortControllerRef.current) {
        console.log(`[${timestamp}] Aborting ongoing analysis due to batch change`);
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
      // Clear any timeouts
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
      
      // Reset analysis state
      setHasAttemptedAutoAnalysis(false);
      setRetryCount(0);
      setIsAnalyzing(false);
    }
  }, [currentBatchId]);
  
  // Memoize analysis conditions to prevent unnecessary re-renders
  const analysisConditions = useMemo(() => {
    const hasRequiredData = !!(sessionId && jobId && currentBatchId);
    const hasNoResults = !analysisData?.results || analysisData.results.length === 0;
    const isReadyForAnalysis = isInitialized && !isLoading && !isError;
    const canAttemptAnalysis = !isAnalyzing && !analyzeMutation.isPending;
    const shouldRetry = analyzeMutation.isError && retryCount < MAX_RETRIES;
    const needsFirstAttempt = !hasAttemptedAutoAnalysis;
    
    return {
      hasRequiredData,
      hasNoResults,
      isReadyForAnalysis,
      canAttemptAnalysis,
      shouldRetry,
      needsFirstAttempt,
      shouldAttemptAnalysis: hasRequiredData && hasNoResults && isReadyForAnalysis && 
                           canAttemptAnalysis && (needsFirstAttempt || shouldRetry)
    };
  }, [sessionId, jobId, currentBatchId, analysisData?.results?.length, isInitialized, 
      isLoading, isError, isAnalyzing, analyzeMutation.isPending, analyzeMutation.isError, 
      retryCount, hasAttemptedAutoAnalysis]);
  
  // Automatic analysis trigger with simplified logic and immediate state updates
  useEffect(() => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] === AUTO ANALYSIS EFFECT TRIGGERED ===`);
    console.log(`[${timestamp}] Conditions:`, {
      hasRequiredData: analysisConditions.hasRequiredData,
      hasNoResults: analysisConditions.hasNoResults,
      isReadyForAnalysis: analysisConditions.isReadyForAnalysis,
      canAttemptAnalysis: analysisConditions.canAttemptAnalysis,
      shouldRetry: analysisConditions.shouldRetry,
      needsFirstAttempt: analysisConditions.needsFirstAttempt,
      shouldAttemptAnalysis: analysisConditions.shouldAttemptAnalysis,
      currentRetryCount: retryCount,
      hasAttemptedAutoAnalysis
    });
    
    if (analysisConditions.shouldAttemptAnalysis) {
      console.log(`[${timestamp}] ✅ AUTO-STARTING ANALYSIS for job ${jobId}, batch ${currentBatchId} (attempt ${retryCount + 1})`);
      
      // IMMEDIATELY set state to prevent race conditions
      if (analysisConditions.needsFirstAttempt) {
        console.log(`[${timestamp}] Setting hasAttemptedAutoAnalysis to true IMMEDIATELY`);
        setHasAttemptedAutoAnalysis(true);
        toast({
          title: "Starting automatic analysis",
          description: `Analyzing resumes from batch ${currentBatchId?.slice(-8) || 'unknown'} against this job description.`,
        });
      } else if (analysisConditions.shouldRetry) {
        console.log(`[${timestamp}] 🔄 RETRYING ANALYSIS (attempt ${retryCount + 1}/${MAX_RETRIES}) - incrementing retry count IMMEDIATELY`);
        setRetryCount(prev => {
          const newCount = prev + 1;
          console.log(`[${timestamp}] Retry count updated from ${prev} to ${newCount}`);
          return newCount;
        });
        toast({
          title: "Retrying analysis",
          description: `Retry attempt ${retryCount + 1} of ${MAX_RETRIES}`,
        });
      }
      
      // Start the mutation
      console.log(`[${timestamp}] Calling analyzeMutation.mutate()`);
      analyzeMutation.mutate();
    } else {
      console.log(`[${timestamp}] ❌ Auto-analysis conditions not met:`);
      
      // Log specific reasons why conditions aren't met
      if (!analysisConditions.hasRequiredData) {
        console.log(`[${timestamp}]   - Missing required data: sessionId=${!!sessionId}, jobId=${!!jobId}, currentBatchId=${!!currentBatchId}`);
      }
      if (!analysisConditions.hasNoResults) {
        console.log(`[${timestamp}]   - Analysis results already exist: ${analysisData?.results?.length || 0} results`);
      }
      if (!analysisConditions.isReadyForAnalysis) {
        console.log(`[${timestamp}]   - Not ready: isInitialized=${isInitialized}, isLoading=${isLoading}, isError=${isError}`);
      }
      if (!analysisConditions.canAttemptAnalysis) {
        console.log(`[${timestamp}]   - Cannot attempt: isAnalyzing=${isAnalyzing}, isPending=${analyzeMutation.isPending}`);
      }
      if (!analysisConditions.needsFirstAttempt && !analysisConditions.shouldRetry) {
        console.log(`[${timestamp}]   - No attempt needed: hasAttempted=${hasAttemptedAutoAnalysis}, retryCount=${retryCount}, maxRetries=${MAX_RETRIES}, isError=${analyzeMutation.isError}`);
      }
    }
  }, [analysisConditions, jobId, currentBatchId, retryCount, hasAttemptedAutoAnalysis, analyzeMutation]);
  
  const handleAnalyze = useCallback(() => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🔄 Manual analysis triggered - resetting retry state`);
    
    // Cancel any ongoing analysis
    if (abortControllerRef.current) {
      console.log(`[${timestamp}] Aborting ongoing analysis for manual trigger`);
      abortControllerRef.current.abort();
    }
    
    // Clear any timeouts
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current);
      analysisTimeoutRef.current = null;
    }
    
    // Reset state immediately
    setRetryCount(0);
    setHasAttemptedAutoAnalysis(true);
    setIsAnalyzing(false);
    
    analyzeMutation.reset(); // Clear any previous error state
    analyzeMutation.mutate();
  }, [analyzeMutation]);
  
  const handleReAnalyze = useCallback(() => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🔄 Manual re-analysis triggered - resetting all auto-analysis state`);
    
    // Cancel any ongoing analysis
    if (abortControllerRef.current) {
      console.log(`[${timestamp}] Aborting ongoing analysis for manual re-trigger`);
      abortControllerRef.current.abort();
    }
    
    // Clear any timeouts
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current);
      analysisTimeoutRef.current = null;
    }
    
    // Reset all state immediately
    setRetryCount(0);
    setHasAttemptedAutoAnalysis(false);
    setIsAnalyzing(false);
    
    analyzeMutation.reset(); // Clear any previous error state
    analyzeMutation.mutate();
  }, [analyzeMutation]);
  
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

  // Cleanup effect - cancel ongoing requests when component unmounts
  useEffect(() => {
    return () => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] === COMPONENT CLEANUP ===`);
      
      // Abort any ongoing analysis
      if (abortControllerRef.current) {
        console.log(`[${timestamp}] Aborting analysis on unmount`);
        abortControllerRef.current.abort();
      }
      
      // Clear any timeouts
      if (analysisTimeoutRef.current) {
        console.log(`[${timestamp}] Clearing timeout on unmount`);
        clearTimeout(analysisTimeoutRef.current);
      }
    };
  }, []);
  
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
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-3xl font-bold text-blue-600">{result.matchPercentage}%</div>
                      <div className="text-sm text-gray-500">match</div>
                    </div>
                    
                    {result.confidenceLevel && (
                      <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                        result.confidenceLevel === 'high' ? 'bg-green-100 text-green-800' :
                        result.confidenceLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {result.confidenceLevel} confidence
                      </div>
                    )}
                    
                    <Button
                      onClick={() => handleViewDetails(result.resumeId)}
                      variant={expanded === result.resumeId ? "default" : "outline"}
                      className="ml-4"
                    >
                      {expanded === result.resumeId ? "Hide Details" : "View Details"}
                    </Button>
                  </div>
                </div>
                
                {expanded === result.resumeId && (
                  <CardContent className="p-6">
                    {/* Match Summary Section */}
                    <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-6 w-6 bg-green-500 rounded-full flex items-center justify-center">
                          <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <h4 className="text-lg font-semibold text-green-800">Match Summary</h4>
                        <span className="ml-auto text-green-700 font-medium">
                          {result.matchPercentage}% - {result.matchPercentage >= 80 ? 'Excellent' : result.matchPercentage >= 60 ? 'Strong' : result.matchPercentage >= 40 ? 'Good' : 'Potential'} Candidate
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="h-5 w-5 bg-green-500 rounded-full flex items-center justify-center">
                            <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <span className="text-green-800">
                            <strong>Has key skills:</strong> {result.matchedSkills?.slice(0, 4).map(skill => 
                              typeof skill === 'string' ? skill : skill?.skill || 'Skill'
                            ).join(', ')} {result.matchedSkills && result.matchedSkills.length > 4 && `+${result.matchedSkills.length - 4} more`}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="h-5 w-5 bg-green-500 rounded-full flex items-center justify-center">
                            <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <span className="text-green-800">
                            <strong>Strong skill alignment with</strong> <em>{result.matchedSkills?.length || 0} matching requirements</em>
                          </span>
                        </div>
                        
                        {result.missingSkills && result.missingSkills.length > 0 && (
                          <div className="flex items-start gap-2">
                            <div className="h-5 w-5 bg-orange-500 rounded-full flex items-center justify-center mt-0.5">
                              <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
                              </svg>
                            </div>
                            <span className="text-orange-800">
                              <strong>May benefit from training in:</strong> {result.missingSkills.slice(0, 3).join(', ')} {result.missingSkills.length > 3 && `+${result.missingSkills.length - 3} more`}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <button 
                        onClick={() => setExpanded(expanded === result.resumeId ? null : result.resumeId)}
                        className="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        {expanded === result.resumeId ? 'Hide detailed breakdown' : 'View detailed breakdown'}
                      </button>
                    </div>
                    
                    {/* Skills and Experience Grid - Only show when expanded */}
                    {expanded === result.resumeId && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">KEY SKILLS</h4>
                        <div className="space-y-4">
                          {result.matchedSkills && result.matchedSkills.slice(0, 5).map((skill: any, index: number) => {
                            // Extract skill name and match percentage
                            const skillName = typeof skill === 'string' 
                              ? skill 
                              : (skill && typeof skill === 'object' && skill.skill && typeof skill.skill === 'string') 
                                ? skill.skill 
                                : `Relevant Skill ${index + 1}`;
                                
                            const matchPercentage = (skill && typeof skill === 'object' && typeof skill.matchPercentage === 'number') 
                              ? skill.matchPercentage 
                              : 85;
                            
                            return (
                              <div key={index} className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="font-medium text-gray-900">{skillName}</span>
                                  <span className="text-sm font-semibold text-green-600">
                                    {matchPercentage}% match
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-green-500 rounded-full h-full transition-all duration-300" 
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
                        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">EXPERIENCE & MISSING SKILLS</h4>
                        
                        {/* Experience Summary */}
                        <div className="mb-6">
                          <p className="text-gray-800 font-medium">
                            Strong skill alignment with <span className="font-semibold">{result.matchedSkills?.length || 0} matching requirements</span>
                          </p>
                        </div>
                        
                        {/* Missing Skills */}
                        {result.missingSkills?.length > 0 && (
                          <div className="mb-6">
                            <h5 className="text-sm font-medium text-gray-700 mb-3">Missing Skills</h5>
                            <div className="flex flex-wrap gap-2">
                              {result.missingSkills.map((skill, index) => (
                                <span 
                                  key={index} 
                                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-sm font-medium"
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                          
                        {/* AI Generated Content Section */}
                        <div className="mt-8 pt-6 border-t border-gray-200">
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                            {/* Left: AI Generated Label */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="h-4 w-4 text-gray-400">
                                <svg fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              </div>
                              <span className="text-sm text-gray-500 font-medium">AI-generated content</span>
                            </div>
                            
                            {/* Center: Candidate Summary */}
                            <div className="flex-1 max-w-md mx-auto lg:mx-0">
                              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">Candidate Summary</h4>
                                <p className="text-sm text-gray-700 leading-relaxed">
                                  {result.matchInsights?.summary || 
                                   `Strong candidate with ${result.matchPercentage}% match. Key skills include ${result.matchedSkills?.slice(0, 3).map(s => typeof s === 'string' ? s : s.skill).join(', ') || 'various skills'}. ${result.candidateStrengths?.length > 0 ? 'Notable strengths: ' + result.candidateStrengths[0] : ''}`}
                                </p>
                              </div>
                            </div>
                            
                            {/* Right: Interview Button */}
                            <div className="flex justify-center lg:justify-end flex-shrink-0">
                              <Button 
                                onClick={() => handleGenerateQuestions(result.resumeId)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 min-w-[200px]"
                              >
                                Generate Interview Questions
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    )}
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