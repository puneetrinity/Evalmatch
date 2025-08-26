import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isApiSuccess } from "@shared/api-contracts";
import type { 
  JobId, 
  SessionId, 
  AnalysisResponse, 
  ApiResult 
} from "@shared/api-contracts";

// Enhanced type definitions for the analysis hook
interface AnalysisResult {
  resumeId: number;
  filename: string;
  candidateName?: string;
  matchPercentage: number;
  matchedSkills: any[];
  missingSkills: string[];
  candidateStrengths: string[];
  candidateWeaknesses: string[];
  recommendations: string[];
  confidenceLevel: 'low' | 'medium' | 'high';
  analysisId?: number;
  scoringDimensions?: {
    skills: number;
    experience: number;
    education: number;
    semantic: number;
    overall: number;
  };
  fairnessMetrics?: any;
  matchInsights?: any;
}

interface AnalysisData {
  analysisId: number;
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

interface UseAnalysisOptions {
  jobId: JobId;
  sessionId: SessionId | null;
  currentBatchId: string | null;
  isValidJobId: boolean;
  isInitialized: boolean;
}

export function useAnalysis({
  jobId,
  sessionId,
  currentBatchId,
  isValidJobId,
  isInitialized
}: UseAnalysisOptions) {
  const { toast } = useToast();
  const [hasAttemptedAutoAnalysis, setHasAttemptedAutoAnalysis] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const MAX_RETRIES = 3;

  // Use refs to prevent stale closures and provide stable references
  const analysisStateRef = useRef({ hasAttemptedAutoAnalysis, retryCount });
  const abortControllerRef = useRef<AbortController | null>(null);
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update refs when state changes
  useEffect(() => {
    analysisStateRef.current = { hasAttemptedAutoAnalysis, retryCount };
  }, [hasAttemptedAutoAnalysis, retryCount]);

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
    enabled: Boolean(isValidJobId && jobId && sessionId && currentBatchId && isInitialized),
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
          console.log(`[${new Date().toISOString()}] Response marked as success, returning analysis data...`);
          return result.data;
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
    }
  }, [analysisConditions, jobId, currentBatchId, retryCount, hasAttemptedAutoAnalysis, analyzeMutation, toast]);

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

  // Cleanup effect - cancel ongoing requests when component unmounts
  useEffect(() => {
    return () => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] === ANALYSIS HOOK CLEANUP ===`);
      
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

  return {
    // Data
    analysisData,
    isLoading,
    isError,
    fetchError,
    
    // Analysis state
    isAnalyzing,
    hasAttemptedAutoAnalysis,
    retryCount,
    
    // Mutation state
    analyzeMutation,
    
    // Actions
    handleAnalyze,
    handleReAnalyze,
    refetch
  };
}