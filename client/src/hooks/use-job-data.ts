import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { JobId } from "@shared/api-contracts";

// Job data interface
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

interface UseJobDataOptions {
  jobId: JobId;
  isValidJobId: boolean;
}

export function useJobData({ jobId, isValidJobId }: UseJobDataOptions) {
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
    enabled: Boolean(isValidJobId && jobId),
    retry: 1
  });

  const shouldShowJobError = isJobError || !jobData;

  return {
    jobData,
    isJobLoading,
    jobError,
    isJobError,
    shouldShowJobError
  };
}