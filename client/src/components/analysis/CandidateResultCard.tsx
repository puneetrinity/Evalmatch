import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CandidateAvatar from "./CandidateAvatar";
import CandidateMatchSummary from "./CandidateMatchSummary";
import SkillMatchDetails from "./SkillMatchDetails";
import type { ResumeId, AnalysisId, MatchedSkill, MatchInsights, JobId } from "@shared/api-contracts";

interface AnalysisResult {
  resumeId: ResumeId;
  filename: string;
  candidateName?: string;
  matchPercentage: number | null;
  matchedSkills: MatchedSkill[];
  missingSkills: string[];
  candidateStrengths: string[];
  candidateWeaknesses: string[];
  recommendations: string[];
  confidenceLevel: 'low' | 'medium' | 'high';
  analysisId?: AnalysisId;
  scoringDimensions?: {
    skills: number;
    experience: number;
    education: number;
    semantic: number;
    overall: number;
  };
  matchInsights?: MatchInsights;
}

interface CandidateResultCardProps {
  result: AnalysisResult;
  expanded: boolean;
  jobId: JobId;
  onViewDetails: (resumeId: number) => void;
  onGenerateQuestions: (resumeId: number, jobId: JobId) => void;
}

export default function CandidateResultCard({
  result,
  expanded,
  jobId,
  onViewDetails,
  onGenerateQuestions
}: CandidateResultCardProps) {
  return (
    <Card 
      key={`resume-${result.resumeId}-analysis-${result.analysisId || 'unknown'}`} 
      className="overflow-hidden"
    >
      <div className="flex items-center justify-between bg-gray-50 p-4 border-b">
        <div className="flex items-center">
          <CandidateAvatar 
            candidateName={result.candidateName}
            filename={result.filename}
          />
          <div className="ml-4">
            <h3 
              className="text-lg font-semibold text-gray-900"
              id={`candidate-name-${result.resumeId}`}
            >
              {result.candidateName || "Unknown Candidate"}
            </h3>
            <p className="text-sm text-gray-500">{result.filename}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-3xl font-bold text-blue-600">
              {result.matchPercentage !== null ? `${result.matchPercentage}%` : 'N/A'}
            </div>
            <div className="text-sm text-gray-500">match</div>
          </div>
          
          {result.confidenceLevel && (
            <div 
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                result.confidenceLevel === 'high' ? 'bg-green-100 text-green-800' :
                result.confidenceLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}
              aria-label={`Confidence level: ${result.confidenceLevel}`}
            >
              {result.confidenceLevel} confidence
            </div>
          )}
          
          <Button
            onClick={() => onViewDetails(result.resumeId)}
            variant={expanded ? "default" : "outline"}
            className="ml-4"
            aria-expanded={expanded}
            aria-controls={`candidate-details-${result.resumeId}`}
          >
            {expanded ? "Hide Details" : "View Details"}
          </Button>
        </div>
      </div>
      
      {expanded && (
        <CardContent 
          className="p-6" 
          id={`candidate-details-${result.resumeId}`}
          role="region"
          aria-labelledby={`candidate-name-${result.resumeId}`}
        >
          {/* Match Summary Section */}
          <CandidateMatchSummary
            matchPercentage={result.matchPercentage}
            matchedSkills={result.matchedSkills}
            missingSkills={result.missingSkills}
            expanded={expanded}
            onToggleExpanded={() => onViewDetails(result.resumeId)}
          />
          
          {/* Skills and Experience Grid - Only show when expanded */}
          {expanded && (
            <SkillMatchDetails
              matchedSkills={result.matchedSkills}
              missingSkills={result.missingSkills}
              matchInsights={result.matchInsights}
              candidateStrengths={result.candidateStrengths}
              matchPercentage={result.matchPercentage}
              onGenerateInterviewQuestions={() => onGenerateQuestions(result.resumeId, jobId)}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}