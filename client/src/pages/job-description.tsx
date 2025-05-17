import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import StepProgress from "@/components/step-progress";
import { useSteps } from "@/hooks/use-steps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function JobDescriptionPage() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const { steps } = useSteps(["Resume Upload", "Job Description", "Bias Detection", "Fit Analysis", "Interview Prep"], 1);
  // This is the second step (Job Description)
  
  // State for form fields
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  
  // Submit job description mutation
  const submitMutation = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      return apiRequest("POST", "/api/job-descriptions", data);
    },
    onSuccess: async (response) => {
      const data = await response.json();
      toast({
        title: "Job description submitted",
        description: "Your job description has been saved successfully.",
      });
      
      // Navigate to bias detection page with job ID
      setLocation(`/bias-detection/${data.id}`);
    },
    onError: (error) => {
      toast({
        title: "Submission failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
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
    
    // Submit form
    submitMutation.mutate({
      title: jobTitle,
      description: jobDescription,
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
              
              <div>
                <label htmlFor="jobDescription" className="block text-sm font-medium text-gray-700 mb-1">
                  Job Description
                </label>
                <Textarea
                  id="jobDescription"
                  rows={12}
                  placeholder="Paste the full job description here..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  className="w-full"
                />
              </div>
              
              <div className="flex items-center text-sm text-gray-500 mt-2">
                <i className="fas fa-info-circle mr-2"></i>
                <span>Our AI will extract key skills and requirements automatically</span>
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
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
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
