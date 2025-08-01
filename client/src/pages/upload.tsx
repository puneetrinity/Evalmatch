import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { authService } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import StepProgress from "@/components/step-progress";
import { useSteps } from "@/hooks/use-steps";
import { Button } from "@/components/ui/button";
import { formatFileSize, getFileIcon, isFileAllowed, isFileSizeValid } from "@/lib/file-utils";
import type { 
  ResumeId, 
  SessionId, 
  ResumeListResponse, 
  ResumeDetailsResponse,
  ApiResult
} from "@shared/api-contracts";
import { isApiSuccess } from "@shared/api-contracts";
import { isResumeListResponse } from "@shared/type-guards";

// Enhanced type definitions
type FileUploadStatus = "uploading" | "success" | "error" | "pending";

interface UploadedFile {
  id?: ResumeId;
  file?: File;
  name: string;
  size: number;
  type: string;
  status: FileUploadStatus;
  progress?: number;
  error?: string;
  hash?: string;
  uploadedAt?: string;
}

interface UploadResponse {
  id: ResumeId;
  filename: string;
  fileSize: number;
  fileType: string;
  message: string;
  processingTime?: number;
}

interface UploadError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export default function UploadPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const { steps } = useSteps(["Resume Upload", "Job Description", "Bias Detection", "Fit Analysis", "Interview Prep"], 0);
  // This is the first step (Resume Upload)
  
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Track the current upload session
  const [sessionId, setSessionId] = useState<SessionId | null>(null);
  
  // Track the current batch ID for this upload operation
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  
  // Generate a new random session ID
  const createNewSession = useCallback((): SessionId => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}` as SessionId;
    setSessionId(newSessionId);
    console.log(`Created new upload session: ${newSessionId}`);
    localStorage.setItem('currentUploadSession', newSessionId);
    
    // Create new batch ID for this session
    const newBatchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setCurrentBatchId(newBatchId);
    localStorage.setItem('currentBatchId', newBatchId);
    console.log(`Created new batch: ${newBatchId}`);
    
    return newSessionId;
  }, []);
  
  // Get or create a session ID when the component mounts
  useEffect(() => {
    // Check if we already have a session ID in localStorage
    const existingSessionId = localStorage.getItem('currentUploadSession');
    const existingBatchId = localStorage.getItem('currentBatchId');
    
    if (existingSessionId) {
      // Use existing session ID
      setSessionId(existingSessionId as SessionId);
      console.log(`Using existing upload session: ${existingSessionId}`);
      
      // Use existing batch ID or create new one
      if (existingBatchId) {
        setCurrentBatchId(existingBatchId);
        console.log(`Using existing batch: ${existingBatchId}`);
      } else {
        // Create new batch ID for existing session
        const newBatchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        setCurrentBatchId(newBatchId);
        localStorage.setItem('currentBatchId', newBatchId);
        console.log(`Created new batch for existing session: ${newBatchId}`);
      }
    } else {
      // Generate a new random session ID if none exists
      createNewSession();
    }
  }, [createNewSession]);
  
  // Fetch existing resumes for current session only
  const { data: existingResumes, isLoading, error: resumeLoadError } = useQuery<ResumeListResponse>({
    queryKey: ["/api/resumes", sessionId],
    queryFn: async ({ queryKey }): Promise<ResumeListResponse> => {
      const endpoint = queryKey[0] as string;
      const currentSessionId = queryKey[1] as SessionId;
      const response = await apiRequest("GET", `${endpoint}?sessionId=${currentSessionId}`);
      const data = await response.json() as ApiResult<ResumeListResponse>;
      
      if (isApiSuccess(data)) {
        if (isResumeListResponse(data.data)) {
          return data.data;
        }
        throw new Error('Invalid resume list response format');
      }
      throw new Error(data.message || 'Failed to fetch resumes');
    },
    enabled: !!sessionId, // Only enable the query when sessionId is available
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // Add existing resumes to files list when data is loaded
  useEffect(() => {
    if (existingResumes?.resumes && !files.length) {
      const existingFiles: UploadedFile[] = existingResumes.resumes.map(resume => ({
        id: resume.id,
        name: resume.filename,
        size: resume.fileSize,
        type: resume.fileType,
        status: "success" as const,
        uploadedAt: resume.uploadedAt,
      }));
      setFiles(existingFiles);
    }
  }, [existingResumes, files.length]);

  // Upload file mutation
  const uploadMutation = useMutation<UploadResponse, UploadError, File>({
    mutationFn: async (file: File): Promise<UploadResponse> => {
      // Validate file before upload
      if (!isFileAllowed(file)) {
        throw { message: 'File type not supported', code: 'INVALID_FILE_TYPE' };
      }
      
      if (!isFileSizeValid(file)) {
        throw { message: 'File size exceeds limit', code: 'FILE_TOO_LARGE' };
      }
      
      const formData = new FormData();
      formData.append("file", file);
      
      // Include the session ID in the upload
      if (sessionId) {
        formData.append("sessionId", sessionId);
      }
      
      // Include the current batch ID in the upload
      if (currentBatchId) {
        formData.append("batchId", currentBatchId);
      }
      
      // Get auth token and add it to headers manually for FormData requests
      const token = await authService.getAuthToken();
      
      const response = await fetch("/api/resumes", {
        method: "POST",
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: formData,
      });
      
      const responseData = await response.json() as ApiResult<UploadResponse>;
      
      console.log('Upload response:', {
        status: response.status,
        ok: response.ok,
        responseData,
        isSuccess: isApiSuccess(responseData)
      });
      
      // Check if the API response indicates success
      if (isApiSuccess(responseData)) {
        console.log('Upload successful, returning data:', responseData.data);
        return responseData.data;
      }
      
      // Handle API error response
      const error: UploadError = {
        message: responseData.message || "Upload failed",
        code: responseData.code,
        details: responseData.details,
      };
      throw error;
    },
    onSuccess: (data, variables) => {
      console.log('onSuccess called with:', { data, variables });
      
      // Update file list with server-assigned ID
      setFiles(prev => 
        prev.map(file => 
          file.name === variables.name 
            ? { ...file, id: data.id, status: "success" as const, progress: 100 } 
            : file
        )
      );
      
      toast({
        title: "Upload successful",
        description: `${variables.name} has been uploaded successfully.`,
      });
    },
    onError: (error, variables) => {
      console.log('onError called with:', { error, variables });
      
      // Update file status to error
      setFiles(prev => 
        prev.map(file => 
          file.name === variables.name 
            ? { ...file, status: "error" as const, error: error.message } 
            : file
        )
      );
      
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create a new batch for the next upload operation
  const createNewBatch = useCallback(() => {
    const newBatchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setCurrentBatchId(newBatchId);
    localStorage.setItem('currentBatchId', newBatchId);
    console.log(`Created new batch: ${newBatchId}`);
    return newBatchId;
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    
    // Use the current batch ID for all uploads in this session
    // Don't create a new batch ID here - it should only be created when starting a new session
    if (!currentBatchId) {
      const newBatchId = createNewBatch();
      console.log(`Created new batch for file selection: ${newBatchId}`);
    }
    
    // Check if adding these files would exceed the limit of 100
    if (files.length + selectedFiles.length > 100) {
      toast({
        title: "Maximum files exceeded",
        description: "You can only upload up to 100 resumes per session.",
        variant: "destructive",
      });
      return;
    }
    
    // Process each file
    Array.from(selectedFiles).forEach(file => {
      // Check if file is allowed
      if (!isFileAllowed(file)) {
        toast({
          title: "Invalid file type",
          description: "Only PDF, DOC, and DOCX files are allowed.",
          variant: "destructive",
        });
        return;
      }
      
      // Check file size
      if (!isFileSizeValid(file)) {
        toast({
          title: "File too large",
          description: "Maximum file size is 5MB.",
          variant: "destructive",
        });
        return;
      }
      
      // Add file to list
      const newFile: UploadedFile = {
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        status: "uploading",
        progress: 0,
      };
      
      setFiles(prev => [...prev, newFile]);
      
      // Upload file
      uploadMutation.mutate(file);
    });
  }, [files, toast, uploadMutation, currentBatchId, createNewBatch]);

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
    // Reset input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle file drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  // Handle drag events
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  // Handle file removal
  const handleRemoveFile = (fileName: string) => {
    setFiles(prev => prev.filter(file => file.name !== fileName));
  };

  // Go to next step
  const handleContinue = () => {
    // Check if at least one file was uploaded successfully
    const hasValidFiles = files.some(file => file.status === "success");
    
    if (!hasValidFiles) {
      toast({
        title: "No valid resumes",
        description: "Please upload at least one resume before continuing.",
        variant: "destructive",
      });
      return;
    }
    
    setLocation("/job-description");
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <StepProgress steps={steps} />
        
        <div className="mt-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Upload Resumes</h1>
          <p className="text-gray-600 mb-4">
            Upload up to 100 resumes in PDF, DOC, or DOCX format. We'll analyze them and compare with your job description to find the best matches.
          </p>
          
          {currentBatchId && (
            <div className="mb-6 p-3 border border-green-200 bg-green-50 rounded-md text-sm text-green-800">
              <p className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20,6 9,17 4,12"></polyline>
                </svg>
                <span><strong>Current Batch:</strong> {currentBatchId.slice(-8)} - All uploads in this session will be analyzed together. Use "Reset Session" to start a new batch.</span>
              </p>
            </div>
          )}
          
          {existingResumes && existingResumes.resumes.length > 0 && (
            <div className="mb-8 p-3 border border-blue-200 bg-blue-50 rounded-md text-sm text-blue-800">
              <p className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <span>Seeing previously uploaded resumes? Click the <strong>Reset Session</strong> button below to start fresh with a new session.</span>
              </p>
            </div>
          )}
          
          {/* File upload area */}
          <div 
            className={`drop-zone rounded-lg p-12 text-center cursor-pointer mb-6 ${isDragging ? 'active' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="text-primary mb-4">
              <i className="fas fa-file-upload text-5xl"></i>
            </div>
            <p className="text-lg font-medium text-gray-700 mb-2">Drag and drop your resumes here</p>
            <p className="text-sm text-gray-500 mb-4">or</p>
            <Button>Browse Files</Button>
            <p className="text-xs text-gray-500 mt-4">Supported formats: PDF, DOC, DOCX (Max 5 files, 5MB each)</p>
            <input 
              type="file" 
              className="hidden" 
              multiple 
              accept=".pdf,.doc,.docx" 
              ref={fileInputRef}
              onChange={handleFileInputChange}
            />
          </div>
          
          {/* Uploaded files */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Uploaded Resumes</h3>
              <Button 
                onClick={() => {
                  createNewSession();
                  setFiles([]);
                  queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
                  toast({
                    title: "Session Reset",
                    description: "You've started a new upload session with a fresh batch.",
                  });
                }}
                variant="outline"
                size="sm"
              >
                Reset Session
              </Button>
            </div>
            
            {/* Empty state */}
            {isLoading ? (
              <div className="py-8 text-center">
                <div className="animate-spin mb-4 mx-auto">
                  <i className="fas fa-spinner text-3xl text-primary"></i>
                </div>
                <p className="text-gray-500">Loading resumes...</p>
              </div>
            ) : files.length === 0 ? (
              <div>
                <p className="text-gray-500 text-center py-4">No resumes uploaded yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                    <div className="flex items-center">
                      <i className={`fas ${getFileIcon(file.type)} mr-3`}></i>
                      <div>
                        <p className="font-medium text-gray-900">{file.name}</p>
                        <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {file.status === "uploading" && (
                        <div className="text-sm text-gray-500 mr-2">Uploading...</div>
                      )}
                      {file.status === "error" && (
                        <div className="text-sm text-red-500 mr-2" title={file.error}>Error</div>
                      )}
                      <button 
                        className="text-gray-400 hover:text-gray-600" 
                        onClick={() => handleRemoveFile(file.name)}
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Processing status */}
            {uploadMutation.isPending && (
              <div className="mt-4 border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Analyzing resumes...</span>
                  <span className="text-xs text-gray-500">
                    {files.filter(f => f.status === "success").length}/{files.length} files
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full" 
                    style={{ 
                      width: `${(files.filter(f => f.status === "success").length / files.length) * 100}%` 
                    }}
                  ></div>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex justify-end">
            <Button 
              onClick={handleContinue}
              disabled={files.length === 0 || uploadMutation.isPending}
            >
              Continue to Job Description
            </Button>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
