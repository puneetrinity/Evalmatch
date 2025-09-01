import { useLocation } from "wouter";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
  const [_, setLocation] = useLocation();

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              AI-Powered Recruitment That Eliminates <span className="text-primary">Hiring Bias</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-12">
              Advanced AI recruitment platform that analyzes resumes, detects unconscious bias, and matches candidates intelligently with 85% better accuracy than traditional methods.
            </p>

            <section className="max-w-4xl mx-auto mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8 text-center">
                How EvalMatch Transforms Your Hiring Process
              </h2>
              
              <Card>
                <CardContent className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                    <div>
                      <div className="bg-primary/10 p-4 rounded-lg inline-block mb-4" aria-hidden="true">
                        <i className="fas fa-brain text-3xl text-primary"></i>
                      </div>
                      <h3 className="text-xl font-semibold mb-2">Intelligent Resume Matching</h3>
                      <p className="text-gray-600">AI analyzes up to 100 resumes simultaneously using advanced NLP to match skills, experience, and qualifications with 85% accuracy.</p>
                    </div>
                    
                    <div>
                      <div className="bg-primary/10 p-4 rounded-lg inline-block mb-4" aria-hidden="true">
                        <i className="fas fa-shield-alt text-3xl text-primary"></i>
                      </div>
                      <h3 className="text-xl font-semibold mb-2">Bias Detection & Prevention</h3>
                      <p className="text-gray-600">Automatically detects and eliminates unconscious bias in job descriptions and candidate evaluation, promoting diversity and inclusion.</p>
                    </div>
                    
                    <div>
                      <div className="bg-primary/10 p-4 rounded-lg inline-block mb-4" aria-hidden="true">
                        <i className="fas fa-question-circle text-3xl text-primary"></i>
                      </div>
                      <h3 className="text-xl font-semibold mb-2">Custom Interview Questions</h3>
                      <p className="text-gray-600">Generate personalized, relevant interview questions based on candidate profiles and job requirements using multi-AI provider technology.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Benefits Section */}
            <section className="max-w-4xl mx-auto mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8 text-center">
                Why HR Teams Love EvalMatch
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                <div>
                  <h3 className="text-xl font-semibold mb-4 text-primary">Save Time & Effort</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>• Review resumes in minutes, not hours</li>
                    <li>• Automatically rank candidates by best fit</li>
                    <li>• Generate interview questions instantly</li>
                    <li>• Focus on interviewing, not screening</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-xl font-semibold mb-4 text-primary">Make Better Hiring Decisions</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>• See exactly why candidates match job requirements</li>
                    <li>• Identify skill gaps and strengths clearly</li>
                    <li>• Compare candidates side-by-side objectively</li>
                    <li>• Reduce hiring mistakes with data-driven insights</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-xl font-semibold mb-4 text-primary">Build Diverse Teams</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>• Detect and eliminate unconscious bias in job posts</li>
                    <li>• Ensure fair evaluation of all candidates</li>
                    <li>• Get suggestions for inclusive language</li>
                    <li>• Track diversity metrics across your hiring process</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-xl font-semibold mb-4 text-primary">Easy to Use</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>• No technical setup required</li>
                    <li>• Upload resumes in any format (PDF, Word, text)</li>
                    <li>• Get results in clear, easy-to-understand reports</li>
                    <li>• Works on any device - desktop, tablet, or phone</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Conversational AI-Optimized Content */}
            <section className="max-w-4xl mx-auto mb-12 bg-gradient-to-r from-blue-50 to-purple-50 p-8 rounded-lg">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  What HR Professionals Are Asking About AI Recruitment
                </h2>
                <p className="text-gray-600">
                  Get instant answers to the most common questions about implementing AI in your hiring process
                </p>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <h3 className="font-semibold text-primary mb-2">
                    "How can AI help me reduce hiring bias?"
                  </h3>
                  <p className="text-sm text-gray-700">
                    EvalMatch automatically detects biased language in job descriptions, evaluates candidates based on skills rather than demographics, and provides objective scoring that eliminates unconscious bias from your hiring decisions.
                  </p>
                </div>
                
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <h3 className="font-semibold text-primary mb-2">
                    "What's the best AI tool for screening resumes?"
                  </h3>
                  <p className="text-sm text-gray-700">
                    EvalMatch uses multiple AI models to analyze resumes with 85% accuracy, ranking candidates by job fit and highlighting relevant skills and experience that match your requirements.
                  </p>
                </div>
                
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <h3 className="font-semibold text-primary mb-2">
                    "Can AI recruitment tools help with diversity hiring?"
                  </h3>
                  <p className="text-sm text-gray-700">
                    Yes, AI removes human bias from initial screening, focuses purely on qualifications, suggests inclusive job description language, and helps you build more diverse candidate pools through fair evaluation.
                  </p>
                </div>
                
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <h3 className="font-semibold text-primary mb-2">
                    "How much time does AI recruitment actually save?"
                  </h3>
                  <p className="text-sm text-gray-700">
                    HR teams typically save 75% of their screening time. Instead of spending hours reviewing each resume, you get instant candidate rankings and can focus your time on interviewing the most qualified candidates.
                  </p>
                </div>
              </div>
            </section>

            <Button 
              className="mt-12 px-10 py-6 text-lg"
              onClick={() => setLocation("/upload")}
            >
              Start Free Trial <i className="fas fa-rocket ml-2" aria-hidden="true"></i>
            </Button>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
