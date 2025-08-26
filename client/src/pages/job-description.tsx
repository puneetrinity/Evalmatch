import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useCreateJobDescription } from "@/hooks/use-job-descriptions";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import StepProgress from "@/components/step-progress";
import { useSteps } from "@/hooks/use-steps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { JobCreateRequest } from "@shared/api-contracts";

export default function JobDescriptionPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const { steps } = useSteps(["Resume Upload", "Job Description", "Bias Detection", "Fit Analysis", "Interview Prep"], 1);
  // This is the second step (Job Description)
  
  // State for form fields
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [requirements, setRequirements] = useState<string[]>([]);
  const [newRequirement, setNewRequirement] = useState("");
  
  // Use the custom hook for job description creation
  const createJobMutation = useCreateJobDescription();

  // Handle successful job creation
  const handleJobCreated = (jobData: any) => {
    // Navigate to bias detection page with job ID
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
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Enter Job Description</h1>
          <p className="text-gray-600 mb-8">
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
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex items-center text-sm text-gray-500 mt-2">
                  <i className="fas fa-info-circle mr-2"></i>
                  <span>Our AI will extract additional skills and requirements automatically from the description</span>
                </div>
              </div>
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
                    <i className="fas fa-spinner animate-spin mr-2"></i>
                    Analyzing...
                  </>
                ) : (
                  "Analyze and Compare"
                )}
              </Button>
            </div>
          </form>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
