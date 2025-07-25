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

type MatchedSkill = {
  skill: string;
  skill_name?: string; // Support legacy property names
  name?: string;       // Support legacy property names
  matchPercentage: number;
  match_percentage?: number; // Support legacy property names
};

type FairnessMetrics = {
  biasConfidenceScore: number;
  potentialBiasAreas?: string[];
  fairnessAssessment?: string;
};

type AnalysisResult = {
  resumeId: number;
  filename: string;
  candidateName: string;
  match: {
    matchPercentage: number;
    matchedSkills: MatchedSkill[] | string[];
    missingSkills: string[];
    candidateStrengths?: string[];
    candidateWeaknesses?: string[];
    confidenceLevel?: 'low' | 'medium' | 'high';
    fairnessMetrics?: FairnessMetrics;
  };
  analysisId: number;
};

export default function AnalysisPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const { steps } = useSteps(["Resume Upload", "Job Description", "Bias Detection", "Fit Analysis", "Interview Prep"], 3);
  
  const [match, routeParams] = useRoute("/analysis/:jobId");
  const jobId = match ? parseInt(routeParams.jobId) : 0;
  
  const [expanded, setExpanded] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Get the current session ID from localStorage
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  // Load session ID from localStorage when component mounts
  useEffect(() => {
    const storedSessionId = localStorage.getItem('currentUploadSession');
    setSessionId(storedSessionId);
    console.log(`Loaded upload session for analysis: ${storedSessionId}`);
  }, []);
  
  interface JobData {
    id: number;
    title: string;
    description: string;
    created: string;
    analyzedData: any;
  }

  // Fetch job details
  const { 
    data: jobData, 
    isLoading: isJobLoading, 
    error: jobError,
    isError: isJobError 
  } = useQuery<JobData>({
    queryKey: [`/api/job-descriptions/${jobId}`],
    enabled: !!jobId,
    retry: 1
  });
  
  // Analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      setIsAnalyzing(true);
      
      // Include the sessionId in the request body if available
      const requestBody = sessionId ? { sessionId } : {};
      
      return apiRequest("POST", `/api/analyze/${jobId}`, requestBody);
    },
    onSuccess: async (response) => {
      try {
        const data = await response.json();
        const resultCount = data.results?.length || 0;
        toast({
          title: "Analysis complete",
          description: `${resultCount} resume${resultCount !== 1 ? 's' : ''} analyzed successfully.`,
        });
      } catch (error) {
        console.error("Error parsing analysis response:", error);
        toast({
          title: "Error processing analysis",
          description: "The operation completed but there was an error processing the results.",
        });
      }
      setIsAnalyzing(false);
      refetch();
    },
    onError: (error) => {
      console.error("Analysis error:", error);
      toast({
        title: "Analysis failed",
        description: "There was an error analyzing resumes against this job description. Please try again.",
        variant: "destructive",
      });
      setIsAnalyzing(false);
    },
  });
  
  // Define the analysis response type
  interface AnalysisResponse {
    jobDescriptionId: number;
    jobTitle: string;
    results: AnalysisResult[];
  }
  
  // Fetch analysis data
  const { 
    data: analysisData, 
    isLoading, 
    isError, 
    error: fetchError, 
    refetch 
  } = useQuery<AnalysisResponse>({
    queryKey: [`/api/analyze/${jobId}`, sessionId],
    queryFn: async ({ queryKey }) => {
      const url = sessionId 
        ? `${queryKey[0]}?sessionId=${encodeURIComponent(sessionId)}`
        : String(queryKey[0]);
      
      console.log(`Fetching analysis data from: ${url} with session: ${sessionId || 'none'}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch analysis data');
      }
      const data = await response.json();
      console.log(`Analysis data received, count: ${data.results?.length || 0} results`);
      return data as AnalysisResponse;
    },
    enabled: !!jobId,
    retry: 1
  });
  
  const handleAnalyze = () => {
    analyzeMutation.mutate();
  };
  
  const handleReAnalyze = () => {
    handleAnalyze();
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
            
            {isAnalyzing ? (
              <div className="flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4"></div>
                <p className="text-gray-600">Analyzing resumes against job description...</p>
                <p className="text-sm text-gray-500 mt-2">This may take a moment</p>
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
              <Card key={`resume-${result.resumeId}-analysis-${result.analysisId}`} className="overflow-hidden">
                <div className="flex items-center justify-between bg-gray-50 p-4 border-b">
                  <div className="flex items-center">
                    <div className={`h-12 w-12 rounded-full ${stringToColor(result.candidateName)} flex items-center justify-center font-bold text-xl`}>
                      {getInitials(result.candidateName)}
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
                          <span className="text-3xl font-bold text-primary">{result.match.matchPercentage}%</span>
                          <span className="text-sm text-gray-500 ml-1">match</span>
                        </div>
                        {result.match.confidenceLevel && (
                          <div className="flex flex-col items-center">
                            <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              result.match.confidenceLevel === 'high' ? 'bg-green-100 text-green-800' :
                              result.match.confidenceLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {result.match.confidenceLevel} confidence
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
                          {result.match.matchedSkills && result.match.matchedSkills.slice(0, 5).map((skill: any, index: number) => {
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
                                Array.isArray(result.match.matchedSkills) 
                                  ? result.match.matchedSkills.map(skill => {
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
                                        } else if (typeof skill.name === 'string' && skill.name.trim() !== '') {
                                          skillName = skill.name;
                                        } else if (typeof skill.skill_name === 'string' && skill.skill_name.trim() !== '') {
                                          skillName = skill.skill_name;
                                        } else {
                                          skillName = 'Unnamed Skill';
                                        }
                                        
                                        // Get match percentage, prefer matchPercentage property, fall back to other properties
                                        let matchPct;
                                        if (typeof skill.matchPercentage === 'number') {
                                          matchPct = skill.matchPercentage;
                                        } else if (typeof skill.match_percentage === 'number') {
                                          matchPct = skill.match_percentage;
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
                          {result.match.candidateStrengths && result.match.candidateStrengths.slice(0, 2).map((strength, index) => (
                            <div key={index}>
                              <p className="font-medium text-gray-800">{strength}</p>
                            </div>
                          ))}
                          
                          {result.match.missingSkills?.length > 0 && (
                            <div className="pt-2">
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Missing Skills</h5>
                              <div className="flex flex-wrap gap-2">
                                {result.match.missingSkills.map((skill, index) => (
                                  <Badge key={index} variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                    {skill}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Confidence Level Section */}
                          {result.match.confidenceLevel && (
                            <div className="pt-4 mt-4 border-t border-gray-200">
                              <h5 className="text-sm font-semibold text-gray-600 mb-3">Analysis Confidence</h5>
                              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-800">Confidence Level</span>
                                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                    result.match.confidenceLevel === 'high' ? 'bg-green-100 text-green-800' :
                                    result.match.confidenceLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {result.match.confidenceLevel.toUpperCase()}
                                  </div>
                                </div>
                                <p className="text-xs text-gray-600 mt-2">
                                  {result.match.confidenceLevel === 'high' && 'High confidence: Analysis based on comprehensive data with clear skill matches.'}
                                  {result.match.confidenceLevel === 'medium' && 'Medium confidence: Analysis based on adequate data but some areas may need more information.'}
                                  {result.match.confidenceLevel === 'low' && 'Low confidence: Analysis based on limited data. Consider providing more detailed information.'}
                                </p>
                              </div>
                            </div>
                          )}
                          
                          {/* Fairness Metrics Section */}
                          {result.match.fairnessMetrics && (
                            <div className="pt-4 mt-4 border-t border-gray-200">
                              <h5 className="text-sm font-semibold text-gray-600 mb-3">Fairness Analysis</h5>
                              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <div className="mb-3">
                                  <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-800">Bias Confidence Score</span>
                                    <span className={`font-medium ${
                                      result.match.fairnessMetrics.biasConfidenceScore >= 80 
                                        ? 'text-green-600' 
                                        : result.match.fairnessMetrics.biasConfidenceScore >= 40 
                                          ? 'text-amber-600' 
                                          : 'text-red-600'
                                    }`}>
                                      {result.match.fairnessMetrics.biasConfidenceScore}%
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className={`rounded-full h-full ${
                                        result.match.fairnessMetrics.biasConfidenceScore >= 80 
                                          ? 'bg-green-500' 
                                          : result.match.fairnessMetrics.biasConfidenceScore >= 40 
                                            ? 'bg-amber-500' 
                                            : 'bg-red-500'
                                      }`} 
                                      style={{ width: `${result.match.fairnessMetrics.biasConfidenceScore}%` }}
                                    ></div>
                                  </div>
                                </div>
                                
                                {result.match.fairnessMetrics.fairnessAssessment && (
                                  <p className="text-sm text-gray-700 mt-2">
                                    {result.match.fairnessMetrics.fairnessAssessment}
                                  </p>
                                )}
                                
                                {result.match.fairnessMetrics.potentialBiasAreas && 
                                  result.match.fairnessMetrics.potentialBiasAreas.length > 0 && (
                                    <div className="mt-3">
                                      <h6 className="text-xs font-medium text-gray-700 mb-2">Potential Bias Areas</h6>
                                      <div className="flex flex-wrap gap-2">
                                        {result.match.fairnessMetrics.potentialBiasAreas.map((area, index) => (
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