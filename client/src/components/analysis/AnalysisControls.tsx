import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface AnalysisControlsProps {
  isError: boolean;
  onTryAgain: () => void;
}

export default function AnalysisControls({ 
  isError, 
  onTryAgain 
}: AnalysisControlsProps) {
  if (!isError) return null;

  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTitle>Error Loading Analysis</AlertTitle>
      <AlertDescription>
        There was a problem loading the analysis data. The job description or resumes may no longer exist.
        <div className="mt-4">
          <Button onClick={onTryAgain}>
            Try Again
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}