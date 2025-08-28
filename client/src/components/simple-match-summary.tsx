/**
 * Simple Match Summary Component
 * Provides human-readable match explanation instead of complex percentages
 * Based on 2024 recruitment UX best practices for hiring managers
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface SimpleMatchSummaryProps {
  matchPercentage: number | null;
  matchedSkills: Array<{
    skill: string;
    matchPercentage?: number;
    category?: string;
  }>;
  candidateStrengths: string[];
  missingSkills?: string[];
  aiInsight?: string;
  experienceLevel?: string;
}

export default function SimpleMatchSummary({ 
  matchPercentage,
  matchedSkills,
  candidateStrengths,
  missingSkills = [],
  aiInsight,
  experienceLevel
}: SimpleMatchSummaryProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Determine match strength and message
  const getMatchStrength = (percentage: number | null) => {
    if (percentage === null) return { level: "Analysis Pending", color: "text-gray-700", bgColor: "bg-gray-50 border-gray-200" };
    if (percentage >= 85) return { level: "Excellent", color: "text-green-700", bgColor: "bg-green-50 border-green-200" };
    if (percentage >= 70) return { level: "Strong", color: "text-blue-700", bgColor: "bg-blue-50 border-blue-200" };
    if (percentage >= 55) return { level: "Good", color: "text-amber-700", bgColor: "bg-amber-50 border-amber-200" };
    return { level: "Potential", color: "text-gray-700", bgColor: "bg-gray-50 border-gray-200" };
  };

  const matchStrength = getMatchStrength(matchPercentage);

  // Extract key skills (top 5)
  const keySkills = matchedSkills.slice(0, 5).map(skill => 
    typeof skill === 'string' ? skill : skill.skill
  );

  // Get relevant experience from candidate strengths
  const experienceInsights = candidateStrengths.filter(strength => 
    strength.toLowerCase().includes('experience') || 
    strength.toLowerCase().includes('years') ||
    strength.toLowerCase().includes('background')
  ).slice(0, 2);

  // Generate AI insight or use first candidate strength as fallback
  const displayInsight = aiInsight || candidateStrengths[0] || "Profile shows relevant qualifications for this role";

  return (
    <Card className={`border-l-4 ${matchStrength.bgColor} border-l-current`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎯</span>
            <span>Match Summary</span>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-semibold ${matchStrength.bgColor} ${matchStrength.color}`}>
            {matchPercentage !== null ? `${matchPercentage}%` : 'N/A'} - {matchStrength.level} Candidate
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Primary Match Information */}
        <div className="space-y-3">
          
          {/* Key Skills */}
          {keySkills.length > 0 && (
            <div className="flex items-start gap-3">
              <span className="text-green-600 text-lg flex-shrink-0 mt-0.5">✅</span>
              <div>
                <span className="font-medium text-gray-900">Has key skills: </span>
                <span className="text-gray-700">{keySkills.join(', ')}</span>
                {matchedSkills.length > 5 && (
                  <span className="text-sm text-gray-500 ml-1">
                    +{matchedSkills.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* AI Insight */}
          <div className="flex items-start gap-3">
            <span className="text-blue-600 text-lg flex-shrink-0 mt-0.5">💡</span>
            <div>
              <span className="text-gray-700 italic">"{displayInsight}"</span>
            </div>
          </div>

          {/* Experience Level */}
          {experienceInsights.length > 0 && (
            <div className="space-y-2">
              {experienceInsights.map((insight, index) => (
                <div key={index} className="flex items-start gap-3">
                  <span className="text-green-600 text-lg flex-shrink-0 mt-0.5">✅</span>
                  <span className="text-gray-700">{insight}</span>
                </div>
              ))}
            </div>
          )}

          {/* Development Areas */}
          {missingSkills.length > 0 && (
            <div className="flex items-start gap-3">
              <span className="text-amber-600 text-lg flex-shrink-0 mt-0.5">📋</span>
              <div>
                <span className="font-medium text-gray-900">May benefit from training in: </span>
                <span className="text-gray-700">{missingSkills.slice(0, 3).join(', ')}</span>
                {missingSkills.length > 3 && (
                  <span className="text-sm text-gray-500 ml-1">
                    +{missingSkills.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Progressive Disclosure for Details */}
        <div className="pt-3 border-t border-gray-200">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-0 h-auto font-normal"
          >
            {showDetails ? 'Hide' : 'View'} detailed breakdown
          </Button>
        </div>

        {/* Detailed Breakdown (Progressive Disclosure) */}
        {showDetails && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border space-y-3">
            <h4 className="font-medium text-gray-900 text-sm">Detailed Analysis</h4>
            
            {/* All Matched Skills */}
            {matchedSkills.length > 0 && (
              <div>
                <h5 className="text-xs font-medium text-gray-700 mb-2">All Matching Skills ({matchedSkills.length})</h5>
                <div className="flex flex-wrap gap-1">
                  {matchedSkills.map((skill, index) => (
                    <Badge key={index} variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                      {typeof skill === 'string' ? skill : skill.skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* All Candidate Strengths */}
            {candidateStrengths.length > 0 && (
              <div>
                <h5 className="text-xs font-medium text-gray-700 mb-2">All Strengths</h5>
                <ul className="text-xs text-gray-600 space-y-1">
                  {candidateStrengths.map((strength, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-green-600 flex-shrink-0 mt-0.5">•</span>
                      {strength}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* All Missing Skills */}
            {missingSkills.length > 0 && (
              <div>
                <h5 className="text-xs font-medium text-gray-700 mb-2">All Development Areas ({missingSkills.length})</h5>
                <div className="flex flex-wrap gap-1">
                  {missingSkills.map((skill, index) => (
                    <Badge key={index} variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}