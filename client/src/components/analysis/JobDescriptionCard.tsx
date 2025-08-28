import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface JobData {
  id: number;
  title: string;
  description: string;
  createdAt: string;
  analyzedData: {
    requiredSkills: string[];
    preferredSkills: string[];
    experienceLevel: string;
    responsibilities: string[];
    summary: string;
  };
}

interface JobDescriptionCardProps {
  jobData: JobData | undefined;
  isJobLoading: boolean;
  shouldShowJobError: boolean;
  onNavigateToJobDescriptions: () => void;
}

export default function JobDescriptionCard({
  jobData,
  isJobLoading,
  shouldShowJobError,
  onNavigateToJobDescriptions
}: JobDescriptionCardProps) {
  if (shouldShowJobError) {
    return (
      <Alert variant="destructive" className="mb-6">
        <AlertTitle>Job Description Not Found</AlertTitle>
        <AlertDescription>
          The job description you're looking for doesn't exist or has been deleted.
          <div className="mt-4">
            <Button onClick={onNavigateToJobDescriptions}>
              Go to Job Descriptions
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (isJobLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <Card>
        <CardHeader>
          <CardTitle>{jobData?.title || 'Job Description'}</CardTitle>
          <CardDescription>
            Analysis of candidate resumes against this job description
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}