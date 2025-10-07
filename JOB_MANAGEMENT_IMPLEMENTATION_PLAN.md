# Job Management System - Detailed Implementation Plan

## 🎯 Overview

Create a comprehensive job management flow where users can:
1. Upload resumes → Select existing or create new job → Analyze batch
2. View job details page with all analyzed resumes and match scores
3. Manage jobs with analytics and resume associations

---

## 📊 Current Architecture Analysis

### ✅ What Already Exists

1. **Backend Infrastructure**
   - `POST /api/analysis/analyze/:jobId` - Handles batch analysis with sessionId/batchId
   - `GET /api/analysis/analyze/:jobId` - Returns results + statistics
   - `GET /api/job-descriptions` - Lists user's jobs
   - `GET /api/job-descriptions/:id` - Gets specific job details
   - `POST /api/job-descriptions` - Creates new job with AI analysis
   - `PATCH /api/job-descriptions/:id` - Updates job
   - `DELETE /api/job-descriptions/:id` - Deletes job
   - `GET /api/analysis/my-analyses` - Returns all analyses with analytics

2. **Frontend Components**
   - `client/src/hooks/use-analysis.ts` - Auto-triggers analysis when jobId + sessionId + batchId present
   - `client/src/hooks/use-job-descriptions.ts` - CRUD operations for jobs
   - `client/src/pages/upload.tsx` - Resume upload with session/batch tracking
   - `client/src/pages/my-job-descriptions.tsx` - Job listing page
   - `client/src/pages/job-description.tsx` - Job creation page
   - `client/src/pages/analysis.tsx` - Analysis results page

3. **Type Definitions**
   - `shared/my-jobs-schemas.ts` - Comprehensive types (JobWithMetrics, JobPerformanceAnalytics, ResumeJobAssociation)
   - `shared/api-contracts.ts` - API response types
   - `shared/schema.ts` - Database schema types

### ❌ Critical Data Flow Issues (Must Fix First)

#### Issue 1: Job List Response Mismatch
**Location**: `client/src/pages/my-job-descriptions.tsx:106`
- **Current**: Expects `data.jobs`
- **Server Returns**: `{ data: { jobDescriptions: [...] } }`
- **Fix**: Use `data.data?.jobDescriptions`

#### Issue 2: Job Creation Response Type Mismatch
**Location**: `client/src/hooks/use-job-descriptions.ts:84-96`
- **Current**: Coerces to `JobCreateResponse`
- **Server Returns**: `{ data: { jobDescription: {...}, analysis: {...}, processingTime: number } }`
- **Fix**: Return actual shape, don't coerce types

#### Issue 3: Job Details Response Parsing
**Location**: `client/src/hooks/use-job-data.ts:36-42` (if exists)
- **Server Returns**: `{ data: { jobDescription: {...}, isAnalyzed: boolean } }`
- **Fix**: Use `data.data?.jobDescription`

#### Issue 4: Analytics Response Shape
**Location**: Various
- **Server Returns**: `{ analyses: [...] }` (NOT `{ data: { jobs: [...] } }`)
- **Fix**: Use `data.analyses` when fetching from `/api/analysis/my-analyses`

---

## 🔧 Implementation Phases

---

## **PHASE 1: Fix Existing Data Flow Issues** ⚠️ CRITICAL

These fixes unblock all subsequent work.

### 1.1 Fix Job List Response Parsing

**File**: `client/src/pages/my-job-descriptions.tsx`
**Line**: 100-114

```typescript
// BEFORE
const { data: jobDescriptions = mockJobDescriptions, isLoading, error, refetch } = useQuery({
  queryKey: ['/api/job-descriptions'],
  queryFn: async () => {
    try {
      const response = await apiRequest("GET", "/api/job-descriptions");
      const data = await response.json();
      return data.jobs || mockJobDescriptions; // ❌ WRONG KEY
    } catch (error) {
      console.warn('Failed to fetch job descriptions, using mock data:', error);
      return mockJobDescriptions;
    }
  },
  staleTime: 5 * 60 * 1000,
  retry: 1
});

// AFTER
const { data: jobDescriptions = mockJobDescriptions, isLoading, error, refetch } = useQuery({
  queryKey: ['/api/job-descriptions'],
  queryFn: async () => {
    try {
      const response = await apiRequest("GET", "/api/job-descriptions");
      const data = await response.json();
      // ✅ Server returns { data: { jobDescriptions: [...] } }
      return data.data?.jobDescriptions || mockJobDescriptions;
    } catch (error) {
      console.warn('Failed to fetch job descriptions, using mock data:', error);
      return mockJobDescriptions;
    }
  },
  staleTime: 5 * 60 * 1000,
  retry: 1
});
```

