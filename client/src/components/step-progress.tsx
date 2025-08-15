import { type Step } from "@/hooks/use-steps";

interface StepProgressProps {
  steps: Step[];
}

export default function StepProgress({ steps }: StepProgressProps) {
  return (
    <div className="mb-14" data-testid="step-progress">
      <div className="flex items-center justify-between">
        <div className="w-full">
          <div className="flex items-center">
            {steps.map((step, index) => (
              <div key={step.id} className="relative flex items-center flex-1">
                {/* Step circle */}
                <div 
                  className={`
                    h-12 w-12 rounded-full border-2 flex items-center justify-center font-semibold z-10
                    ${step.isCurrent 
                      ? 'bg-primary border-primary text-white shadow-lg scale-110 transition-transform duration-300' 
                      : step.isCompleted 
                        ? 'bg-primary border-primary text-white' 
                        : 'bg-white border-gray-300 text-gray-500'}
                  `}
                >
                  {step.isCompleted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                
                {/* Step label */}
                <div className={`
                  absolute -bottom-10 left-1/2 transform -translate-x-1/2 text-sm font-medium w-32 text-center
                  ${step.isCurrent ? 'text-primary font-bold' : step.isCompleted ? 'text-gray-700' : 'text-gray-500'}
                `}>
                  {step.title}
                </div>
                
                {/* Connect lines between steps */}
                {index < steps.length - 1 && (
                  <div className="flex-1 h-0.5 relative">
                    <div className={`
                      absolute inset-0 
                      ${step.isCompleted ? 'bg-primary' : 'bg-gray-300'}
                    `}></div>
                    {/* Gradient transition effect for current step */}
                    {step.isCurrent && (
                      <div className="absolute inset-0 bg-gradient-to-r from-primary to-gray-300"></div>
                    )}
                  </div>
                )}
                
                {/* Pulsing effect for current step */}
                {step.isCurrent && (
                  <div className="absolute inset-0 -m-1 rounded-full bg-primary opacity-20 animate-pulse"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
