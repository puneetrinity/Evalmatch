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
  
  const [isBiasAnalyzing, setIsBiasAnalyzing] = useState(false);
  const [biasAnalysis, setBiasAnalysis] = useState<BiasAnalysisUI | null>(null);
  const [hasAttemptedBiasAnalysis, setHasAttemptedBiasAnalysis] = useState(false);

  // Get job description with proper caching strategy
  const { data: jobData, isLoading } = useQuery<JobData>({
    queryKey: [`/api/job-descriptions/${jobId}`],
    enabled: !!jobId,
    // Reasonable refetch settings to prevent infinite loops
    refetchInterval: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", `/api/job-descriptions/${jobId}`);
        const data = await response.json();
        // Extract jobDescription from the response
        if (data.jobDescription) {
          // Add isAnalyzed flag from the parent response
          // Also ensure we map analyzedData.biasAnalysis to analysis.biasAnalysis for backward compatibility
          const jobData = { ...data.jobDescription, isAnalyzed: data.isAnalyzed };
          
          // Create analysis field for backward compatibility
          if (jobData.analyzedData && !jobData.analysis) {
            jobData.analysis = {
              biasAnalysis: jobData.analyzedData.biasAnalysis
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
          setTimeout(() => setLocation("/job-description"), 2000);
          return null;
        }
        throw error;
      }
    }
  });

  // Analyze bias mutation
  const biasAnalyzeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/analysis/analyze-bias/${jobId}`);
    },
    onSuccess: async (response) => {
      try {
        const data = await response.json();
        
        if (!data || !data.biasAnalysis) {
          throw new Error("Invalid response format from server");
        }
        
        setBiasAnalysis(data.biasAnalysis);
        
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
      toast({
        title: "Bias analysis failed",
        description: "Could not complete the bias analysis. Please try again later.",
        variant: "destructive",
      });
      setIsBiasAnalyzing(false);
    },
  });

  // If no job ID, redirect to job description page
  useEffect(() => {
    if (!jobId) {
      setLocation("/job-description");
    } else {
      // Reset bias analysis attempt flag when jobId changes
      setHasAttemptedBiasAnalysis(false);
      setBiasAnalysis(null);
    }
  }, [jobId, setLocation]);

  // Process job data when it changes - SIMPLIFIED to prevent infinite loop
  useEffect(() => {
    if (jobData) {
      console.log(`Job data fetched. Job ID: ${jobId}, ID: ${jobData.id}, Title: ${jobData.title}, Analyzed: ${jobData.isAnalyzed}`);
      
      // Check for existing bias analysis in both possible locations
      const existingBiasAnalysis = jobData.analysis?.biasAnalysis || jobData.analyzedData?.biasAnalysis;
      console.log(`Analysis exists: ${!!jobData.analysis?.biasAnalysis}, AnalyzedData Bias Analysis exists: ${!!jobData.analyzedData?.biasAnalysis}`);
      
      // If we found existing bias analysis, set it immediately and stop the loop
      if (existingBiasAnalysis && !biasAnalysis) {
        console.log("Found existing bias analysis, setting it to prevent loop");
        setBiasAnalysis({
          hasBias: existingBiasAnalysis.hasBias || false,
          biasTypes: existingBiasAnalysis.biasTypes || [],
          biasedPhrases: existingBiasAnalysis.biasedPhrases || [],
          suggestions: existingBiasAnalysis.suggestions || [],
          improvedDescription: existingBiasAnalysis.improvedDescription || jobData.description,
          biasConfidenceScore: (existingBiasAnalysis as any).biasConfidenceScore || 95,
          fairnessAssessment: (existingBiasAnalysis as any).fairnessAssessment || 'Analysis completed'
        });
        setHasAttemptedBiasAnalysis(true); // Prevent further attempts
        return;
      }
      
      // Only auto-trigger bias analysis if:
      // 1. Job is analyzed 
      // 2. No existing bias analysis found
      // 3. Haven't attempted bias analysis yet
      // 4. Not currently analyzing
      if (jobData.isAnalyzed && !existingBiasAnalysis && !hasAttemptedBiasAnalysis && !isBiasAnalyzing) {
        console.log("Job analysis complete, automatically starting new bias analysis via API");
        setIsBiasAnalyzing(true);
        setHasAttemptedBiasAnalysis(true);
        biasAnalyzeMutation.mutate();
      }
    }
  }, [jobData, hasAttemptedBiasAnalysis, isBiasAnalyzing]); // Removed biasAnalysis from deps to prevent loop

  // Handle analyze bias button click
  const handleAnalyzeBias = () => {
    setIsBiasAnalyzing(true);
    setHasAttemptedBiasAnalysis(true);
    biasAnalyzeMutation.mutate();
  };

  // Handle continue to fit analysis
  const handleContinue = () => {
    setLocation(`/analysis/${jobId}`);
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
  const isJobAnalysisComplete = isJobAnalyzed || hasBiasAnalysis;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        <StepProgress steps={steps} />
        
        <h1 className="text-3xl font-bold mb-6">Bias Detection</h1>
        
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : jobData ? (
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{jobData.title || 'Job Description'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap">
                  {jobData.description || ''}
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