---

### 1.2 Fix Job Creation Response Type

**File**: `client/src/hooks/use-job-descriptions.ts`
**Line**: 84-96

```typescript
// BEFORE
export function useCreateJobDescription() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (jobData: JobCreateRequest): Promise<JobCreateResponse> => {
      try {
        const response = await apiRequest("POST", API_ROUTES.JOBS.CREATE, jobData);
        const data = await response.json() as ApiResponse<JobCreateResponse>;

        if (isApiSuccess(data)) {
          return data.data; // ❌ Type mismatch
        }
        throw new Error("Invalid response format");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create job description";
        throw new Error(message);
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["job-descriptions"] });
      toast({
        title: "Job Description Created Successfully",
        description: `"${data.title}" has been created and analyzed.`, // ❌ data.title doesn't exist
      });
    },
    // ... rest
  });
}

// AFTER
// Define proper response type
interface JobCreationResult {
  jobDescription: {
    id: number;
    title: string;
    description: string;
    skills?: string[];
    requirements?: string[];
    experience?: string;
    analyzedData?: any;
    createdAt: string;
  };
  analysis?: {
    skillsExtracted: number;
    requirementsFound: number;
    experienceLevel: string;
  };
  processingTime: number;
}

export function useCreateJobDescription() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (jobData: JobCreateRequest): Promise<JobCreationResult> => {
      try {
        const response = await apiRequest("POST", API_ROUTES.JOBS.CREATE, jobData);
        const data = await response.json();

        if (isApiSuccess(data)) {
          // ✅ Return actual server shape: { jobDescription, analysis, processingTime }
          return data.data as JobCreationResult;
        }
        throw new Error("Invalid response format");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create job description";
        throw new Error(message);
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["job-descriptions"] });
      toast({
        title: "Job Description Created Successfully",
        description: `"${data.jobDescription.title}" has been created and analyzed.`, // ✅ Correct path
      });
    },
    // ... rest
  });
}
```

---

### 1.3 Fix Job Description Page Handler

**File**: `client/src/pages/job-description.tsx`
**Line**: 31-46

**Current code is already correct!** It uses `jobData.jobDescription?.id` which will work once the hook fix above is applied.

```typescript
// ✅ Already correct - no changes needed
const handleJobCreated = (jobData: any) => {
  const jobId = jobData.jobDescription?.id;
  console.log('Job created with ID:', jobId);

  if (jobId) {
    setLocation(`/bias-detection/${jobId}`);
  } else {
    console.error('Job ID not found in response:', jobData);
    toast({
      title: "Navigation error",
      description: "Job created but couldn't navigate to next step. Please try again.",
      variant: "destructive",
    });
  }
};
```

---

## **PHASE 2: Job Selection Page** 🆕

Create a new page where users select an existing job or create a new one after uploading resumes.

### 2.1 Create Job Selection Page

**File**: `client/src/pages/job-selection.tsx` (NEW FILE)

**Features**:
- Accept `?sessionId=...&batchId=...` from URL
- Display existing jobs with analytics
- "Select Job" → Trigger batch analysis
- "Create New Job" → Preserve context

**Full Implementation**:

