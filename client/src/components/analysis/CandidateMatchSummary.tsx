import type { MatchedSkill } from "@shared/api-contracts";

interface CandidateMatchSummaryProps {
  matchPercentage: number;
  matchedSkills: MatchedSkill[];
  missingSkills: string[];
  expanded: boolean;
  onToggleExpanded: () => void;
}

export default function CandidateMatchSummary({
  matchPercentage,
  matchedSkills,
  missingSkills,
  expanded,
  onToggleExpanded
}: CandidateMatchSummaryProps) {
  return (
    <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-6 w-6 bg-green-500 rounded-full flex items-center justify-center">
          <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h4 className="text-lg font-semibold text-green-800">Match Summary</h4>
        <span className="ml-auto text-green-700 font-medium">
          {matchPercentage}% - {matchPercentage >= 85 ? 'Exceptional' : matchPercentage >= 70 ? 'Strong' : matchPercentage >= 55 ? 'Viable' : 'Potential'} Candidate
        </span>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-green-800">
            <strong>Has key skills:</strong> {matchedSkills?.slice(0, 4).map(skill => 
              typeof skill === 'string' ? skill : skill?.skill || 'Skill'
            ).join(', ')} {matchedSkills && matchedSkills.length > 4 && `+${matchedSkills.length - 4} more`}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-green-800">
            <strong>Strong skill alignment with</strong> <em>{matchedSkills?.length || 0} matching requirements</em>
          </span>
        </div>
        
        {missingSkills && missingSkills.length > 0 && (
          <div className="flex items-start gap-2">
            <div className="h-5 w-5 bg-orange-500 rounded-full flex items-center justify-center mt-0.5">
              <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <span className="text-orange-800">
              <strong>May benefit from training in:</strong> {missingSkills.slice(0, 3).join(', ')} {missingSkills.length > 3 && `+${missingSkills.length - 3} more`}
            </span>
          </div>
        )}
      </div>
      
      <button 
        onClick={onToggleExpanded}
        className="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
      >
        {expanded ? 'Hide detailed breakdown' : 'View detailed breakdown'}
      </button>
    </div>
  );
}