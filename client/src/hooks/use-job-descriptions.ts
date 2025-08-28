import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  API_ROUTES, 
  buildJobRoute,
  JobListResponse, 
  JobDetailsResponse,
  JobCreateResponse,
  JobCreateRequest,
  JobItem,
  ApiResponse,
  isApiSuccess
} from "@shared/api-contracts";

// Custom hook for fetching job descriptions list
export function useJobDescriptions() {
  const { toast } = useToast();

  return useQuery({
    queryKey: ["job-descriptions"],
    queryFn: async (): Promise<JobListResponse> => {
      try {
        const response = await apiRequest("GET", API_ROUTES.JOBS.LIST);
        const data = await response.json() as ApiResponse<JobListResponse>;
        
        if (isApiSuccess(data)) {
          return data.data;
        }
        throw new Error("Invalid response format");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch job descriptions";
        toast({
          title: "Error Loading Job Descriptions",
          description: message,
          variant: "destructive",
        });
        throw new Error(message);
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

// Custom hook for fetching specific job description details
export function useJobDescription(jobId: number) {
  const { toast } = useToast();

  return useQuery({
    queryKey: ["job-description", jobId],
    queryFn: async (): Promise<JobDetailsResponse> => {
      try {
        const url = buildJobRoute(jobId as any);
        const response = await apiRequest("GET", url);
        const data = await response.json() as ApiResponse<JobDetailsResponse>;
        
        if (isApiSuccess(data)) {
          return data.data;
        }
        throw new Error("Invalid response format");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch job description details";
        toast({
          title: "Error Loading Job Description",
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

// Custom hook for creating job descriptions
export function useCreateJobDescription() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (jobData: JobCreateRequest): Promise<JobCreateResponse> => {
      try {
        const response = await apiRequest("POST", API_ROUTES.JOBS.CREATE, jobData);
        const data = await response.json() as ApiResponse<JobCreateResponse>;
        
        if (isApiSuccess(data)) {
          return data.data;
        }
        throw new Error("Invalid response format");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create job description";
        throw new Error(message);
      }
    },
    onSuccess: (data) => {
      // Invalidate and refetch job descriptions list
      queryClient.invalidateQueries({ queryKey: ["job-descriptions"] });
      
      toast({
        title: "Job Description Created Successfully",
        description: `"${data.jobDescription.title}" has been created and analyzed.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Creation Failed",
        description: error instanceof Error ? error.message : "Failed to create job description",
        variant: "destructive",
      });
    },
  });
}

// Custom hook for updating job descriptions
export function useUpdateJobDescription() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { jobId: number; jobData: JobCreateRequest }): Promise<JobItem> => {
      try {
        const url = buildJobRoute(params.jobId as any);
        const response = await apiRequest("PUT", url, params.jobData);
        const data = await response.json() as ApiResponse<JobItem>;
        
        if (isApiSuccess(data)) {
          return data.data;
        }
        throw new Error("Invalid response format");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update job description";
        throw new Error(message);
      }
    },
    onSuccess: (data) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["job-descriptions"] });
      queryClient.invalidateQueries({ queryKey: ["job-description", data.id] });
      
      toast({
        title: "Job Description Updated",
        description: `"${data.title}" has been updated successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update job description",
        variant: "destructive",
      });
    },
  });
}

// Custom hook for deleting job descriptions
export function useDeleteJobDescription() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (jobId: number): Promise<void> => {
      const url = buildJobRoute(jobId as any);
      await apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-descriptions"] });
      toast({
        title: "Job Description Deleted",
        description: "Job description has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete Failed", 
        description: error instanceof Error ? error.message : "Failed to delete job description",
        variant: "destructive",
      });
    },
  });
}

// Utility functions for job descriptions
export const getJobStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case "active":
      return "text-green-600 bg-green-50";
    case "draft":
      return "text-yellow-600 bg-yellow-50";
    case "archived":
      return "text-gray-600 bg-gray-50";
    default:
      return "text-blue-600 bg-blue-50";
  }
};

export const getJobStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case "active":
      return "check-circle";
    case "draft":
      return "edit";
    case "archived":
      return "archive";
    default:
      return "briefcase";
  }
};

export const formatExperienceLevel = (experience: string) => {
  if (!experience) return "Not specified";
  
  // Clean up experience string
  return experience
    .replace(/(\d+)\+?\s*years?/gi, '$1+ years')
    .replace(/senior/gi, 'Senior')
    .replace(/junior/gi, 'Junior')
    .replace(/mid-?level/gi, 'Mid-Level')
    .replace(/entry-?level/gi, 'Entry Level');
};

export const extractSkillsFromRequirements = (requirements: string[]): string[] => {
  const skillKeywords = [
    'React', 'Vue', 'Angular', 'JavaScript', 'TypeScript', 'Node.js', 'Python', 
    'Java', 'C#', 'PHP', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin',
    'HTML', 'CSS', 'SCSS', 'Sass', 'Tailwind', 'Bootstrap',
    'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Elasticsearch',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Git',
    'REST API', 'GraphQL', 'Microservices', 'Agile', 'Scrum'
  ];

  const extractedSkills = new Set<string>();
  const requirementsText = requirements.join(' ').toLowerCase();

  skillKeywords.forEach(skill => {
    if (requirementsText.includes(skill.toLowerCase())) {
      extractedSkills.add(skill);
    }
  });

  return Array.from(extractedSkills);
};