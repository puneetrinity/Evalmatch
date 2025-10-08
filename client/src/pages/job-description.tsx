import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCreateJobDescription, useJobDescriptions } from "@/hooks/use-job-descriptions";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import StepProgress from "@/components/step-progress";
import { useSteps } from "@/hooks/use-steps";
import { Button } from "@/components/ui/button";
import { X, Info, Loader2, Briefcase, Plus, ChevronRight, FileText } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { JobCreateRequest } from "@shared/api-contracts";

export default function JobDescriptionPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const { steps } = useSteps(["Resume Upload", "Job Description", "Bias Detection", "Fit Analysis", "Interview Prep"], 1);

  // Extract sessionId and batchId from URL params
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('sessionId');
  const batchId = params.get('batchId');

  // UI State
  const [showJobSelection, setShowJobSelection] = useState(true);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  // State for form fields
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [requirements, setRequirements] = useState<string[]>([]);
  const [newRequirement, setNewRequirement] = useState("");
  const [skipBiasDetection, setSkipBiasDetection] = useState(false);
  
  // Fetch user's existing job descriptions
  const { data: jobsResponse, isLoading: loadingJobs } = useJobDescriptions();
  const existingJobs = jobsResponse?.jobDescriptions || [];

  // Fetch uploaded resumes count for current session/batch
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

  const uploadedCount = resumesData?.length || 0;

  // Debug: Check all conditions for dropdown visibility
  console.log('🔍 Job Description Page Debug:', {
    hasSessionId: !!sessionId,
    hasBatchId: !!batchId,
    sessionId,
    batchId,
    loadingJobs,
    existingJobsCount: existingJobs.length,
    showJobSelection,
    showCreateNew,
    shouldShowQuickSelector: !!(sessionId && batchId && !loadingJobs)
  });

  // Use the custom hook for job description creation
  const createJobMutation = useCreateJobDescription();

  // Mutation for triggering analysis
  const analyzeM = useMutation({
    mutationFn: async (jobId: number) => {
      console.log('🔄 Starting analysis mutation:', {
        jobId,
        sessionId,
        batchId,
        uploadedCount
      });

      const body: any = {};
      if (sessionId) body.sessionId = sessionId;
      if (batchId) body.batchId = batchId;

      console.log('📤 Sending POST request to:', `/api/analysis/analyze/${jobId}`, 'Body:', body);

      const response = await apiRequest("POST", `/api/analysis/analyze/${jobId}`, body);
      const data = await response.json();

      console.log('📥 Analysis response:', data);
      return data;
    },
    onSuccess: (data, jobId) => {
      console.log('✅ Analysis mutation succeeded, navigating to analysis page');
      toast({
        title: "Analysis Started",
        description: `Analyzing ${uploadedCount} resume(s) against this job description.`,
      });
      // Navigate to analysis page to continue the workflow (bias detection → fit analysis → interview prep)
      setLocation(`/analysis/${jobId}?sessionId=${sessionId}&batchId=${batchId}`);
    },
    onError: (error) => {
      console.error('❌ Analysis mutation failed:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to start analysis",
        variant: "destructive",
      });
    }
  });

  // Handle existing job selection
  const handleSelectExistingJob = (jobId: number) => {
    // Navigate directly to analysis; the Analysis page will auto-run batch analysis
    if (sessionId && batchId) {
      setLocation(`/analysis/${jobId}?sessionId=${sessionId}&batchId=${batchId}`);
    } else {
      // No upload context – route user to bias detection first
      setLocation(`/bias-detection/${jobId}`);
    }
  };

  // Handle successful job creation
  const handleJobCreated = (jobData: any) => {
    const jobId = jobData.jobDescription?.id;
    console.log('Job created with ID:', jobId);

    if (jobId) {
      // If we have session/batch context, go straight to analysis; the Analysis page will auto-run if needed
      if (sessionId && batchId) {
        setLocation(`/analysis/${jobId}?sessionId=${sessionId}&batchId=${batchId}`);
      } else {
        // Otherwise, proceed to bias detection flow
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

  // Add requirement to list
  const addRequirement = () => {
    if (newRequirement.trim() && !requirements.includes(newRequirement.trim())) {
      setRequirements(prev => [...prev, newRequirement.trim()]);
      setNewRequirement("");
    }
  };

  // Remove requirement from list
  const removeRequirement = (index: number) => {
    setRequirements(prev => prev.filter((_, i) => i !== index));
  };
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!jobTitle.trim()) {
      toast({
        title: "Job title required",
        description: "Please enter a job title.",
        variant: "destructive",
      });
      return;
    }
    
    if (!jobDescription.trim()) {
      toast({
        title: "Job description required",
        description: "Please enter a job description.",
        variant: "destructive",
      });
      return;
    }
    
    // Prepare job data for API
    const jobData: JobCreateRequest = {
      title: jobTitle,
      description: jobDescription,
      ...(requirements.length > 0 && { requirements }),
    };
    
    // Submit form using the custom hook
    createJobMutation.mutate(jobData, {
      onSuccess: handleJobCreated,
    });
  };
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <StepProgress steps={steps} />

        <div className="mt-12">
          {/* Header with resume count */}
          <div className="mb-8">
            {/* DEBUG BANNER */}
            {sessionId && batchId && !loadingJobs && (
              <div className="bg-yellow-200 border-4 border-red-600 p-4 mb-4 text-center">
                <p className="text-xl font-bold">🚨 DEBUG: Quick Selector SHOULD be visible below this! 🚨</p>
                <p>sessionId: {sessionId}</p>
                <p>batchId: {batchId}</p>
                <p>loadingJobs: {String(loadingJobs)}</p>
                <p>existingJobs: {existingJobs.length}</p>
              </div>
            )}
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Select or Create Job Description</h1>
            {sessionId && batchId && (
              <p className="text-gray-600 flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                You uploaded <span className="font-semibold text-blue-600">{uploadedCount} resume(s)</span>.
                Select an existing job or create a new one to start analysis.
              </p>
            )}
            {!sessionId && !batchId && (
              <p className="text-gray-600">
                Create a new job description or go back to upload resumes first.
              </p>
            )}
          </div>

          {/* Quick Job Selector for Upload Flow */}
          {(() => {
            const shouldShow = sessionId && batchId && !loadingJobs;
            console.log('🎯 SHOULD SHOW QUICK SELECTOR:', shouldShow, {
              hasSessionId: !!sessionId,
              hasBatchId: !!batchId,
              loadingJobs,
              condition: `${!!sessionId} && ${!!batchId} && ${!loadingJobs}`
            });
            return shouldShow;
          })() && (
            <div className="bg-white rounded-lg shadow-sm p-6 mb-8 border-4 border-blue-500" style={{minHeight: '200px'}}>
              {existingJobs.length > 0 ? (
                <>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <label htmlFor="jobSelect" className="block text-sm font-medium text-gray-700 mb-2">
                        Select an existing job description
                      </label>
                      <select
                        id="jobSelect"
                        value={selectedJobId}
                        onChange={(e) => setSelectedJobId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">-- Choose a job description --</option>
                        {existingJobs.map((job: any) => (
                          <option key={job.id} value={job.id}>
                            {job.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="pt-7">
                      <Button
                        onClick={() => selectedJobId && handleSelectExistingJob(parseInt(selectedJobId))}
                        disabled={!selectedJobId || analyzeM.isPending}
                      >
                        {analyzeM.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Starting Analysis...
                          </>
                        ) : (
                          <>
                            Analyze Resumes
                            <ChevronRight className="h-4 w-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-600 text-center">
                      Or{' '}
                      <Button
                        variant="link"
                        className="p-0 h-auto font-medium text-blue-600 hover:text-blue-700"
                        onClick={() => setShowCreateNew(true)}
                      >
                        create a new job description
                      </Button>
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Job Descriptions Yet</h3>
                  <p className="text-gray-600 mb-4">
                    Create your first job description to analyze the {uploadedCount} resume(s) you uploaded.
                  </p>
                  <Button onClick={() => setShowCreateNew(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Job Description
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Job Selection Section (Card Grid) - Only shown when NOT in upload flow */}
          {!sessionId && !batchId && (
            <>
              {loadingJobs ? (
                <div className="mb-8 bg-white rounded-lg shadow-sm p-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
                  <p className="text-gray-500">Loading your job descriptions...</p>
                </div>
              ) : showJobSelection && !showCreateNew && existingJobs.length > 0 ? (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">Select Existing Job</h2>
                    <Button
                      variant="outline"
                      onClick={() => setShowCreateNew(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create New Job
                    </Button>
                  </div>

                  <div className="grid gap-4">
                    {existingJobs.map((job: any) => (
                      <div
                        key={job.id}
                        className="bg-white border border-gray-200 rounded-lg p-6 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer"
                        onClick={() => handleSelectExistingJob(job.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Briefcase className="h-5 w-5 text-blue-600" />
                              <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
                            </div>
                            <p className="text-gray-600 mb-3 line-clamp-2">{job.description}</p>
                            {job.skills && job.skills.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {job.skills.slice(0, 5).map((skill: string, idx: number) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                  >
                                    {skill}
                                  </span>
                                ))}
                                {job.skills.length > 5 && (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                    +{job.skills.length - 5} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0 ml-4" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}

          {/* Create New Job Form */}
          {(showCreateNew || (!sessionId && !batchId && existingJobs.length === 0)) && (
            <div>
              {existingJobs.length > 0 && (sessionId && batchId || !sessionId && !batchId) && (
                <div className="mb-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateNew(false)}
                  >
                    {sessionId && batchId ? 'Back to Job Selection' : 'Back to Job List'}
                  </Button>
                </div>
              )}

              <h2 className="text-xl font-semibold text-gray-900 mb-4">Create New Job Description</h2>
              <p className="text-gray-600 mb-6">
                Paste the job description text below. Our AI will analyze it to extract key requirements and match them against candidate resumes.
              </p>
          
          <form onSubmit={handleSubmit}>
            <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
              <div className="mb-4">
                <label htmlFor="jobTitle" className="block text-sm font-medium text-gray-700 mb-1">
                  Job Title
                </label>
                <Input
                  id="jobTitle"
                  placeholder="e.g. Senior Software Engineer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full"
                />
              </div>
              
              <div className="mb-6">
                <label htmlFor="jobDescription" className="block text-sm font-medium text-gray-700 mb-1">
                  Job Description
                </label>
                <Textarea
                  id="jobDescription"
                  rows={8}
                  placeholder="Paste the full job description here..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Requirements Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Requirements (Optional)
                </label>
                
                {/* Add new requirement */}
                <div className="flex gap-2 mb-3">
                  <Input
                    placeholder="e.g. 5+ years of React experience"
                    value={newRequirement}
                    onChange={(e) => setNewRequirement(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addRequirement();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addRequirement}
                    disabled={!newRequirement.trim()}
                  >
                    Add
                  </Button>
                </div>
                
                {/* List of requirements */}
                {requirements.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {requirements.map((req, index) => (
                      <div key={index} className="flex items-center justify-between bg-blue-50 px-3 py-2 rounded-md">
                        <span className="text-sm">{req}</span>
                        <button
                          type="button"
                          onClick={() => removeRequirement(index)}
                          className="text-red-500 hover:text-red-700 text-sm ml-2"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex items-center text-sm text-gray-500 mt-2">
                  <Info className="h-4 w-4 mr-2" />
                  <span>Our AI will extract additional skills and requirements automatically from the description</span>
                </div>
              </div>

              {/* Bias Detection Toggle (only show when in upload flow) */}
              {sessionId && batchId && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <label className="flex items-start cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipBiasDetection}
                      onChange={(e) => setSkipBiasDetection(e.target.checked)}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div className="ml-3">
                      <span className="text-sm font-medium text-gray-900">
                        Skip bias detection (faster processing)
                      </span>
                      <p className="text-sm text-gray-600 mt-1">
                        Enable this to go directly to analysis results. You can always review bias detection later.
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/upload")}
              >
                Back to Resume Upload
              </Button>
              
              <Button
                type="submit"
                disabled={createJobMutation.isPending}
              >
                {createJobMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  "Analyze and Compare"
                )}
              </Button>
            </div>
          </form>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
