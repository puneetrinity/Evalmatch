import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

// Define the steps in our onboarding process
const onboardingSteps = [
  {
    title: "Welcome to EvalMatchAI",
    description: "Your Semantic Matching Suite for resume analysis and job matching",
    content: "EvalMatchAI helps you streamline your recruitment process by semantically analyzing resumes, detecting bias in job descriptions, matching candidates to positions, and generating customized interview questions. Let's get started!",
    image: null,
    buttonText: "Next: Resume Upload"
  },
  {
    title: "Step 1: Upload Resumes",
    description: "Start by uploading candidate resumes",
    content: "Navigate to the Upload page to submit candidate resumes in various formats (DOCX, PDF, TXT). Our AI will analyze each resume to extract skills, experience, education, and other key information.",
    image: null,
    buttonText: "Next: Job Descriptions"
  },
  {
    title: "Step 2: Create Job Descriptions",
    description: "Define the position requirements",
    content: "Enter your job descriptions on the Job Description page. Our AI will analyze the requirements and prepare it for candidate matching. We'll also check for potentially biased language.",
    image: null,
    buttonText: "Next: Bias Detection"
  },
  {
    title: "Step 3: Detect Bias",
    description: "Ensure your job descriptions are inclusive",
    content: "Our Bias Detection feature identifies potentially biased language in job descriptions and suggests more inclusive alternatives. This helps you attract a more diverse candidate pool.",
    image: null,
    buttonText: "Next: Analysis"
  },
  {
    title: "Step 4: Match Candidates",
    description: "Find the best fit for your positions",
    content: "The Analysis page compares candidates against your job descriptions, providing detailed match percentages, skill comparisons, and fairness metrics to help you make informed decisions.",
    image: null,
    buttonText: "Next: Interview Questions"
  },
  {
    title: "Step 5: Generate Interview Questions",
    description: "Prepare for effective interviews",
    content: "Generate customized interview questions based on a candidate's profile and the job requirements. Questions are categorized into technical, experience, skill gap, and inclusion topics.",
    image: null,
    buttonText: "Get Started"
  }
];

interface WelcomeProps {
  onComplete: () => void;
}

export function Welcome({ onComplete }: WelcomeProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  const { toast } = useToast();
  
  // Check if user has seen the welcome screen before
  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
    if (hasSeenWelcome === 'true') {
      setShowWelcome(false);
      onComplete();
    }
  }, [onComplete]);
  
  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // User has completed all steps
      localStorage.setItem('hasSeenWelcome', 'true');
      setShowWelcome(false);
      onComplete();
      
      toast({
        title: "Welcome to EvalMatchAI!",
        description: "You're all set. Start by uploading your resumes.",
      });
    }
  };
  
  const handleSkip = () => {
    localStorage.setItem('hasSeenWelcome', 'true');
    setShowWelcome(false);
    onComplete();
  };
  
  if (!showWelcome) {
    return null;
  }
  
  const step = onboardingSteps[currentStep];
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
          <CardTitle className="text-2xl font-bold">{step.title}</CardTitle>
          <CardDescription className="text-blue-100 text-lg">{step.description}</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-lg mb-4">
            {step.content}
          </div>
          {step.image && (
            <div className="rounded-md overflow-hidden my-4">
              <img src={step.image} alt={step.title} className="w-full" />
            </div>
          )}
          <div className="flex items-center space-x-2 mt-2">
            <div className="flex-1 h-2 bg-gray-200 rounded-full">
              <div 
                className="h-full bg-blue-600 rounded-full" 
                style={{ width: `${((currentStep + 1) / onboardingSteps.length) * 100}%` }}
              ></div>
            </div>
            <span className="text-sm text-gray-500">
              {currentStep + 1} of {onboardingSteps.length}
            </span>
          </div>
        </CardContent>
        <CardFooter className="border-t bg-gray-50 rounded-b-lg flex justify-between">
          <Button variant="ghost" onClick={handleSkip}>
            Skip Tutorial
          </Button>
          <Button onClick={handleNext}>
            {step.buttonText}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}