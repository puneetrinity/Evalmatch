import { getInitials, stringToColor } from "@/lib/file-utils";

interface CandidateAvatarProps {
  candidateName?: string;
  filename: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-8 w-8 text-sm",
  md: "h-12 w-12 text-xl",
  lg: "h-16 w-16 text-2xl"
};

export default function CandidateAvatar({ 
  candidateName, 
  filename, 
  size = "md" 
}: CandidateAvatarProps) {
  const displayName = candidateName || filename;
  
  return (
    <div 
      className={`${sizeClasses[size]} rounded-full ${stringToColor(displayName)} flex items-center justify-center font-bold`}
    >
      {getInitials(displayName)}
    </div>
  );
}