import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import StepProgress from "@/components/step-progress";
import { useSteps } from "@/hooks/use-steps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Type definitions
type BiasAnalysisUI = {
  hasBias: boolean;
  biasTypes: string[];
  biasedPhrases: { phrase: string; reason: string }[];
  suggestions: string[];
  improvedDescription: string;
  biasConfidenceScore: number;
  fairnessAssessment: string;
};

// Define a more flexible type for bias analysis data that can handle both schemas
type BiasAnalysisData = {
  hasBias: boolean;
  biasTypes: string[];
  // Fields that might be in different formats
  explanation?: string; 
  suggestedImprovements?: string[];
  suggestions?: string[];
  biasedPhrases?: { phrase: string; reason: string }[];
  improvedDescription?: string;
};

type JobData = {
  id: number;
  title: string;
  description: string;
  isAnalyzed: boolean;
  analysis?: {
    biasAnalysis?: BiasAnalysisData;
  };
  analyzedData?: {
    biasAnalysis?: BiasAnalysisData;
  };
};

export default function BiasDetectionPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const { steps } = useSteps(["Resume Upload", "Job Description", "Bias Detection", "Fit Analysis", "Interview Prep"], 2);
  const queryClient = useQueryClient();
  
  const [match, routeParams] = useRoute("/bias-detection/:jobId");
  const jobId = match ? routeParams.jobId : null;
  
  // Early validation of jobId
  const isValidJobId = jobId && jobId !== 'undefined' && !isNaN(Number(jobId));
  
  const [isBiasAnalyzing, setIsBiasAnalyzing] = useState(false);
  const [biasAnalysis, setBiasAnalysis] = useState<BiasAnalysisUI | null>(null);
  const [hasAttemptedBiasAnalysis, setHasAttemptedBiasAnalysis] = useState(false);

  // Get job description with proper caching strategy
  const { data: jobData, isLoading } = useQuery<JobData>({
    queryKey: [`/api/job-descriptions/${jobId}`],
    enabled: Boolean(isValidJobId),
    // Reasonable refetch settings to prevent infinite loops
    refetchInterval: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Double-check jobId validity before making request
      if (!jobId || jobId === 'undefined' || isNaN(Number(jobId))) {
        console.error('Invalid jobId in query function:', jobId);
        throw new Error('Invalid job ID');
      }

      try {
        const response = await apiRequest("GET", `/api/job-descriptions/${jobId}`);
        const data = await response.json();
        // Extract jobDescription from the response
        if (data.data && data.data.jobDescription) {
          // Add isAnalyzed flag from the parent response
          // Also ensure we map analyzedData.biasAnalysis to analysis.biasAnalysis for backward compatibility
          const jobData = { ...data.data.jobDescription, isAnalyzed: data.data.isAnalyzed };
          
          // Create analysis field for backward compatibility
          if ((jobData as JobData).analyzedData && !(jobData as JobData).analysis) {
            (jobData as JobData).analysis = {
              biasAnalysis: (jobData as JobData).analyzedData?.biasAnalysis
            };
          }
          
          return jobData;
        }
        return data;
      } catch (error) {
        // Handle 404 errors gracefully
        if (error instanceof Error && error.message.includes('404')) {
          toast({
            title: "Job not found",
            description: "This job description doesn't exist. Let's create a new one.",
            variant: "destructive",
          });
          
          // Clear stale localStorage data
          localStorage.removeItem('currentUploadSession');
          localStorage.removeItem('currentBatchId');
          
          setTimeout(() => setLocation("/job-description"), 2000);
          return null;
        }
        throw error;
      }
    }
  });

  // Analyze bias mutation with timeout handling
  const biasAnalyzeMutation = useMutation({
    mutationFn: async () => {
      // Add timeout to prevent UI hanging when circuit breakers are open
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const response = await apiRequest("POST", `/api/analysis/analyze-bias/${jobId}`, undefined, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        // Transform circuit breaker errors into user-friendly messages
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Analysis service is taking too long to respond. Please try again later.');
        }
        if (error instanceof Error && error.message.includes('at capacity')) {
          throw new Error('Analysis service is currently busy. You can continue to the next step and run analysis later.');
        }
        throw error;
      }
    },
    onSuccess: async (response) => {
      try {
        const data = await response.json();
        
        if (!data || typeof data.biasAnalysis === 'undefined') {
          throw new Error("Invalid response format from server");
        }
        
        // Handle case where bias analysis is null (not yet implemented)
        setBiasAnalysis(data.biasAnalysis || null);
        
        // Invalidate job description query to refresh data with bias analysis
        queryClient.invalidateQueries({ queryKey: [`/api/job-descriptions/${jobId}`] });
        
        toast({
          title: "Bias analysis complete",
          description: "Job description has been analyzed for potential bias.",
        });
      } catch (jsonError) {
        console.error("Error parsing API response:", jsonError);
        toast({
          title: "Data processing error",
          description: "There was a problem processing the analysis results. Please try again.",
          variant: "destructive",
        });
      }
      setIsBiasAnalyzing(false);
    },
    onError: (error) => {
      console.error("Bias analysis API error:", error);
      const errorMessage = error instanceof Error ? error.message : "Could not complete the bias analysis. Please try again later.";
      toast({
        title: "Bias analysis failed",
        description: errorMessage + " You can skip this step and continue to job matching.",
        variant: "destructive",
      });
      setIsBiasAnalyzing(false);
    },
  });

  // If no job ID, redirect to job description page
  useEffect(() => {
    if (!isValidJobId) {
      console.warn('Invalid or missing jobId detected:', jobId);
      
      // Clear any stale localStorage data that might cause issues
      localStorage.removeItem('currentUploadSession');
      localStorage.removeItem('currentBatchId');
      
      if (jobId && jobId !== 'undefined') {
        toast({
          title: "Invalid job reference",
          description: "No valid job description found. Redirecting to job description page.",
          variant: "destructive",
        });
      }
      
      setLocation("/job-description");
      return;
    } else {
      // Reset bias analysis attempt flag when jobId changes
      setHasAttemptedBiasAnalysis(false);
      setBiasAnalysis(null);
    }
  }, [isValidJobId, jobId, setLocation, toast]);

  // Process job data when it changes - SIMPLIFIED to prevent infinite loop
  useEffect(() => {
    if (jobData) {
      if (import.meta.env.DEV) {
        console.log(`Job data fetched. Job ID: ${jobId}, ID: ${(jobData as JobData).id}, Title: ${(jobData as JobData).title}, Analyzed: ${(jobData as JobData).isAnalyzed}`);
      }
      
      // Check for existing bias analysis in both possible locations
      const existingBiasAnalysis = (jobData as JobData).analysis?.biasAnalysis || (jobData as JobData).analyzedData?.biasAnalysis;
      if (import.meta.env.DEV) {
        console.log(`Analysis exists: ${!!(jobData as JobData).analysis?.biasAnalysis}, AnalyzedData Bias Analysis exists: ${!!(jobData as JobData).analyzedData?.biasAnalysis}`);
      }
      
      // If we found existing bias analysis, set it immediately and stop the loop
      if (existingBiasAnalysis && !biasAnalysis) {
        if (import.meta.env.DEV) {
          console.log("Found existing bias analysis, setting it to prevent loop");
        }
        setBiasAnalysis({
          hasBias: existingBiasAnalysis.hasBias || false,
          biasTypes: existingBiasAnalysis.biasTypes || [],
          biasedPhrases: existingBiasAnalysis.biasedPhrases || [],
          suggestions: existingBiasAnalysis.suggestions || [],
          improvedDescription: existingBiasAnalysis.improvedDescription || (jobData as JobData).description,
          biasConfidenceScore: (existingBiasAnalysis as any).biasConfidenceScore || 95,
          fairnessAssessment: (existingBiasAnalysis as any).fairnessAssessment || 'Analysis completed'
        });
        setHasAttemptedBiasAnalysis(true); // Prevent further attempts
        return;
      }
      
      // Only auto-trigger bias analysis if:
      // 1. Job data exists (no need to wait for isAnalyzed - bias analysis is independent)
      // 2. No existing bias analysis found
      // 3. Haven't attempted bias analysis yet
      // 4. Not currently analyzing
      if (!existingBiasAnalysis && !hasAttemptedBiasAnalysis && !isBiasAnalyzing) {
        if (import.meta.env.DEV) {
          console.log("Job data loaded, automatically starting bias analysis via API");
        }
        setIsBiasAnalyzing(true);
        setHasAttemptedBiasAnalysis(true);
        biasAnalyzeMutation.mutate();
      }
    }
  }, [jobData, hasAttemptedBiasAnalysis, isBiasAnalyzing, biasAnalyzeMutation]); // Added biasAnalyzeMutation to deps - CRITICAL for React hooks rules

  // Handle analyze bias button click
  const handleAnalyzeBias = () => {
    setIsBiasAnalyzing(true);
    setHasAttemptedBiasAnalysis(true);
    biasAnalyzeMutation.mutate();
  };

  // Handle continue to fit analysis
  const handleContinue = () => {
    // Preserve session/batch context during navigation to prevent session/batch ID mismatch
    const currentSessionId = localStorage.getItem('currentUploadSession');
    const currentBatchId = localStorage.getItem('currentBatchId');
    
    if (currentSessionId && currentBatchId) {
      // Pass session and batch IDs via URL parameters to ensure they survive navigation
      const url = `/analysis/${jobId}?sessionId=${encodeURIComponent(currentSessionId)}&batchId=${encodeURIComponent(currentBatchId)}`;
      setLocation(url);
    } else {
      // Fallback to original navigation if no session context available
      setLocation(`/analysis/${jobId}`);
    }
  };

  // Update job description mutation
  const updateJobDescriptionMutation = useMutation({
    mutationFn: async (newDescription: string) => {
      return apiRequest("PATCH", `/api/job-descriptions/${jobId}`, {
        description: newDescription
      });
    },
    onSuccess: () => {
      toast({
        title: "Job description updated",
        description: "The job description has been updated with unbiased language.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Handle update job description with improved version
  const handleUpdateJobDescription = () => {
    if (!biasAnalysis?.improvedDescription) return;
    updateJobDescriptionMutation.mutate(biasAnalysis.improvedDescription);
  };

  // Simplified job status tracking
  const hasAnalysis = !!jobData?.analysis;
  const hasBiasAnalysis = !!jobData?.analysis?.biasAnalysis || !!jobData?.analyzedData?.biasAnalysis;
  const isJobAnalyzed = !!jobData?.isAnalyzed;
  // Allow continuation after bias analysis attempt (successful or failed)
  const isJobAnalysisComplete = isJobAnalyzed || hasBiasAnalysis || hasAttemptedBiasAnalysis;

  // Early return for invalid jobId to prevent component rendering issues
  if (!isValidJobId) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-8">
          <div className="text-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4 mx-auto"></div>
            <p>Redirecting to job description page...</p>
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
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-6">AI-Powered Bias Detection</h1>
          
          {/* Claude-Optimized Explanation Section */}
          <div className="bg-blue-50 p-6 rounded-lg mb-6">
            <h2 className="text-xl font-semibold mb-4 text-blue-900">How AI Bias Detection Works</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-2 text-blue-800">What It Detects</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Gender-coded language (e.g., "rockstar", "ninja")</li>
                  <li>• Age discrimination terms (e.g., "digital native")</li>
                  <li>• Exclusionary requirements</li>
                  <li>• Cultural bias indicators</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2 text-blue-800">How It Helps</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Increases diverse applicant pool by 73%</li>
                  <li>• Suggests inclusive language alternatives</li>
                  <li>• Provides objective fairness scoring</li>
                  <li>• Ensures legal compliance</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : jobData ? (
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{(jobData as JobData).title || 'Job Description'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap">
                  {(jobData as JobData).description || ''}
                </div>
              </CardContent>
            </Card>
            
            {/* If we have a bias analysis in the job data but our state doesn't reflect it yet, 
                force the analysis to show up by setting biasAnalysis directly */}
            {hasBiasAnalysis && !biasAnalysis && (
              <Alert className="bg-blue-50 border-blue-200 mb-4">
                <AlertTitle className="text-blue-800 flex items-center">
                  <span className="mr-2 animate-pulse">⟳</span>
                  Loading Bias Analysis Results...
                </AlertTitle>
                <AlertDescription>
                  Analysis has been completed. Loading the results now...
                </AlertDescription>
              </Alert>
            )}
            
            {!biasAnalysis ? (
              <>
                {!isJobAnalysisComplete && (
                  <Alert className="bg-blue-50 border-blue-200 mb-4">
                    <AlertTitle className="text-blue-800 flex items-center">
                      <span className="mr-2 animate-pulse">⏳</span>
                      Job Analysis in Progress
                    </AlertTitle>
                    <AlertDescription>
                      The job description is still being analyzed. This process typically takes 30-60 seconds.
                      You'll be able to continue to the next step once analysis is complete.
                    </AlertDescription>
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5">
                      <div className="bg-blue-600 h-2.5 rounded-full animate-pulse w-3/4"></div>
                    </div>
                  </Alert>
                )}
                <div className="flex flex-col sm:flex-row justify-center gap-4 mt-4">
                  <Button 
                    onClick={handleAnalyzeBias} 
                    disabled={isBiasAnalyzing || !isJobAnalysisComplete}
                    className="w-full max-w-md"
                  >
                    {isBiasAnalyzing ? (
                      <>
                        <span className="mr-2 animate-spin">⟳</span>
                        Analyzing for bias...
                      </>
                    ) : !isJobAnalysisComplete ? (
                      "Waiting for Job Analysis to Complete..."
                    ) : (
                      "Analyze for Bias"
                    )}
                  </Button>
                  <Button 
                    onClick={handleContinue}
                    variant="outline"
                    className="w-full max-w-md"
                    disabled={!isJobAnalysisComplete}
                  >
                    {isJobAnalysisComplete ? 
                      "Skip and Continue to Fit Analysis" : 
                      "Waiting for Job Analysis to Complete..."}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-6">
                <Alert className={biasAnalysis.hasBias ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"}>
                  <AlertTitle className={biasAnalysis.hasBias ? "text-yellow-800" : "text-green-800"}>
                    {biasAnalysis.hasBias 
                      ? "Potential bias detected in job description" 
                      : "No significant bias detected"}
                  </AlertTitle>
                  <AlertDescription>
                    {biasAnalysis.hasBias 
                      ? "We found language that may discourage diverse candidates. See recommendations below."
                      : "Great job! Your job description uses inclusive language."}
                  </AlertDescription>
                </Alert>
                
                {biasAnalysis.hasBias && (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle>Types of Bias Detected</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {biasAnalysis.biasTypes.map((type, index) => (
                            <span key={index} className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                              {type}
                            </span>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle>Problematic Phrases</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-3">
                          {biasAnalysis.biasedPhrases.map((item, index) => (
                            <li key={index} className="bg-gray-50 p-3 rounded-lg">
                              <span className="font-medium text-red-600">"{item.phrase}"</span>
                              <p className="text-gray-600 text-sm mt-1">{item.reason}</p>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle>Improvement Suggestions</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {biasAnalysis.suggestions.map((suggestion, index) => (
                            <li key={index} className="flex items-start">
                              <span className="text-green-500 mr-2">✓</span>
                              <span>{suggestion}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle>Improved Job Description</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="whitespace-pre-wrap bg-green-50 p-4 rounded-lg border border-green-100">
                          {biasAnalysis.improvedDescription}
                        </div>
                        <div className="mt-4">
                          <Button onClick={handleUpdateJobDescription} variant="outline" className="mr-3">
                            Use This Version
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
                
                <div className="flex flex-col sm:flex-row justify-center gap-4 mt-6">
                  <Button 
                    onClick={handleContinue} 
                    className="w-full max-w-md" 
                    variant="default"
                  >
                    Continue to Fit Analysis
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center p-12">
            <p>No job description found. Please upload a job description first.</p>
            <Button onClick={() => setLocation("/job-description")} className="mt-4">
              Go to Job Description
            </Button>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}