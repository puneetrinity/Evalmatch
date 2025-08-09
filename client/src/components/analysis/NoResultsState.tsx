import { Button } from "@/components/ui/button";

interface NoResultsStateProps {
  isAnalyzing: boolean;
  isPending: boolean;
  sessionId?: string | null;
  currentBatchId?: string | null;
  onTryAgain: () => void;
}

export default function NoResultsState({
  isAnalyzing,
  isPending,
  sessionId,
  currentBatchId,
  onTryAgain
}: NoResultsStateProps) {
  return (
    <div className="bg-gray-50 p-8 rounded-lg border text-center">
      <h3 className="text-xl font-medium mb-4">No Analysis Results Available</h3>
      
      {isAnalyzing || isPending ? (
        <div className="flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4"></div>
          <p className="text-gray-600">Analyzing resumes against job description...</p>
          <p className="text-sm text-gray-500 mt-2">This may take a moment</p>
          {sessionId && currentBatchId && (
            <p className="text-xs text-blue-600 mt-2">
              Auto-analyzing batch: {currentBatchId.slice(-8)}
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="text-gray-600 mb-6">This could be due to one of the following reasons:</p>
          <ul className="text-left max-w-md mx-auto mb-6">
            <li className="mb-2 flex">
              <i className="fas fa-circle text-xs text-gray-400 mt-2 mr-2"></i>
              <span>No resumes were uploaded</span>
            </li>
            <li className="mb-2 flex">
              <i className="fas fa-circle text-xs text-gray-400 mt-2 mr-2"></i>
              <span>The job description analysis is still in progress</span>
            </li>
            <li className="flex">
              <i className="fas fa-circle text-xs text-gray-400 mt-2 mr-2"></i>
              <span>There was an error during the analysis</span>
            </li>
          </ul>
          <Button onClick={onTryAgain}>
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}