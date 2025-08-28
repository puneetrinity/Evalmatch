import StepProgress from "@/components/step-progress";
import type { Step } from "@/hooks/use-steps";

interface AnalysisHeaderProps {
  steps: Step[];
}

export default function AnalysisHeader({ steps }: AnalysisHeaderProps) {
  return (
    <>
      <StepProgress steps={steps} />
      <h1 className="text-3xl font-bold mb-6">Candidate Fit Analysis</h1>
      <div className="mb-8">
        <p className="text-gray-600">
          We've analyzed your job description and candidate resumes. Here are the results ranked by overall fit.
        </p>
      </div>
    </>
  );
}