```typescript
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Briefcase,
  FileText,
  TrendingUp,
  Search,
  Loader2,
  ChevronRight
} from "lucide-react";

interface JobWithAnalytics {
  id: number;
  title: string;
  description: string;
  requirements?: string[];
  skills?: string[];
  createdAt: string;
  resumeCount?: number;
  averageScore?: number;
}

export default function JobSelectionPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");

  // Parse URL params using URLSearchParams (Wouter pattern)
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('sessionId');
  const batchId = params.get('batchId');

  // Fetch uploaded resumes count
  const { data: resumesData } = useQuery({
    queryKey: ['/api/resumes', sessionId, batchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sessionId) params.append('sessionId', sessionId);
      if (batchId) params.append('batchId', batchId);

      const response = await apiRequest("GET", `/api/resumes?${params.toString()}`);
      const data = await response.json();
      return data.data?.resumes || [];
    },
    enabled: !!(sessionId && batchId)
  });

  // Fetch job descriptions
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['/api/job-descriptions'],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/job-descriptions");
      const data = await response.json();
      return data.data?.jobDescriptions || [];
    }
  });

  // Fetch analytics data
  const { data: analyticsData } = useQuery({
    queryKey: ['/api/analysis/my-analyses'],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/analysis/my-analyses");
      const data = await response.json();
      // ✅ Server returns { analyses: [...] }
      return data.analyses || [];
    }
  });

  // Merge jobs with analytics
  const jobsWithAnalytics: JobWithAnalytics[] = (jobsData || []).map((job: any) => {
    const analytics = analyticsData?.find((a: any) => a.jobId === job.id);
    return {
      ...job,
      resumeCount: analytics?.resumeCount || 0,
      averageScore: analytics?.averageScore || null
    };
  });

  // Filter jobs by search
  const filteredJobs = jobsWithAnalytics.filter(job =>
    job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Mutation for triggering batch analysis
  const analyzeJobMutation = useMutation({
    mutationFn: async (jobId: number) => {
      const response = await apiRequest("POST", `/api/analysis/analyze/${jobId}`, {
        sessionId,
        batchId
      });
      return await response.json();
    },
    onSuccess: (_, jobId) => {
      setLocation(`/analysis/${jobId}?sessionId=${sessionId}&batchId=${batchId}`);
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to start analysis",
        variant: "destructive"
      });
    }
  });

  const handleSelectJob = (jobId: number) => {
    analyzeJobMutation.mutate(jobId);
  };

  const handleCreateNew = () => {
    setLocation(`/job-description?sessionId=${sessionId}&batchId=${batchId}`);
  };

  const uploadedCount = resumesData?.length || 0;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Select or Create Job Description
          </h1>
          <p className="text-gray-600">
            You uploaded <span className="font-semibold text-blue-600">{uploadedCount} resume(s)</span>.
            Choose a job description to analyze them against, or create a new one.
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search job descriptions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Create New Button (Prominent) */}
        <div className="mb-6">
          <Button
            onClick={handleCreateNew}
            size="lg"
            className="w-full sm:w-auto"
          >
            <Plus className="h-5 w-5 mr-2" />
            Create New Job Description
          </Button>
        </div>

        {/* Existing Jobs List */}
        {jobsLoading ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-500">Loading your job descriptions...</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Briefcase className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? "No matching job descriptions" : "No job descriptions yet"}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchTerm
                ? "Try adjusting your search term."
                : "Create your first job description to analyze your uploaded resumes."
              }
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Select from {filteredJobs.length} job description{filteredJobs.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredJobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow cursor-pointer group"
                  onClick={() => handleSelectJob(job.id)}
                >
                  {/* Job Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                        {job.title}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Briefcase className="h-5 w-5 text-gray-400 flex-shrink-0 ml-2" />
                  </div>

                  {/* Description Preview */}
                  <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                    {job.description}
                  </p>

                  {/* Skills Tags */}
                  {job.skills && job.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {job.skills.slice(0, 3).map((skill, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {skill}
                        </span>
                      ))}
                      {job.skills.length > 3 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          +{job.skills.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Analytics Stats */}
                  {(job.resumeCount || job.averageScore) && (
                    <div className="flex items-center gap-4 mb-4 text-xs text-gray-600 border-t border-gray-100 pt-3">
                      {job.resumeCount !== undefined && job.resumeCount > 0 && (
                        <span className="flex items-center">
                          <FileText className="w-3.5 h-3.5 mr-1" />
                          {job.resumeCount} analyzed
                        </span>
                      )}
                      {job.averageScore && (
                        <span className="flex items-center">
                          <TrendingUp className="w-3.5 h-3.5 mr-1" />
                          {Math.round(job.averageScore)}% avg
                        </span>
                      )}
                    </div>
                  )}

                  {/* Select Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full group-hover:bg-blue-50 group-hover:border-blue-300 group-hover:text-blue-700"
                    disabled={analyzeJobMutation.isPending}
                  >
                    {analyzeJobMutation.isPending && analyzeJobMutation.variables === job.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        Select This Job
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
```

---

### 2.2 Update Upload Page Redirect

**File**: `client/src/pages/upload.tsx`
**Line**: ~486 (look for navigation after successful upload)

```typescript
// BEFORE
const handleContinue = () => {
  setLocation("/job-description");
};

// AFTER
const handleContinue = () => {
  // ✅ Pass session and batch context to job selection
  setLocation(`/job-selection?sessionId=${sessionId}&batchId=${currentBatchId}`);
};
```

---

### 2.3 Update Job Description Page (Preserve Context)

**File**: `client/src/pages/job-description.tsx`
**Line**: 15-96

