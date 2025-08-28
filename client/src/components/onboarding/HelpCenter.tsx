import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { HelpCircle, BookOpen, MessageCircle, LifeBuoy } from 'lucide-react';

export function HelpCenter({ triggerButton }: { triggerButton?: React.ReactNode }) {
  const [isFullGuideOpen, setIsFullGuideOpen] = useState(false);
  
  return (
    <>
      <Dialog open={isFullGuideOpen} onOpenChange={setIsFullGuideOpen}>
        {triggerButton ? (
          <DialogTrigger asChild>
            {triggerButton}
          </DialogTrigger>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="fixed bottom-4 right-4 rounded-full w-12 h-12 shadow-lg bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => setIsFullGuideOpen(true)}
          >
            <HelpCircle className="h-6 w-6" />
          </Button>
        )}
        
        <DialogContent className="max-w-4xl h-[80vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-2xl font-bold">EvalMatchAI Help Center</DialogTitle>
            <DialogDescription>
              Find answers to common questions and learn how to use EvalMatchAI
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="quickHelp" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="px-6 mb-2 justify-start">
              <TabsTrigger value="quickHelp" className="flex items-center gap-1">
                <LifeBuoy className="h-4 w-4" />
                <span>Quick Help</span>
              </TabsTrigger>
              <TabsTrigger value="userGuide" className="flex items-center gap-1">
                <BookOpen className="h-4 w-4" />
                <span>User Guide</span>
              </TabsTrigger>
              <TabsTrigger value="faq" className="flex items-center gap-1">
                <MessageCircle className="h-4 w-4" />
                <span>FAQ</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="quickHelp" className="flex-1 overflow-y-auto px-6 pb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <HelpCard 
                  title="Resume Upload" 
                  description="Upload and analyze candidate resumes" 
                  icon={<BookOpen className="h-4 w-4" />}
                  link="/upload"
                />
                <HelpCard 
                  title="Job Description" 
                  description="Create and manage job descriptions" 
                  icon={<BookOpen className="h-4 w-4" />}
                  link="/job-description"
                />
                <HelpCard 
                  title="Bias Detection" 
                  description="Identify and fix potentially biased language" 
                  icon={<BookOpen className="h-4 w-4" />}
                  link="/bias-detection"
                />
                <HelpCard 
                  title="Candidate Analysis" 
                  description="Match candidates to job openings" 
                  icon={<BookOpen className="h-4 w-4" />}
                  link="/analysis"
                />
                <HelpCard 
                  title="Interview Questions" 
                  description="Generate customized interview questions" 
                  icon={<BookOpen className="h-4 w-4" />}
                  link="/interview"
                />
                <HelpCard 
                  title="Restart Tutorial" 
                  description="Go through the onboarding steps again" 
                  icon={<BookOpen className="h-4 w-4" />}
                  onClick={() => {
                    localStorage.removeItem('hasSeenWelcome');
                    window.location.reload();
                  }}
                />
              </div>
            </TabsContent>
            
            <TabsContent value="userGuide" className="flex-1 overflow-y-auto px-6 pb-6">
              <h3 className="text-xl font-bold mb-4">Complete User Guide</h3>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="getting-started">
                  <AccordionTrigger>Getting Started</AccordionTrigger>
                  <AccordionContent>
                    <p className="mb-2">EvalMatchAI is a semantic matching platform that helps recruiters and hiring managers:</p>
                    <ul className="list-disc pl-6 mb-4 space-y-1">
                      <li>Analyze resumes and extract key information</li>
                      <li>Create and analyze job descriptions for potential bias</li>
                      <li>Match candidates to job openings with detailed skill gap analysis</li>
                      <li>Generate customized interview questions</li>
                    </ul>
                    <p>No login is required for the current version - the system uses session-based tracking.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="resume-upload">
                  <AccordionTrigger>Resume Upload</AccordionTrigger>
                  <AccordionContent>
                    <p className="mb-2"><strong>Supported Formats:</strong> DOCX, PDF, TXT</p>
                    
                    <p className="mb-2"><strong>Upload Steps:</strong></p>
                    <ol className="list-decimal pl-6 mb-4 space-y-1">
                      <li>Navigate to the Upload Page</li>
                      <li>Select Files: Click the upload area or drag and drop files</li>
                      <li>Initiate Upload: Click "Upload Resumes" button</li>
                      <li>Wait for Processing: The system will parse and analyze each resume</li>
                      <li>View Results: Once processing is complete, you'll see a summary of extracted information</li>
                    </ol>
                    
                    <p><strong>Resume Session Management:</strong> Resumes are grouped into "upload sessions". Each time you start a new upload, a new session is created. This helps you manage multiple candidate batches.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="job-description">
                  <AccordionTrigger>Job Description Management</AccordionTrigger>
                  <AccordionContent>
                    <p className="mb-2"><strong>Creating a Job Description:</strong></p>
                    <ol className="list-decimal pl-6 mb-4 space-y-1">
                      <li>Navigate to the Job Description Page</li>
                      <li>Enter Details: Title and full description text</li>
                      <li>Click "Create" to submit for analysis</li>
                      <li>Wait for Processing: The system will analyze the job requirements</li>
                    </ol>
                    
                    <p><strong>Note:</strong> Currently, job descriptions cannot be edited after creation. To make changes, create a new job description with your updates.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="bias-detection">
                  <AccordionTrigger>Bias Detection</AccordionTrigger>
                  <AccordionContent>
                    <p className="mb-2"><strong>Running Bias Analysis:</strong></p>
                    <ol className="list-decimal pl-6 mb-4 space-y-1">
                      <li>Navigate to Bias Detection in the navigation menu</li>
                      <li>Select a Job (if not pre-selected)</li>
                      <li>Click "Analyze for Bias" to initiate the analysis</li>
                      <li>Review Results: The system will highlight bias issues and suggestions</li>
                      <li>Apply the improved version if desired</li>
                    </ol>
                    
                    <p className="mb-2"><strong>Types of Bias Detected:</strong></p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Gender bias</li>
                      <li>Age bias</li>
                      <li>Cultural bias</li>
                      <li>Educational bias</li>
                      <li>Experience bias</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="candidate-matching">
                  <AccordionTrigger>Candidate-Job Matching</AccordionTrigger>
                  <AccordionContent>
                    <p className="mb-2"><strong>Running a Match Analysis:</strong></p>
                    <ol className="list-decimal pl-6 mb-4 space-y-1">
                      <li>Navigate to Analysis in the navigation menu</li>
                      <li>Select a Job from the available job descriptions</li>
                      <li>Wait for Results as the system analyzes all resumes</li>
                      <li>Review Matches: Candidates will be displayed in order of match percentage</li>
                    </ol>
                    
                    <p className="mb-2"><strong>Understanding Match Results:</strong></p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Overall match percentage</li>
                      <li>Matched skills (with individual match scores)</li>
                      <li>Missing skills</li>
                      <li>Candidate strengths</li>
                      <li>Candidate weaknesses</li>
                      <li>Fairness metrics</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="interview-questions">
                  <AccordionTrigger>Interview Question Generation</AccordionTrigger>
                  <AccordionContent>
                    <p className="mb-2"><strong>Generating Questions:</strong></p>
                    <ol className="list-decimal pl-6 mb-4 space-y-1">
                      <li>Navigate to Interview in the navigation menu</li>
                      <li>Select a Candidate from the list of analyzed resumes</li>
                      <li>Select a Job</li>
                      <li>Generate Questions: Click "Generate Interview Questions"</li>
                      <li>Review Questions: Four types of questions will be generated</li>
                    </ol>
                    
                    <p className="mb-2"><strong>Question Categories:</strong></p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Technical questions</li>
                      <li>Experience questions</li>
                      <li>Skill gap questions</li>
                      <li>Inclusion questions</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>
            
            <TabsContent value="faq" className="flex-1 overflow-y-auto px-6 pb-6">
              <h3 className="text-xl font-bold mb-4">Frequently Asked Questions</h3>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="faq-1">
                  <AccordionTrigger>How many resumes can I upload at once?</AccordionTrigger>
                  <AccordionContent>
                    You can upload up to 100 resumes in a single session.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="faq-2">
                  <AccordionTrigger>How long does resume analysis take?</AccordionTrigger>
                  <AccordionContent>
                    Typically 10-30 seconds per resume, depending on length and complexity.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="faq-3">
                  <AccordionTrigger>Can I export the analysis results?</AccordionTrigger>
                  <AccordionContent>
                    Currently, results must be copied manually. Export functionality is planned for a future update.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="faq-4">
                  <AccordionTrigger>How does the bias detection work?</AccordionTrigger>
                  <AccordionContent>
                    The system uses AI to identify language that may discourage diverse candidates from applying, based on extensive research on inclusive job descriptions.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="faq-5">
                  <AccordionTrigger>Is my data secure?</AccordionTrigger>
                  <AccordionContent>
                    Yes, all data is processed securely. Resumes and job descriptions are stored only on your instance and not shared with external parties.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="faq-6">
                  <AccordionTrigger>Can I delete resumes after uploading?</AccordionTrigger>
                  <AccordionContent>
                    The current version doesn't support deleting individual resumes. However, you can start a new upload session to work with a fresh batch of resumes.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="faq-7">
                  <AccordionTrigger>What AI models are used for analysis?</AccordionTrigger>
                  <AccordionContent>
                    TalentMate AI uses OpenAI's models as the primary provider, with Anthropic Claude as a secondary provider for certain analyses.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="p-4 border-t">
            <Button variant="ghost" onClick={() => setIsFullGuideOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface HelpCardProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  link?: string;
  onClick?: () => void;
}

function HelpCard({ title, description, icon, link, onClick }: HelpCardProps) {
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (link) {
      window.location.href = link;
    }
  };
  
  return (
    <div 
      className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-blue-100 text-blue-700 rounded-full">
          {icon || <HelpCircle className="h-4 w-4" />}
        </div>
        <div>
          <h3 className="font-semibold mb-1">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
    </div>
  );
}