/**
 * Match Explanation Card Component
 * Provides detailed breakdown of match percentage calculation
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface MatchExplanationProps {
  matchPercentage: number;
  scoringDimensions: {
    skills: number;
    experience: number;
    education: number;
    semantic: number;
    overall: number;
  };
  matchedSkillsCount: number;
  totalRequiredSkills?: number;
}

export default function MatchExplanationCard({ 
  matchPercentage, 
  scoringDimensions, 
  matchedSkillsCount,
  totalRequiredSkills = 10 
}: MatchExplanationProps) {
  // Scoring weights from backend
  const weights = {
    skills: 50,      // 50%
    experience: 35,  // 35%
    education: 15,   // 15%
  };

  // Calculate contributions to final score
  const contributions = {
    skills: (scoringDimensions.skills * weights.skills) / 100,
    experience: (scoringDimensions.experience * weights.experience) / 100,
    education: (scoringDimensions.education * weights.education) / 100,
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-50";
    if (score >= 60) return "text-amber-600 bg-amber-50";
    return "text-red-600 bg-red-50";
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
            <path d="M9 12l2 2 4-4"/>
            <path d="M21 12c.552 0 1-.448 1-1s-.448-1-1-1-1 .448-1 1 .448 1 1 1"/>
            <path d="M3 12c.552 0 1-.448 1-1s-.448-1-1-1-1 .448-1 1 .448 1 1 1"/>
            <path d="m15.71 15.71 2.3 2.29"/>
            <path d="m8.29 8.29-2.3-2.29"/>
          </svg>
          Match Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Score */}
        <div className="bg-gray-50 rounded-lg p-4 border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Overall Match Score</span>
            <span className={`text-2xl font-bold px-3 py-1 rounded-lg ${getScoreColor(matchPercentage)}`}>
              {matchPercentage}%
            </span>
          </div>
          <p className="text-xs text-gray-600">
            Based on weighted analysis of skills, experience, and education requirements
          </p>
        </div>

        {/* Score Breakdown */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Score Components</h4>
          
          {/* Skills Score */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Skills Match</span>
                <span className="text-xs text-gray-500">({weights.skills}% weight)</span>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold ${getScoreColor(scoringDimensions.skills).split(' ')[0]}`}>
                  {scoringDimensions.skills}%
                </span>
                <div className="text-xs text-gray-500">
                  +{contributions.skills.toFixed(1)} points
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Progress 
                value={scoringDimensions.skills} 
                className="flex-1 h-2"
              />
              <span className="text-xs text-gray-500 min-w-[60px]">
                {matchedSkillsCount}/{totalRequiredSkills} skills
              </span>
            </div>
          </div>

          {/* Experience Score */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Experience</span>
                <span className="text-xs text-gray-500">({weights.experience}% weight)</span>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold ${getScoreColor(scoringDimensions.experience).split(' ')[0]}`}>
                  {scoringDimensions.experience}%
                </span>
                <div className="text-xs text-gray-500">
                  +{contributions.experience.toFixed(1)} points
                </div>
              </div>
            </div>
            <Progress 
              value={scoringDimensions.experience} 
              className="h-2"
            />
          </div>

          {/* Education Score */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Education</span>
                <span className="text-xs text-gray-500">({weights.education}% weight)</span>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold ${getScoreColor(scoringDimensions.education).split(' ')[0]}`}>
                  {scoringDimensions.education}%
                </span>
                <div className="text-xs text-gray-500">
                  +{contributions.education.toFixed(1)} points
                </div>
              </div>
            </div>
            <Progress 
              value={scoringDimensions.education} 
              className="h-2"
            />
          </div>
        </div>

        {/* Calculation Summary */}
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
          <div className="text-xs text-blue-800">
            <strong>Calculation:</strong> {contributions.skills.toFixed(1)} + {contributions.experience.toFixed(1)} + {contributions.education.toFixed(1)} = {matchPercentage}%
          </div>
        </div>
      </CardContent>
    </Card>
  );
}