```typescript
// Add after imports (around line 15)
export default function JobDescriptionPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const { steps } = useSteps(["Resume Upload", "Job Description", "Bias Detection", "Fit Analysis", "Interview Prep"], 1);

  // ✅ Parse URL params using URLSearchParams (Wouter pattern)
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('sessionId');
  const batchId = params.get('batchId');

  // State for form fields
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [requirements, setRequirements] = useState<string[]>([]);
  const [newRequirement, setNewRequirement] = useState("");

  // Use the custom hook for job description creation
  const createJobMutation = useCreateJobDescription();

  // ✅ Updated handler - triggers batch analysis if context exists
  const handleJobCreated = async (jobData: any) => {
    const jobId = jobData.jobDescription?.id;
    console.log('Job created with ID:', jobId);

    if (jobId) {
      // If coming from upload flow (has sessionId/batchId), trigger batch analysis
      if (sessionId && batchId) {
        try {
          // Trigger batch analysis
          await apiRequest("POST", `/api/analysis/analyze/${jobId}`, {
            sessionId,
            batchId
          });

          // Navigate to analysis results
          setLocation(`/analysis/${jobId}?sessionId=${sessionId}&batchId=${batchId}`);
        } catch (error) {
          console.error('Batch analysis failed:', error);
          toast({
            title: "Analysis Error",
            description: "Job created but analysis failed. Please try again from the job details page.",
            variant: "destructive",
          });
          // Fall back to bias detection page
          setLocation(`/bias-detection/${jobId}`);
        }
      } else {
        // Normal flow: go to bias detection
        setLocation(`/bias-detection/${jobId}`);
      }
    } else {
      console.error('Job ID not found in response:', jobData);
      toast({
        title: "Navigation error",
        description: "Job created but couldn't navigate to next step. Please try again.",
        variant: "destructive",
      });
    }
  };

  // ... rest of the component (no changes to form submission logic)
}
```

---

## **PHASE 3: Job Details Page** 🆕

Create a comprehensive job details page showing all analyzed resumes.

### 3.1 Create Job Details Page

**File**: `client/src/pages/job-details.tsx` (NEW FILE)

**Route**: `/jobs/:jobId`

**Data Sources**:
1. Job info: `GET /api/job-descriptions/:id`
2. Analysis results: `GET /api/analysis/analyze/:jobId`

**Full Implementation**:

