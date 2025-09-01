import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  API_ROUTES, 
  AnalysisRequest,
  AnalysisResponse,
  AnalysisResult,
  ApiResponse,
  isApiSuccess
} from "@shared/api-contracts";

// Custom hook for running analysis
export function useRunAnalysis() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { jobId: number; analysisData: AnalysisRequest }): Promise<AnalysisResponse> => {
      try {
        const url = API_ROUTES.ANALYSIS.ANALYZE_JOB.replace(':jobId', params.jobId.toString());
        const response = await apiRequest("POST", url, params.analysisData);
        const data = await response.json() as ApiResponse<AnalysisResponse>;
        
        if (isApiSuccess(data)) {
          return data.data;
        }
        throw new Error("Invalid response format");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to run analysis";
        throw new Error(message);
      }
    },
    onSuccess: (data) => {
      // Invalidate analysis queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["analysis"] });
      queryClient.invalidateQueries({ queryKey: ["analysis", data.jobId] });
      
      toast({
        title: "Analysis Complete",
        description: `Successfully analyzed ${data.results.length} resume(s) against the job description.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to run analysis",
        variant: "destructive",
      });
    },
  });
}

// Custom hook for fetching analysis results
export function useAnalysisResults(jobId: number) {
  const { toast } = useToast();

  return useQuery({
    queryKey: ["analysis", jobId],
    queryFn: async (): Promise<AnalysisResponse> => {
      try {
        const url = API_ROUTES.ANALYSIS.GET_ANALYSIS.replace(':jobId', jobId.toString());
        const response = await apiRequest("GET", url);
        const data = await response.json() as ApiResponse<AnalysisResponse>;
        
        if (isApiSuccess(data)) {
          return data.data;
        }
        throw new Error("Invalid response format");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch analysis results";
        toast({
          title: "Error Loading Analysis",
          description: message,
          variant: "destructive",
        });
        throw new Error(message);
      }
    },
    enabled: !!jobId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });
}

// Custom hook for fetching specific analysis result by resume
export function useAnalysisResultByResume(jobId: number, resumeId: number) {
  const { toast } = useToast();

  return useQuery({
    queryKey: ["analysis", jobId, resumeId],
    queryFn: async (): Promise<AnalysisResult> => {
      try {
        const url = API_ROUTES.ANALYSIS.GET_ANALYSIS_BY_RESUME
          .replace(':jobId', jobId.toString())
          .replace(':resumeId', resumeId.toString());
        const response = await apiRequest("GET", url);
        const data = await response.json() as ApiResponse<AnalysisResult>;
        
        if (isApiSuccess(data)) {
          return data.data;
        }
        throw new Error("Invalid response format");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch analysis result";
        toast({
          title: "Error Loading Analysis Result",
          description: message,
          variant: "destructive",
        });
        throw new Error(message);
      }
    },
    enabled: !!jobId && !!resumeId,
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: 2,
  });
}

// Utility functions for analysis results
export const getMatchScoreColor = (score: number): string => {
  if (score >= 90) return "text-green-600 bg-green-50 border-green-200";
  if (score >= 80) return "text-blue-600 bg-blue-50 border-blue-200";
  if (score >= 70) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  if (score >= 60) return "text-orange-600 bg-orange-50 border-orange-200";
  return "text-red-600 bg-red-50 border-red-200";
};

export const getMatchScoreLabel = (score: number): string => {
  if (score >= 90) return "Excellent Match";
  if (score >= 80) return "Very Good Match";
  if (score >= 70) return "Good Match";
  if (score >= 60) return "Fair Match";
  return "Poor Match";
};

export const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 95) return "text-green-700";
  if (confidence >= 85) return "text-blue-700";
  if (confidence >= 75) return "text-yellow-700";
  return "text-orange-700";
};

export const getConfidenceLabel = (confidence: number): string => {
  if (confidence >= 95) return "Very High";
  if (confidence >= 85) return "High";
  if (confidence >= 75) return "Medium";
  if (confidence >= 60) return "Low";
  return "Very Low";
};

// Sort analysis results by match percentage
export const sortAnalysisResults = (results: AnalysisResult[], sortBy: string = "score"): AnalysisResult[] => {
  const sorted = [...results];
  
  switch (sortBy) {
    case "score":
      return sorted.sort((a, b) => b.matchPercentage - a.matchPercentage);
    case "confidence":
      return sorted.sort((a, b) => b.confidenceScore - a.confidenceScore);
    case "name":
      return sorted.sort((a, b) => a.candidateName.localeCompare(b.candidateName));
    case "date":
      return sorted.sort((a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime());
    default:
      return sorted;
  }
};

// Filter analysis results
export const filterAnalysisResults = (results: AnalysisResult[], filters: {
  minScore?: number;
  maxScore?: number;
  requiredSkills?: string[];
  searchTerm?: string;
}): AnalysisResult[] => {
  return results.filter(result => {
    // Filter by score range
    if (filters.minScore !== undefined && result.matchPercentage < filters.minScore) {
      return false;
    }
    if (filters.maxScore !== undefined && result.matchPercentage > filters.maxScore) {
      return false;
    }
    
    // Filter by required skills
    if (filters.requiredSkills && filters.requiredSkills.length > 0) {
      const hasAllRequiredSkills = filters.requiredSkills.every(skill =>
        result.matchedSkills.some((matchedSkill: any) => 
          matchedSkill.toLowerCase().includes(skill.toLowerCase())
        )
      );
      if (!hasAllRequiredSkills) return false;
    }
    
    // Filter by search term
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      const matchesSearch = 
        result.candidateName.toLowerCase().includes(searchLower) ||
        result.filename.toLowerCase().includes(searchLower) ||
        result.matchedSkills.some((skill: any) => skill.toLowerCase().includes(searchLower)) ||
        result.candidateStrengths.some((strength: any) => strength.toLowerCase().includes(searchLower));
      
      if (!matchesSearch) return false;
    }
    
    return true;
  });
};

// Calculate analysis statistics
export const calculateAnalysisStats = (results: AnalysisResult[]) => {
  if (results.length === 0) {
    return {
      totalCandidates: 0,
      averageScore: 0,
      topScore: 0,
      averageConfidence: 0,
      scoreDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 }
    };
  }

  const totalCandidates = results.length;
  const averageScore = Math.round(results.reduce((sum, r) => sum + r.matchPercentage, 0) / totalCandidates);
  const topScore = Math.max(...results.map(r => r.matchPercentage));
  const averageConfidence = Math.round(results.reduce((sum, r) => sum + r.confidenceScore, 0) / totalCandidates);
  
  const scoreDistribution = {
    excellent: results.filter(r => r.matchPercentage >= 90).length,
    good: results.filter(r => r.matchPercentage >= 70 && r.matchPercentage < 90).length,
    fair: results.filter(r => r.matchPercentage >= 50 && r.matchPercentage < 70).length,
    poor: results.filter(r => r.matchPercentage < 50).length
  };

  return {
    totalCandidates,
    averageScore,
    topScore,
    averageConfidence,
    scoreDistribution
  };
};

// Extract common skills from analysis results
export const getCommonSkills = (results: AnalysisResult[]): { skill: string; count: number; percentage: number }[] => {
  const skillCount = new Map<string, number>();
  const totalCandidates = results.length;

  results.forEach(result => {
    result.matchedSkills.forEach((skill: any) => {
      skillCount.set(skill, (skillCount.get(skill) || 0) + 1);
    });
  });

  return Array.from(skillCount.entries())
    .map(([skill, count]) => ({
      skill,
      count,
      percentage: Math.round((count / totalCandidates) * 100)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10 most common skills
};

// Format analysis date
export const formatAnalysisDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};