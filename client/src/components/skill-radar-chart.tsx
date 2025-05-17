import { useMemo } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { useIsMobile } from '@/hooks/use-mobile';

interface SkillRadarChartProps {
  matchedSkills: Array<{ skill: string; matchPercentage: number }>;
  height?: number;
}

export default function SkillRadarChart({ matchedSkills, height = 300 }: SkillRadarChartProps) {
  const isMobile = useIsMobile();
  
  // Format data for the radar chart - use top 5 skills
  const chartData = useMemo(() => {
    // Log to help debug
    console.log('Skills data received by chart:', matchedSkills);
    
    // Validate and normalize skills data
    const validSkills = matchedSkills.filter(item => {
      // Ensure we have both a skill name and percentage
      return (
        typeof item === 'object' && 
        item !== null && 
        typeof item.skill === 'string' && 
        typeof item.matchPercentage === 'number'
      );
    });
    
    // Sort skills by match percentage
    const sortedSkills = [...validSkills].sort((a, b) => b.matchPercentage - a.matchPercentage);
    
    // Take top 5 or fewer if less than 5 skills
    const topSkills = sortedSkills.slice(0, 5);
    
    // Create data format for radar chart
    return topSkills.map(({ skill, matchPercentage }) => {
      // Ensure the skill name is not empty
      const skillName = skill || 'Unnamed Skill';
      
      return {
        skill: skillName,
        value: matchPercentage,
        fullMark: 100
      };
    });
  }, [matchedSkills]);
  
  // Don't render if no skills
  if (!matchedSkills || matchedSkills.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No skill data available
      </div>
    );
  }
  
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
        <PolarGrid />
        <PolarAngleAxis 
          dataKey="skill" 
          tick={{ fontSize: isMobile ? 10 : 12, fill: '#666', width: 100 }}
          // Format skill names to be more readable
          tickFormatter={(value) => {
            // If skill name contains "Unknown Skill", replace with better label
            if (value.includes("Unknown Skill")) {
              return "Skill " + value.split(" ").pop();
            }
            
            // If too long, truncate with ellipsis
            if (value.length > 14) {
              return `${value.substring(0, 14)}...`;
            }
            
            return value;
          }}
        />
        <PolarRadiusAxis angle={90} domain={[0, 100]} />
        <Radar 
          name="Skill Match" 
          dataKey="value" 
          stroke="#15803d" 
          fill="#22c55e" 
          fillOpacity={0.5} 
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}