```typescript
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Edit,
  Trash2,
  Upload,
  FileText,
  Eye,
  RefreshCw,
  MoreVertical,
  TrendingUp,
  Users,
  Award,
  Target,
  Loader2,
  AlertCircle
} from "lucide-react";

interface AnalysisResult {
  resumeId: number;
  filename: string;
  candidateName?: string;
  matchPercentage: number;
  matchedSkills: any[];
  missingSkills: string[];
  candidateStrengths: string[];
  candidateWeaknesses: string[];
  recommendations: string[];
  confidenceLevel: 'low' | 'medium' | 'high';
  analysisId?: number;
  createdAt?: string;
}

export default function JobDetailsPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // ✅ Use Wouter's useRoute to extract jobId from URL
  const [match, params] = useRoute("/jobs/:jobId");
  const jobId = params?.jobId ? parseInt(params.jobId) : null;

  if (!match || !jobId) {
    setLocation("/my-job-descriptions");
    return null;
  }

  // Fetch job description
  const { data: jobData, isLoading: jobLoading } = useQuery({
    queryKey: [`/api/job-descriptions/${jobId}`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/job-descriptions/${jobId}`);
      const data = await response.json();
      // ✅ Server returns { data: { jobDescription, isAnalyzed } }
      return data.data;
    }
  });

  const job = jobData?.jobDescription;

  // Fetch analysis results and statistics
  const { data: analysisData, isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery({
    queryKey: [`/api/analysis/analyze/${jobId}`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/analysis/analyze/${jobId}`);
      const data = await response.json();
      // ✅ Server returns top-level { results, statistics, ... }
      return data;
    }
  });

  const results: AnalysisResult[] = analysisData?.results || [];
  const stats = analysisData?.statistics || {};

  // Calculate highest match from results (server doesn't provide this)
  const highestMatch = results.length > 0
    ? Math.max(...results.map(r => r.matchPercentage))
    : 0;

  // Delete job mutation
  const deleteJobMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/job-descriptions/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/job-descriptions'] });
      toast({
        title: "Job Deleted",
        description: "Job description has been deleted successfully.",
      });
      setLocation("/my-job-descriptions");
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete job",
        variant: "destructive"
      });
    }
  });

  // Remove analysis mutation
  const removeAnalysisMutation = useMutation({
    mutationFn: async (resumeId: number) => {
      await apiRequest("DELETE", `/api/analysis/analyze/${jobId}/${resumeId}`);
    },
    onSuccess: () => {
      refetchAnalysis();
      toast({
        title: "Analysis Removed",
        description: "Resume analysis has been removed from this job.",
      });
    },
    onError: (error) => {
      toast({
        title: "Remove Failed",
        description: error instanceof Error ? error.message : "Failed to remove analysis",
        variant: "destructive"
      });
    }
  });

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${job?.title}"? This action cannot be undone.`)) {
      deleteJobMutation.mutate();
    }
  };

  const handleRemoveAnalysis = (resumeId: number, filename: string) => {
    if (window.confirm(`Remove analysis for "${filename}"?`)) {
      removeAnalysisMutation.mutate(resumeId);
    }
  };

  const handleReanalyze = async () => {
    toast({
      title: "Re-analyzing",
      description: "Triggering re-analysis for all resumes...",
    });

    try {
      await apiRequest("POST", `/api/analysis/analyze/${jobId}`, {
        forceReanalyze: true
      });

      refetchAnalysis();

      toast({
        title: "Re-analysis Complete",
        description: "All resumes have been re-analyzed.",
      });
    } catch (error) {
      toast({
        title: "Re-analysis Failed",
        description: error instanceof Error ? error.message : "Failed to re-analyze",
        variant: "destructive"
      });
    }
  };

  const getScoreBadgeColor = (score: number) => {
    if (score >= 80) return "bg-green-100 text-green-800";
    if (score >= 60) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const getConfidenceBadge = (level: string) => {
    const colors = {
      high: "bg-blue-100 text-blue-800",
      medium: "bg-yellow-100 text-yellow-800",
      low: "bg-gray-100 text-gray-800"
    };
    return colors[level as keyof typeof colors] || colors.low;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (jobLoading || analysisLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-500">Loading job details...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Job Not Found</h2>
            <p className="text-gray-500 mb-6">This job description doesn't exist or you don't have access to it.</p>
            <Button onClick={() => setLocation("/my-job-descriptions")}>
              Back to My Jobs
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header />

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Job Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <Target className="h-6 w-6 text-blue-600 flex-shrink-0" />
                <h1 className="text-3xl font-bold text-gray-900 truncate">{job.title}</h1>
              </div>
              <p className="text-gray-600 leading-relaxed">
                {job.description}
              </p>

              {/* Requirements */}
              {job.requirements && job.requirements.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Requirements:</h3>
                  <div className="flex flex-wrap gap-2">
                    {job.requirements.map((req: string, idx: number) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {req}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => setLocation(`/job-description/${jobId}/edit`)}>
                <Edit className="w-4 h-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={deleteJobMutation.isPending}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Resumes</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalResumes || 0}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Match Score</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats.averageMatch ? `${Math.round(stats.averageMatch)}%` : "—"}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Top Match</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {highestMatch > 0 ? `${Math.round(highestMatch)}%` : "—"}
                </p>
              </div>
              <Award className="h-8 w-8 text-yellow-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Successful</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.successful || 0}</p>
              </div>
              <FileText className="h-8 w-8 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Resumes Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-xl font-semibold text-gray-900">Analyzed Resumes</h2>
            <div className="flex gap-2">
              <Button onClick={() => setLocation('/upload')} size="sm">
                <Upload className="w-4 h-4 mr-1" />
                Add More Resumes
              </Button>
              <Button onClick={handleReanalyze} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-1" />
                Re-analyze All
              </Button>
            </div>
          </div>

          {results.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Resumes Analyzed Yet</h3>
              <p className="text-gray-500 mb-6">
                Upload resumes and analyze them against this job description to see results here.
              </p>
              <Button onClick={() => setLocation('/upload')}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Resumes
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Candidate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Upload Date
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Match Score
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Confidence
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {results.map((result) => (
                    <tr key={result.resumeId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">
                              {result.candidateName || result.filename}
                            </div>
                            {result.candidateName && (
                              <div className="text-sm text-gray-500 truncate">{result.filename}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(result.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getScoreBadgeColor(result.matchPercentage)}`}>
                          {Math.round(result.matchPercentage)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getConfidenceBadge(result.confidenceLevel)}`}>
                          {result.confidenceLevel}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setLocation(`/analysis/${jobId}?resumeId=${result.resumeId}`)}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              View Analysis
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleRemoveAnalysis(result.resumeId, result.filename)}
                              className="text-red-600 focus:text-red-700"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
```

---

## **PHASE 4: Backend Endpoints** 🔧

Add the missing DELETE endpoint for removing analysis results.

### 4.1 Add DELETE Analysis Endpoint

**File**: `server/routes/analysis.ts`

Add this new route to the existing router:

```typescript
/**
 * @swagger
 * /analysis/analyze/{jobId}/{resumeId}:
 *   delete:
 *     tags: [Analysis]
 *     summary: Remove analysis result for a specific resume-job pair
 *     description: Deletes the analysis result linking a resume to a job description
 *     security:
 *       - bearerAuth: []
 *       - ApiTokenAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Job description ID
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Resume ID
 *     responses:
 *       200:
 *         description: Analysis removed successfully
 *       400:
 *         description: Invalid job ID or resume ID
 *       404:
 *         description: Job or analysis not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.delete("/analyze/:jobId/:resumeId", eitherAuth, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const resumeId = parseInt(req.params.resumeId);
    const userId = (req as any).auth.userId;

    // Validate IDs
    if (isNaN(jobId) || isNaN(resumeId)) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Invalid job ID or resume ID",
        timestamp: new Date().toISOString()
      });
    }

    const storage = getStorage();

    // Verify job ownership
    const job = await storage.getJobDescriptionById(jobId, userId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Job description not found or you don't have access to it",
        timestamp: new Date().toISOString()
      });
    }

    // Delete the analysis result
    await storage.deleteAnalysisResultByJobAndResume(userId, jobId, resumeId);

    logger.info(`Analysis removed for job ${jobId} and resume ${resumeId} by user ${userId}`);

    res.json({
      success: true,
      status: "success",
      message: "Analysis removed successfully",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Delete analysis route failed:", error);
    res.status(500).json({
      success: false,
      error: "ROUTE_ERROR",
      message: "Failed to remove analysis",
      timestamp: new Date().toISOString()
    });
  }
});
```

---

### 4.2 Add Storage Interface Method

**File**: `server/storage.ts`

Add to the `IStorage` interface:

```typescript
export interface IStorage {
  // ... existing methods ...

  /**
   * Delete analysis result by job and resume IDs
   */
  deleteAnalysisResultByJobAndResume(
    userId: string,
    jobId: number,
    resumeId: number
  ): Promise<void>;
}
```

Implement in the `InMemoryStorage` class:

```typescript
async deleteAnalysisResultByJobAndResume(
  userId: string,
  jobId: number,
  resumeId: number
): Promise<void> {
  // Find and delete matching analysis results
  const toDelete: number[] = [];

  for (const [id, analysis] of this.analysisResultsData.entries()) {
    if (
      analysis.userId === userId &&
      analysis.jobDescriptionId === jobId &&
      analysis.resumeId === resumeId
    ) {
      toDelete.push(id);
    }
  }

  for (const id of toDelete) {
    this.analysisResultsData.delete(id);
  }

  logger.info(`Deleted ${toDelete.length} analysis result(s) for user ${userId}, job ${jobId}, resume ${resumeId}`);
}
```

---

### 4.3 Add Database Storage Implementation

**File**: `server/database-storage.ts`

Add to the `DatabaseStorage` class:

```typescript
async deleteAnalysisResultByJobAndResume(
  userId: string,
  jobId: number,
  resumeId: number
): Promise<void> {
  if (!this.db) {
    throw new Error("Database not initialized");
  }

  await this.db
    .delete(analysisResults)
    .where(
      and(
        eq(analysisResults.userId, userId),
        eq(analysisResults.jobDescriptionId, jobId),
        eq(analysisResults.resumeId, resumeId)
      )
    );

  logger.info(`Deleted analysis result for user ${userId}, job ${jobId}, resume ${resumeId}`);
}
```

**File**: `server/hybrid-storage.ts`

Delegate to database:

```typescript
async deleteAnalysisResultByJobAndResume(
  userId: string,
  jobId: number,
  resumeId: number
): Promise<void> {
  return this.dbStorage.deleteAnalysisResultByJobAndResume(userId, jobId, resumeId);
}
```

---

## **PHASE 5: Enhance My Job Descriptions** 🎨

Merge analytics data into the job listing page.

### 5.1 Update My Job Descriptions Page

**File**: `client/src/pages/my-job-descriptions.tsx`

Add analytics query and merge data:

```typescript
// Add after existing job descriptions query (around line 114)

// Fetch analytics data to enhance job cards
const { data: analyticsData } = useQuery({
  queryKey: ['/api/analysis/my-analyses'],
  queryFn: async () => {
    try {
      const response = await apiRequest("GET", "/api/analysis/my-analyses");
      const data = await response.json();
      // ✅ Server returns { analyses: [...] }
      return data.analyses || [];
    } catch (error) {
      console.warn('Failed to fetch analytics data:', error);
      return [];
    }
  },
  staleTime: 5 * 60 * 1000
});

// Merge jobs with analytics
const jobsWithAnalytics = jobDescriptions.map(job => {
  const analytics = analyticsData?.find((a: any) => a.jobId === job.id);
  return {
    ...job,
    analysesCount: analytics?.resumeCount || 0,
    averageMatchScore: analytics?.averageScore || null
  };
});

// Update filtered jobs to use jobsWithAnalytics
const filteredJobDescriptions = jobsWithAnalytics.filter((job: JobDescriptionItem) => {
  const matchesSearch = job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       job.description.toLowerCase().includes(searchTerm.toLowerCase());
  const matchesStatus = statusFilter === "All Status" ||
                       job.status.toLowerCase() === statusFilter.toLowerCase();
  return matchesSearch && matchesStatus;
});
```

Update the job card display to show analytics (around line 301-377):

```typescript
{filteredJobDescriptions.map((job: JobDescriptionItem) => (
  <div key={job.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Building className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <h3 className="text-xl font-semibold text-gray-900 truncate">{job.title}</h3>
          {getStatusBadge(job.status)}
        </div>

        {/* Description */}
        <p className="text-gray-600 mb-4 leading-relaxed">
          {truncateText(job.description, 200)}
        </p>

        {/* ✅ ADD: Analytics Stats */}
        {(job.analysesCount > 0 || job.averageMatchScore) && (
          <div className="flex items-center gap-4 mb-4 text-sm border-t border-gray-100 pt-3">
            {job.analysesCount > 0 && (
              <span className="flex items-center text-gray-600">
                <FileText className="w-4 h-4 mr-1 text-blue-500" />
                <span className="font-medium text-gray-900">{job.analysesCount}</span>
                <span className="ml-1">resume{job.analysesCount !== 1 ? 's' : ''} analyzed</span>
              </span>
            )}
            {job.averageMatchScore && (
              <span className="flex items-center text-gray-600">
                <TrendingUp className="w-4 h-4 mr-1 text-green-500" />
                <span className="font-medium text-gray-900">{Math.round(job.averageMatchScore)}%</span>
                <span className="ml-1">avg match</span>
              </span>
            )}
          </div>
        )}

        {/* Requirements Tags */}
        {job.requirements && job.requirements.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {job.requirements.slice(0, 5).map((req: string, index: number) => (
                <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {req}
                </span>
              ))}
              {job.requirements.length > 5 && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  +{job.requirements.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Stats and Date */}
        <div className="flex items-center space-x-6 text-sm text-gray-500">
          <div className="flex items-center">
            <Calendar className="h-4 w-4 mr-1" />
            <span>Created {formatDate(job.createdAt)}</span>
          </div>
          {job.experience && (
            <div className="flex items-center">
              <User className="h-4 w-4 mr-1" />
              <span>{formatExperienceLevel(job.experience)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions - ✅ UPDATE: View button goes to job details */}
      <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation(`/jobs/${job.id}`)} // ✅ Changed from /analysis/:jobId
        >
          <Eye className="h-4 w-4 mr-1" />
          View
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleEditJob(job.id)}
        >
          <Edit className="h-4 w-4 mr-1" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleDeleteJob(job.id, job.title)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  </div>
))}
```

---

## **PHASE 6: Router Configuration** 🛣️

Add routes for the new pages.

### 6.1 Update App.tsx

**File**: `client/src/App.tsx`

```typescript
// Add lazy imports (around line 16-28)
const JobSelectionPage = lazy(() => import("./pages/job-selection"));
const JobDetailsPage = lazy(() => import("./pages/job-details"));
const MyJobDescriptionsPage = lazy(() => import("./pages/my-job-descriptions"));

// Add routes in Router component (around line 80-131)
function Router() {
  return (
    <Switch>
      {/* ... existing routes ... */}

      {/* ✅ NEW: Job Selection Page */}
      <Route path="/job-selection">
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <JobSelectionPage />
          </Suspense>
        </RequireAuth>
      </Route>

      {/* ✅ NEW: Job Details Page */}
      <Route path="/jobs/:jobId">
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <JobDetailsPage />
          </Suspense>
        </RequireAuth>
      </Route>

      {/* ✅ NEW: My Job Descriptions Page */}
      <Route path="/my-job-descriptions">
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <MyJobDescriptionsPage />
          </Suspense>
        </RequireAuth>
      </Route>

      {/* ... existing routes ... */}
    </Switch>
  );
}
```

---

## 🧪 Testing Checklist

### Functional Tests
- [ ] **Upload Flow**: Upload resume → redirects to `/job-selection?sessionId=...&batchId=...`
- [ ] **Job Selection**: Displays existing jobs with correct analytics (resume count, avg score)
- [ ] **Select Existing Job**: Triggers batch analysis → navigates to `/analysis/:jobId` with results
- [ ] **Create New Job**: Preserves sessionId/batchId → auto-analyzes batch → shows results
- [ ] **Job Details Page**: Shows job info, stats dashboard, and all analyzed resumes
- [ ] **Remove Analysis**: DELETE button removes analysis from job
- [ ] **Re-analyze**: Triggers re-analysis for all resumes
- [ ] **Add More Resumes**: Button navigates to upload page
- [ ] **My Job Descriptions**: Shows analytics merged from `/api/analysis/my-analyses`
- [ ] **View Button**: Navigates to `/jobs/:jobId` (job details page)

### Data Flow Tests
- [ ] Job list fetches from `data.data.jobDescriptions` (not `data.jobs`)
- [ ] Job creation returns `{ jobDescription, analysis, processingTime }`
- [ ] Analytics query reads `data.analyses` (not `data.data.jobs`)
- [ ] Analysis results read from top-level `{ results, statistics }` (not nested `data.*`)

### Edge Cases
- [ ] Empty job list shows create prompt
- [ ] Job with no analyses shows "Add Resumes" prompt
- [ ] Invalid job ID redirects to my-job-descriptions
- [ ] Delete job confirmation works
- [ ] Remove analysis confirmation works
- [ ] Session/batch expiry handled gracefully

---

## 📈 Performance Considerations

1. **Query Caching**: All queries use React Query's `staleTime` for caching
2. **Pagination**: Job details resume table could paginate if >50 resumes
3. **Analytics Merge**: Client-side merge is fast for <100 jobs; could move server-side later
4. **Lazy Loading**: All new pages are lazy loaded to reduce bundle size

---

## 🔐 Security Considerations

1. **Authorization**: All routes use `eitherAuth` middleware
2. **Ownership Validation**: DELETE endpoint verifies job ownership before deletion
3. **Input Validation**: All IDs validated as integers
4. **Error Messages**: Generic error messages to avoid information leakage

---

## 🚀 Deployment Steps

1. **Fix Data Flow Issues** (Phase 1) - Deploy first, critical fix
2. **Create Job Selection Page** (Phase 2) - Can deploy independently
3. **Create Job Details Page** (Phase 3) - Requires DELETE endpoint
4. **Add DELETE Endpoint** (Phase 4) - Deploy with Phase 3
5. **Enhance My Jobs** (Phase 5) - Can deploy independently
6. **Update Router** (Phase 6) - Deploy last, ties everything together

---

## 📝 Migration Notes

**No database migrations required** - all existing tables and columns are sufficient.

**Breaking Changes**: None - all changes are additive or internal.

**Backward Compatibility**: ✅ All existing flows continue to work.

---

## 🎯 Success Metrics

- **User Flow Completion**: % of users who complete upload → select/create job → view analysis
- **Job Reuse Rate**: % of users who select existing job vs create new
- **Re-analysis Usage**: # of times users trigger re-analysis
- **Job Details Engagement**: Time spent on job details page, actions taken

---

## 📚 Additional Resources

- **Wouter Routing Docs**: https://github.com/molefrog/wouter
- **React Query Docs**: https://tanstack.com/query/latest/docs/framework/react/overview
- **Existing Types**: `shared/my-jobs-schemas.ts` - Comprehensive type definitions

---

**Implementation Priority**:
1. Phase 1 (CRITICAL)
2. Phase 4 (Backend support)
3. Phase 2 + Phase 6 (Job selection flow)
4. Phase 3 (Job details)
5. Phase 5 (Enhancement)

**Estimated Effort**: 6-8 hours for full implementation + testing
