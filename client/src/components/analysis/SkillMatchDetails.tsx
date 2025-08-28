import { Button } from "@/components/ui/button";
import SkillRadarChart from "@/components/skill-radar-chart";
import type { MatchedSkill, MatchInsights } from "@shared/api-contracts";

interface SkillMatchDetailsProps {
  matchedSkills: MatchedSkill[];
  missingSkills: string[];
  matchInsights?: MatchInsights;
  candidateStrengths: string[];
  matchPercentage: number | null;
  onGenerateInterviewQuestions: () => void;
}

export default function SkillMatchDetails({
  matchedSkills,
  missingSkills,
  matchInsights,
  candidateStrengths,
  matchPercentage,
  onGenerateInterviewQuestions
}: SkillMatchDetailsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Key Skills</h4>
        <div className="space-y-4">
          {matchedSkills && matchedSkills.slice(0, 5).map((skill: any, index: number) => {
            // Extract skill name and match percentage
            const skillName = typeof skill === 'string' 
              ? skill 
              : (skill && typeof skill === 'object' && skill.skill && typeof skill.skill === 'string') 
                ? skill.skill 
                : `Relevant Skill ${index + 1}`;
                
            const matchPercentageValue = (skill && typeof skill === 'object' && typeof skill.matchPercentage === 'number') 
              ? skill.matchPercentage 
              : 85;
            
            return (
              <div key={index} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-900">{skillName}</span>
                  <span className="text-sm font-semibold text-green-600">
                    {matchPercentageValue}% match
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2" role="progressbar" aria-valuenow={matchPercentageValue} aria-valuemin={0} aria-valuemax={100} aria-label={`${skillName} match percentage`}>
                  <div 
                    className="bg-green-500 rounded-full h-full transition-all duration-300" 
                    style={{ width: `${matchPercentageValue}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Add Radar Chart for skills visualization */}
        <div className="mt-6">
          <h5 className="text-sm font-semibold text-gray-600 mb-3">Skill Match Visualization</h5>
          <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
            <SkillRadarChart 
              matchedSkills={
                Array.isArray(matchedSkills) 
                  ? matchedSkills.map(skill => {
                      // Log individual skill for debugging
                      console.log('Processing skill for radar chart:', skill);
                      
                      // Handle different formats of skill data
                      if (typeof skill === 'string') {
                        return { skill, matchPercentage: 100 };
                      }
                      
                      if (skill && typeof skill === 'object') {
                        // Get skill name, prefer skill property, fall back to other properties
                        let skillName;
                        if (typeof skill.skill === 'string' && skill.skill.trim() !== '') {
                          skillName = skill.skill;
                        } else if (typeof (skill as any).name === 'string' && (skill as any).name.trim() !== '') {
                          skillName = (skill as any).name;
                        } else if (typeof (skill as any).skill_name === 'string' && (skill as any).skill_name.trim() !== '') {
                          skillName = (skill as any).skill_name;
                        } else {
                          skillName = 'Unnamed Skill';
                        }
                        
                        // Get match percentage, prefer matchPercentage property, fall back to other properties
                        let matchPct;
                        if (typeof skill.matchPercentage === 'number') {
                          matchPct = skill.matchPercentage;
                        } else if (typeof (skill as any).match_percentage === 'number') {
                          matchPct = (skill as any).match_percentage;
                        } else {
                          matchPct = 100;
                        }
                        
                        return { 
                          skill: skillName,
                          matchPercentage: matchPct
                        };
                      }
                      
                      return { skill: 'Unnamed Skill', matchPercentage: 0 };
                    })
                  : []
              } 
              height={240} 
            />
          </div>
        </div>
      </div>
      
      <div>
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Experience & Missing Skills</h4>
        
        {/* Experience Summary */}
        <div className="mb-6">
          <p className="text-gray-800 font-medium">
            Strong skill alignment with <span className="font-semibold">{matchedSkills?.length || 0} matching requirements</span>
          </p>
        </div>
        
        {/* Missing Skills */}
        {missingSkills?.length > 0 && (
          <div className="mb-6">
            <h5 className="text-sm font-medium text-gray-700 mb-3">Missing Skills</h5>
            <div className="flex flex-wrap gap-2" role="list" aria-label="Missing skills">
              {missingSkills.map((skill, index) => (
                <span 
                  key={index} 
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-sm font-medium"
                  role="listitem"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
          
        {/* AI Generated Content Section */}
        <div className="mt-8 pt-6 border-t border-gray-200 space-y-4">
          {/* AI Generated Label */}
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 text-gray-400">
              <svg fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
            <span className="text-sm text-gray-500 font-medium" aria-label="This content was generated by artificial intelligence">AI-generated content</span>
          </div>
          
          {/* Candidate Summary */}
          <div className="max-w-2xl">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Candidate Summary</h4>
              <p className="text-sm text-gray-700 leading-relaxed">
                {matchInsights?.summary || 
                 (() => {
                   // Dynamic candidate assessment based on match percentage
                   const getMatchStrengthText = (percentage: number) => {
                     if (percentage >= 85) return 'Exceptional candidate';
                     if (percentage >= 70) return 'Strong candidate';
                     if (percentage >= 55) return 'Viable candidate';
                     return 'Potential candidate';
                   };
                   
                   const strengthText = getMatchStrengthText(matchPercentage || 0);
                   const keySkills = matchedSkills?.slice(0, 3).map(s => typeof s === 'string' ? s : s.skill).join(', ') || 'various skills';
                   const strengthNote = candidateStrengths?.length > 0 ? 'Notable strengths: ' + candidateStrengths[0] : '';
                   
                   return `${strengthText}${matchPercentage !== null ? ` with ${matchPercentage}% match` : ' - analysis pending'}. Key skills include ${keySkills}. ${strengthNote}`;
                 })()}
              </p>
            </div>
          </div>
          
          {/* Interview Button */}
          <div className="flex justify-start">
            <Button 
              onClick={onGenerateInterviewQuestions}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3"
            >
              Generate Interview Questions
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}