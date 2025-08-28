import { useState } from 'react';

export type Step = {
  id: string;
  title: string;
  description?: string;
  isCompleted: boolean;
  isCurrent: boolean;
};

export function useSteps(steps: string[], initialStep: number = 0) {
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStep);
  
  const goToNextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
      return true;
    }
    return false;
  };
  
  const goToPreviousStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
      return true;
    }
    return false;
  };
  
  const goToStep = (index: number) => {
    if (index >= 0 && index < steps.length) {
      setCurrentStepIndex(index);
      return true;
    }
    return false;
  };
  
  const stepsWithState: Step[] = steps.map((title, index) => ({
    id: `step-${index + 1}`,
    title,
    isCompleted: index < currentStepIndex,
    isCurrent: index === currentStepIndex,
  }));
  
  return {
    steps: stepsWithState,
    currentStep: stepsWithState[currentStepIndex],
    currentStepIndex,
    isFirstStep: currentStepIndex === 0,
    isLastStep: currentStepIndex === steps.length - 1,
    goToNextStep,
    goToPreviousStep,
    goToStep,
  };
}
