import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  API_ROUTES, 
  buildResumeRoute,
  ResumeListResponse, 
  ResumeDetailsResponse,
  ResumeUploadResponse,
  ResumeListQuery,
  ResumeUploadRequest,
  ApiResponse,
  isApiSuccess
} from "@shared/api-contracts";

// Custom hook for fetching resume list
export function useResumes(query: ResumeListQuery = {}) {
  const { toast } = useToast();

  return useQuery({
    queryKey: ["resumes", query],
    queryFn: async (): Promise<ResumeListResponse> => {
      try {
        // Build query parameters
        const searchParams = new URLSearchParams();
        if (query.page) searchParams.append('page', query.page.toString());
        if (query.limit) searchParams.append('limit', query.limit.toString());
        if (query.fileType) searchParams.append('fileType', query.fileType);
        if (query.hasAnalysis !== undefined) searchParams.append('hasAnalysis', query.hasAnalysis.toString());
        if (query.sessionId) searchParams.append('sessionId', query.sessionId);
        if (query.batchId) searchParams.append('batchId', query.batchId);

        const url = `${API_ROUTES.RESUMES.LIST}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
        
        const response = await apiRequest("GET", url);
        const data = await response.json() as ApiResponse<ResumeListResponse>;
        
        if (isApiSuccess(data)) {
          return data.data;
        }
        throw new Error("Invalid response format");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch resumes";
        toast({
          title: "Error Loading Resumes",
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

// Custom hook for fetching specific resume details
export function useResumeDetails(resumeId: number) {
  const { toast } = useToast();

  return useQuery({
    queryKey: ["resume", resumeId],
    queryFn: async (): Promise<ResumeDetailsResponse> => {
      try {
        const url = buildResumeRoute(resumeId as any);
        const response = await apiRequest("GET", url);
        const data = await response.json() as ApiResponse<ResumeDetailsResponse>;
        
        if (isApiSuccess(data)) {
          return data.data;
        }
        throw new Error("Invalid response format");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch resume details";
        toast({
          title: "Error Loading Resume",
          description: message,
          variant: "destructive",
        });
        throw new Error(message);
      }
    },
    enabled: !!resumeId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });
}

// Custom hook for uploading resumes
export function useResumeUpload() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (uploadData: ResumeUploadRequest): Promise<ResumeUploadResponse> => {
      try {
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('file', uploadData.file as File);
        if (uploadData.sessionId) {
          formData.append('sessionId', uploadData.sessionId);
        }
        if (uploadData.batchId) {
          formData.append('batchId', uploadData.batchId);
        }
        if (uploadData.autoAnalyze !== undefined) {
          formData.append('autoAnalyze', uploadData.autoAnalyze.toString());
        }

        // Use fetch directly for file upload (don't use apiRequest for FormData)
        const response = await fetch(API_ROUTES.RESUMES.UPLOAD, {
          method: 'POST',
          body: formData,
          credentials: 'include',
          // Don't set Content-Type header - let browser set it with boundary for FormData
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upload failed: ${response.status} ${errorText}`);
        }

        const data = await response.json() as ApiResponse<ResumeUploadResponse>;
        
        if (isApiSuccess(data)) {
          return data.data;
        }
        throw new Error("Invalid response format");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to upload resume";
        throw new Error(message);
      }
    },
    onSuccess: (data) => {
      // Invalidate and refetch resume list
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      
      toast({
        title: "Resume Uploaded Successfully",
        description: `${data.filename} has been uploaded and is being processed.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload resume",
        variant: "destructive",
      });
    },
  });
}

// Custom hook for delete resume (if needed in future)
export function useResumeDelete() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (resumeId: number): Promise<void> => {
      const url = buildResumeRoute(resumeId as any);
      await apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      toast({
        title: "Resume Deleted",
        description: "Resume has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete Failed", 
        description: error instanceof Error ? error.message : "Failed to delete resume",
        variant: "destructive",
      });
    },
  });
}

// Utility functions for resume status and file types
export const getResumeStatusColor = (status: string) => {
  switch (status) {
    case "analyzed":
      return "text-green-600 bg-green-50";
    case "processing":
      return "text-yellow-600 bg-yellow-50";
    case "error":
      return "text-red-600 bg-red-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
};

export const getResumeStatusIcon = (status: string) => {
  switch (status) {
    case "analyzed":
      return "check-circle";
    case "processing":
      return "clock";
    case "error":
      return "exclamation-circle";
    default:
      return "file";
  }
};