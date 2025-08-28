import { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Define the available tooltips
export const tooltips = {
  upload: {
    title: "Resume Upload",
    description: "Upload candidate resumes in DOCX, PDF, or TXT format. Our AI will analyze them automatically.",
    position: "bottom",
  },
  jobDescription: {
    title: "Job Description",
    description: "Enter job descriptions to analyze for requirements and potential bias.",
    position: "bottom",
  },
  biasDetection: {
    title: "Bias Detection",
    description: "Identify potentially biased language in job descriptions to ensure inclusivity.",
    position: "bottom",
  },
  analysis: {
    title: "Candidate Analysis",
    description: "Match candidates to job descriptions with detailed skill gap analysis.",
    position: "bottom",
  },
  interview: {
    title: "Interview Questions",
    description: "Generate customized interview questions based on candidate profiles and job requirements.",
    position: "bottom",
  },
};

type Position = "top" | "right" | "bottom" | "left";

interface FeatureTooltipProps {
  id: keyof typeof tooltips;
  onDismiss?: () => void;
  position?: Position;
  children?: React.ReactNode;
}

export function FeatureTooltip({ 
  id, 
  onDismiss, 
  position = "bottom", 
  children 
}: FeatureTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  
  // Check if the tooltip has been dismissed before
  useEffect(() => {
    const dismissedTooltips = JSON.parse(localStorage.getItem('dismissedTooltips') || '{}');
    if (!dismissedTooltips[id]) {
      setIsVisible(true);
    }
  }, [id]);
  
  const handleDismiss = () => {
    // Mark this tooltip as dismissed
    const dismissedTooltips = JSON.parse(localStorage.getItem('dismissedTooltips') || '{}');
    dismissedTooltips[id] = true;
    localStorage.setItem('dismissedTooltips', JSON.stringify(dismissedTooltips));
    
    setIsVisible(false);
    
    if (onDismiss) {
      onDismiss();
    }
  };
  
  if (!isVisible) {
    return <>{children}</>;
  }
  
  const tooltip = tooltips[id];
  
  // Position styles
  const positionStyles = {
    top: "bottom-full left-1/2 transform -translate-x-1/2 mb-2",
    right: "left-full top-1/2 transform -translate-y-1/2 ml-2",
    bottom: "top-full left-1/2 transform -translate-x-1/2 mt-2",
    left: "right-full top-1/2 transform -translate-y-1/2 mr-2",
  };
  
  // Arrow styles
  const arrowStyles = {
    top: "bottom-0 left-1/2 transform translate-x-1/2 translate-y-1/2 rotate-45",
    right: "left-0 top-1/2 transform -translate-x-1/2 -translate-y-1/2 rotate-45",
    bottom: "top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rotate-45",
    left: "right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 rotate-45",
  };
  
  return (
    <div className="relative group">
      {children}
      
      <div className={`absolute z-50 w-64 ${positionStyles[position]}`}>
        <div className={`absolute w-3 h-3 bg-white border-t border-l border-gray-200 ${arrowStyles[position]}`}></div>
        <Card className="shadow-lg border-gray-200">
          <CardContent className="p-4">
            <h4 className="font-bold text-lg mb-1">{tooltip.title}</h4>
            <p className="text-gray-700">{tooltip.description}</p>
          </CardContent>
          <CardFooter className="flex justify-end p-2 pt-0">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleDismiss}
              className="text-sm"
            >
              Got it
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}