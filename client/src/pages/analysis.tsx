import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useSteps } from "@/hooks/use-steps";
import { useAnalysis } from "@/hooks/use-analysis";
import { useJobData } from "@/hooks/use-job-data";

import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";

import {
  AnalysisHeader,
  AnalysisControls,
  JobDescriptionCard,
  CandidateResultCard,
  NoResultsState
} from "@/components/analysis";

import type { JobId, SessionId } from "@shared/api-contracts";


export default function AnalysisPage() {
  const [_, setLocation] = useLocation();
  const { steps } = useSteps(["Resume Upload", "Job Description", "Bias Detection", "Fit Analysis", "Interview Prep"], 3);
  
  const [match, routeParams] = useRoute("/analysis/:jobId");
  const jobId = match ? parseInt(routeParams.jobId) as JobId : 0 as JobId;
  
  // Parse URL parameters for session/batch IDs (higher priority than localStorage)
  const urlParams = new URLSearchParams(window.location.search);
  const urlSessionId = urlParams.get('sessionId');
  const urlBatchId = urlParams.get('batchId');
  
  // Early validation of jobId
  const isValidJobId = match && routeParams.jobId && routeParams.jobId !== 'undefined' && !isNaN(Number(routeParams.jobId));
  
  const [expanded, setExpanded] = useState<number | null>(null);
  
  // Initialize session ID and batch ID from URL parameters first, then localStorage
  const [sessionId, setSessionId] = useState<SessionId | null>(() => {
    // Prioritize URL parameters over localStorage to handle navigation context
    const finalSessionId = urlSessionId || localStorage.getItem('currentUploadSession');
    
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] === LOADING SESSION VALUES ===`);
      console.log(`[${timestamp}] URL sessionId: ${urlSessionId}`);
      console.log(`[${timestamp}] localStorage sessionId: ${localStorage.getItem('currentUploadSession')}`);
      console.log(`[${timestamp}] Final sessionId: ${finalSessionId}`);
    }
    
    return finalSessionId as SessionId | null;
  });
  
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(() => {
    // Prioritize URL parameters over localStorage to handle navigation context
    const finalBatchId = urlBatchId || localStorage.getItem('currentBatchId');
    
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] === LOADING BATCH VALUES ===`);
      console.log(`[${timestamp}] URL batchId: ${urlBatchId}`);
      console.log(`[${timestamp}] localStorage batchId: ${localStorage.getItem('currentBatchId')}`);
      console.log(`[${timestamp}] Final batchId: ${finalBatchId}`);
    }
    
    return finalBatchId;
  });
  
  // Initialize as ready immediately if we have required data
  const [isInitialized, setIsInitialized] = useState(() => {
    const hasRequiredData = !!(sessionId && currentBatchId && jobId);
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] === SYNCHRONOUS INITIALIZATION ===`);
      console.log(`[${timestamp}] Initial isInitialized state: ${hasRequiredData}`);
    }
    return hasRequiredData;
  });
  
  // Sync URL parameters to localStorage to maintain consistency
  useEffect(() => {
    if (urlSessionId && urlSessionId !== localStorage.getItem('currentUploadSession')) {
      localStorage.setItem('currentUploadSession', urlSessionId);
      if (process.env.NODE_ENV === 'development') {
        console.log(`[${new Date().toISOString()}] Updated localStorage sessionId from URL: ${urlSessionId}`);
      }
    }
    
    if (urlBatchId && urlBatchId !== localStorage.getItem('currentBatchId')) {
      localStorage.setItem('currentBatchId', urlBatchId);
      if (process.env.NODE_ENV === 'development') {
        console.log(`[${new Date().toISOString()}] Updated localStorage batchId from URL: ${urlBatchId}`);
      }
    }
  }, [urlSessionId, urlBatchId]);

  // Update initialization state when dependencies change
  useEffect(() => {
    const shouldBeInitialized = !!(sessionId && currentBatchId && jobId);
    if (shouldBeInitialized !== isInitialized) {
      if (process.env.NODE_ENV === 'development') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] === UPDATING INITIALIZATION STATE ===`);
        console.log(`[${timestamp}] Setting isInitialized: ${shouldBeInitialized}`);
      }
      setIsInitialized(shouldBeInitialized);
    }
  }, [sessionId, currentBatchId, jobId, isInitialized]);

  // Use custom hooks for data fetching and analysis
  const { 
    jobData, 
    isJobLoading, 
    shouldShowJobError 
  } = useJobData({ jobId, isValidJobId: Boolean(isValidJobId) });

  const {
    analysisData,
    isLoading,
    isError,
    isAnalyzing,
    handleAnalyze,
    handleReAnalyze
  } = useAnalysis({
    jobId,
    sessionId,
    currentBatchId,
    isValidJobId: Boolean(isValidJobId),
    isInitialized
  });
  
  const handleViewDetails = (resumeId: number) => {
    if (expanded === resumeId) {
      setExpanded(null);
    } else {
      setExpanded(resumeId);
    }
  };
  
  const handleGenerateQuestions = (resumeId: number, jobId: number) => {
    setLocation(`/interview/${resumeId}/${jobId}`);
  };
  
  const noResults = !isLoading && (!analysisData?.results || analysisData.results.length === 0);
  const isPending = false; // This would come from analyzeMutation.isPending in the hook
  
  if (!isValidJobId || !jobId) {
    // Clear stale localStorage data when jobId is invalid
    if (typeof window !== 'undefined') {
      localStorage.removeItem('currentUploadSession');
      localStorage.removeItem('currentBatchId');
    }
    
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-8">
          <div className="text-center p-12">
            <h1 className="text-3xl font-bold mb-6">Invalid Job ID</h1>
            <p className="mb-6">No valid job description ID was provided.</p>
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
        <AnalysisHeader steps={steps} />
        
        <JobDescriptionCard
          jobData={jobData}
          isJobLoading={isJobLoading}
          shouldShowJobError={shouldShowJobError}
          onNavigateToJobDescriptions={() => setLocation("/job-description")}
        />
        
        {isLoading ? (
          <div className="flex justify-center p-12" aria-live="polite" aria-label="Loading analysis data">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" aria-hidden="true"></div>
            <span className="sr-only">Loading analysis data...</span>
          </div>
        ) : (
          <AnalysisControls 
            isError={isError}
            onTryAgain={handleReAnalyze}
          />
        )}
        
        {noResults ? (
          <NoResultsState
            isAnalyzing={isAnalyzing}
            isPending={isPending}
            sessionId={sessionId}
            currentBatchId={currentBatchId}
            onTryAgain={handleReAnalyze}
          />
        ) : (
          <div className="space-y-6 mb-8" aria-live="polite" aria-label="Analysis results">
            <div className="sr-only">
              {analysisData?.results?.length ? 
                `Found ${analysisData.results.length} candidate${analysisData.results.length === 1 ? '' : 's'}` : 
                'No candidates found'
              }
            </div>
            {analysisData?.results && analysisData.results.map((result: any) => (
              <CandidateResultCard
                key={`resume-${result.resumeId}-analysis-${result.analysisId || 'unknown'}`}
                result={result}
                expanded={expanded === result.resumeId}
                jobId={jobId}
                onViewDetails={handleViewDetails}
                onGenerateQuestions={handleGenerateQuestions}
              />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}