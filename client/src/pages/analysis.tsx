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
  
  // Early validation of jobId
  const isValidJobId = match && routeParams.jobId && routeParams.jobId !== 'undefined' && !isNaN(Number(routeParams.jobId));
  
  const [expanded, setExpanded] = useState<number | null>(null);
  
  // Initialize session ID and batch ID from localStorage synchronously
  const [sessionId, setSessionId] = useState<SessionId | null>(() => {
    const storedSessionId = localStorage.getItem('currentUploadSession');
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] === LOADING LOCALSTORAGE VALUES SYNCHRONOUSLY ===`);
      console.log(`[${timestamp}] localStorage.getItem('currentUploadSession'): ${storedSessionId}`);
    }
    return storedSessionId as SessionId | null;
  });
  
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(() => {
    const storedBatchId = localStorage.getItem('currentBatchId');
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] localStorage.getItem('currentBatchId'): ${storedBatchId}`);
      console.log(`[${timestamp}] Initial state will be set to:
        - sessionId: ${localStorage.getItem('currentUploadSession')}
        - currentBatchId: ${storedBatchId}
      `);
    }
    return storedBatchId;
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
  } = useJobData({ jobId, isValidJobId });

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
    isValidJobId,
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
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
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
          <div className="space-y-6 mb-8">
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