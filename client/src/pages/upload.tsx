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
  
  // Utility function to check if a batch ID has associated resumes
  const checkBatchHasResumes = useCallback(async (batchId: string, sessionId: SessionId): Promise<boolean> => {
    try {
      console.log(`[BATCH VALIDATION] Checking if batch ${batchId} has resumes...`);
      const response = await apiRequest("GET", `/api/resumes?sessionId=${sessionId}&batchId=${batchId}`);
      const data = await response.json() as ApiResult<ResumeListResponse>;
      
      if (isApiSuccess(data) && isResumeListResponse(data.data)) {
        const resumeCount = data.data.resumes?.length || 0;
        console.log(`[BATCH VALIDATION] ✅ Batch ${batchId} has ${resumeCount} resumes`);
        return resumeCount > 0;
      }
      
      console.log(`[BATCH VALIDATION] ❌ Invalid response format for batch ${batchId}`);
      return false;
    } catch (error) {
      console.log(`[BATCH VALIDATION] ❌ Error checking batch ${batchId}:`, error);
      return false;
    }
  }, []);

  // Enhanced batch validation with retry logic
  const validateBatchIntegrity = useCallback(async (batchId: string, sessionId: SessionId, retries = 2): Promise<{ isValid: boolean; resumeCount: number; error?: string }> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[BATCH INTEGRITY] Attempt ${attempt}/${retries} - Validating batch ${batchId}...`);
        
        const response = await apiRequest("GET", `/api/resumes?sessionId=${sessionId}&batchId=${batchId}`);
        const data = await response.json() as ApiResult<ResumeListResponse>;
        
        if (isApiSuccess(data) && isResumeListResponse(data.data)) {
          const resumeCount = data.data.resumes?.length || 0;
          console.log(`[BATCH INTEGRITY] ✅ Batch ${batchId} validated - ${resumeCount} resumes found`);
          return { isValid: true, resumeCount };
        }
        
        if (attempt === retries) {
          const error = `Invalid response format: ${data.message || 'Unknown error'}`;
          console.log(`[BATCH INTEGRITY] ❌ Final attempt failed for batch ${batchId}: ${error}`);
          return { isValid: false, resumeCount: 0, error };
        }
        
        console.log(`[BATCH INTEGRITY] ⚠️ Attempt ${attempt} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        
      } catch (error) {
        if (attempt === retries) {
          const errorMsg = error instanceof Error ? error.message : 'Network error';
          console.log(`[BATCH INTEGRITY] ❌ Final attempt failed for batch ${batchId}: ${errorMsg}`);
          return { isValid: false, resumeCount: 0, error: errorMsg };
        }
        
        console.log(`[BATCH INTEGRITY] ⚠️ Attempt ${attempt} failed with error, retrying...`, error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return { isValid: false, resumeCount: 0, error: 'Max retries exceeded' };
  }, []);

  // Get or create a session ID when the component mounts
  useEffect(() => {
    const initializeSession = async () => {
      console.log(`[SESSION INIT] Starting session initialization...`);
      
      // Check if we already have a session ID in localStorage
      const existingSessionId = localStorage.getItem('currentUploadSession');
      const existingBatchId = localStorage.getItem('currentBatchId');
      
      console.log(`[SESSION INIT] Found existing sessionId: ${existingSessionId || 'none'}, batchId: ${existingBatchId || 'none'}`);
      
      if (existingSessionId) {
        // Use existing session ID
        setSessionId(existingSessionId as SessionId);
        console.log(`[SESSION INIT] Using existing upload session: ${existingSessionId}`);
        
        // Check if existing batch ID has resumes before creating a new one
        if (existingBatchId) {
          console.log(`[SESSION INIT] Checking if existing batch ${existingBatchId} has resumes...`);
          const batchHasResumes = await checkBatchHasResumes(existingBatchId, existingSessionId as SessionId);
          
          if (batchHasResumes) {
            // Keep existing batch ID since it has resumes
            setCurrentBatchId(existingBatchId);
            console.log(`[SESSION INIT] ✅ Preserving existing batch ${existingBatchId} (has resumes)`);
          } else {
            // Create new batch ID since existing one has no resumes
            const newBatchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            setCurrentBatchId(newBatchId);
            localStorage.setItem('currentBatchId', newBatchId);
            console.log(`[SESSION INIT] ✅ Created new batch ${newBatchId} (previous batch ${existingBatchId} had no resumes)`);
          }
        } else {
          // No existing batch ID, create a new one
          const newBatchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          setCurrentBatchId(newBatchId);
          localStorage.setItem('currentBatchId', newBatchId);
          console.log(`[SESSION INIT] ✅ Created new batch ${newBatchId} (no previous batch)`);
        }
      } else {
        // Generate a new random session ID if none exists
        console.log(`[SESSION INIT] Creating new session...`);
        createNewSession();
      }
    };
    
    initializeSession().catch(error => {
      console.error(`[SESSION INIT] Error during session initialization:`, error);
      // Fallback to creating new session
      createNewSession();
    });
  }, [createNewSession, checkBatchHasResumes]);
  
  // Fetch existing resumes for current session and batch
  const { data: existingResumes, isLoading, error: resumeLoadError } = useQuery<ResumeListResponse>({
    queryKey: ["/api/resumes", sessionId, currentBatchId],
    queryFn: async ({ queryKey }): Promise<ResumeListResponse> => {
      const endpoint = queryKey[0] as string;
      const currentSessionId = queryKey[1] as SessionId;
      const currentBatch = queryKey[2] as string;
      
      console.log(`[RESUMES FETCH] Fetching resumes for session: ${currentSessionId}, batch: ${currentBatch}`);
      
      const params = new URLSearchParams();
      if (currentSessionId) params.append('sessionId', currentSessionId);
      if (currentBatch) params.append('batchId', currentBatch);
      
      const url = `${endpoint}?${params.toString()}`;
      const response = await apiRequest("GET", url);
      const data = await response.json() as ApiResult<ResumeListResponse>;
      
      if (isApiSuccess(data)) {
        if (isResumeListResponse(data.data)) {
          console.log(`[RESUMES FETCH] ✅ Found ${data.data.resumes?.length || 0} resumes for batch ${currentBatch}`);
          return data.data;
        }
        throw new Error('Invalid resume list response format');
      }
      throw new Error(data.message || 'Failed to fetch resumes');
    },
    enabled: !!sessionId && !!currentBatchId, // Only enable when both sessionId and batchId are available
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // Add existing resumes to files list when data is loaded
  useEffect(() => {
    if (existingResumes?.resumes && currentBatchId) {
      console.log(`[FILES SYNC] Syncing ${existingResumes.resumes.length} existing resumes for batch ${currentBatchId}`);
      
      const existingFiles: UploadedFile[] = existingResumes.resumes.map(resume => ({
        id: resume.id,
        name: resume.filename,
        size: resume.fileSize,
        type: resume.fileType,
        status: "success" as const,
        uploadedAt: resume.uploadedAt,
      }));
      
      // Only update files if they're different (to avoid infinite re-renders)
      setFiles(prev => {
        if (prev.length === existingFiles.length && 
            prev.every((file, index) => file.id === existingFiles[index]?.id)) {
          return prev; // No change needed
        }
        console.log(`[FILES SYNC] ✅ Updated files list with ${existingFiles.length} files`);
        return existingFiles;
      });
    } else if (existingResumes?.resumes?.length === 0 && currentBatchId) {
      console.log(`[FILES SYNC] No existing resumes found for batch ${currentBatchId}, clearing files list`);
      setFiles([]);
    }
  }, [existingResumes, currentBatchId]);

  // Ensure localStorage stays in sync with React state
  useEffect(() => {
    if (sessionId) {
      const storedSessionId = localStorage.getItem('currentUploadSession');
      if (storedSessionId !== sessionId) {
        console.log(`[STATE SYNC] Syncing sessionId to localStorage: ${sessionId}`);
        localStorage.setItem('currentUploadSession', sessionId);
      }
    }
    
    if (currentBatchId) {
      const storedBatchId = localStorage.getItem('currentBatchId');
      if (storedBatchId !== currentBatchId) {
        console.log(`[STATE SYNC] Syncing batchId to localStorage: ${currentBatchId}`);
        localStorage.setItem('currentBatchId', currentBatchId);
      }
    }
  }, [sessionId, currentBatchId]);

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
        console.log(`[UPLOAD] Uploading ${file.name} with batch ID: ${currentBatchId}`);
      } else {
        console.log(`[UPLOAD] ⚠️ Uploading ${file.name} without batch ID!`);
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
      console.log(`[UPLOAD SUCCESS] File ${variables.name} uploaded successfully:`, { 
        data, 
        currentBatchId,
        sessionId 
      });
      
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
      
      // Ensure localStorage is in sync with current state
      if (currentBatchId) {
        localStorage.setItem('currentBatchId', currentBatchId);
        console.log(`[UPLOAD SUCCESS] Confirmed batch ID in localStorage: ${currentBatchId}`);
      }
    },
    onError: (error, variables) => {
      console.log(`[UPLOAD ERROR] File ${variables.name} upload failed:`, { 
        error, 
        currentBatchId,
        sessionId 
      });
      
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
    
    console.log(`[FILE SELECTION] Starting file selection with batch: ${currentBatchId || 'none'}`);
    
    // Ensure we have a current batch ID for uploads
    if (!currentBatchId) {
      console.log(`[FILE SELECTION] ❌ No current batch ID available, creating new batch...`);
      const newBatchId = createNewBatch();
      console.log(`[FILE SELECTION] ✅ Created new batch for file selection: ${newBatchId}`);
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
    
    console.log(`[FILE SELECTION] Processing ${selectedFiles.length} files with batch: ${currentBatchId}`);
    
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
      
      console.log(`[FILE SELECTION] Adding file ${file.name} to upload queue`);
      
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

  // Go to next step with batch validation
  const handleContinue = async () => {
    console.log(`[CONTINUE] Starting continuation process...`);
    
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
    
    // Validate batch integrity before continuing
    if (currentBatchId && sessionId) {
      console.log(`[CONTINUE] Validating batch integrity for ${currentBatchId}...`);
      
      const validation = await validateBatchIntegrity(currentBatchId, sessionId);
      
      if (!validation.isValid) {
        console.log(`[CONTINUE] ❌ Batch validation failed:`, validation.error);
        toast({
          title: "Batch validation failed",
          description: `Unable to validate upload batch. ${validation.error || 'Please try refreshing the page.'}`,
          variant: "destructive",
        });
        return;
      }
      
      if (validation.resumeCount !== files.filter(f => f.status === "success").length) {
        console.log(`[CONTINUE] ⚠️ Resume count mismatch - UI: ${files.filter(f => f.status === "success").length}, Server: ${validation.resumeCount}`);
        toast({
          title: "Resume count mismatch",
          description: "The number of uploaded resumes doesn't match our records. Please refresh and try again.",
          variant: "destructive",
        });
        return;
      }
      
      console.log(`[CONTINUE] ✅ Batch validation successful - ${validation.resumeCount} resumes validated`);
    }
    
    console.log(`[CONTINUE] Proceeding to job description page...`);
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
                <span><strong>Current Batch:</strong> {currentBatchId.slice(-8)} ({files.filter(f => f.status === "success").length} files) - All uploads in this session will be analyzed together. Use "Reset Session" to start a new batch.</span>
              </p>
            </div>
          )}
          
          {!currentBatchId && (
            <div className="mb-6 p-3 border border-amber-200 bg-amber-50 rounded-md text-sm text-amber-800">
              <p className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <span><strong>Initializing batch...</strong> Please wait while we set up your upload session.</span>
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
                  console.log(`[RESET SESSION] User initiated session reset`);
                  console.log(`[RESET SESSION] Current state - sessionId: ${sessionId}, batchId: ${currentBatchId}`);
                  
                  createNewSession();
                  setFiles([]);
                  
                  // Invalidate queries to refresh data
                  queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
                  
                  console.log(`[RESET SESSION] ✅ Session reset complete`);
                  
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
