import { useLocation } from "wouter";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight, 
  Play, 
  Star, 
  Brain, 
  Shield, 
  MessageCircleQuestion,
  Clock,
  TrendingUp,
  Users,
  Zap,
  CheckCircle2,
  Target
} from "lucide-react";

export default function HomePage() {
  const [_, setLocation] = useLocation();

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow">
        {/* Enhanced Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50 py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="text-left">
                <Badge className="inline-flex items-center bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 mb-6">
                  <Target className="h-4 w-4 mr-2" />
                  85% Better Accuracy
                </Badge>
                <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                  AI-Powered Recruitment That 
                  <span className="text-primary block bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                    Eliminates Hiring Bias
                  </span>
                </h1>
                <p className="text-xl text-gray-600 mb-8 max-w-2xl leading-relaxed">
                  Advanced AI recruitment platform that analyzes resumes, detects unconscious bias, 
                  and matches candidates intelligently with 85% better accuracy than traditional methods.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 mb-8">
                  <Button 
                    size="lg" 
                    className="px-8 py-4 text-lg bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg"
                    onClick={() => setLocation("/upload")}
                  >
                    Start Free Trial 
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="px-8 py-4 text-lg border-2 hover:bg-gray-50"
                  >
                    <Play className="mr-2 h-5 w-5" />
                    Watch Demo
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600">
                  <div className="flex items-center">
                    <div className="flex -space-x-1 mr-2">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} className="h-4 w-4 text-yellow-400 fill-current" />
                      ))}
                    </div>
                    <span className="font-medium">4.9/5 rating</span>
                  </div>
                  <div className="flex items-center">
                    <Users className="h-4 w-4 mr-1 text-primary" />
                    <span>500+ companies trust us</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle2 className="h-4 w-4 mr-1 text-green-500" />
                    <span>No credit card required</span>
                  </div>
                </div>
              </div>
              <div className="relative">
                <div className="relative bg-white rounded-2xl shadow-2xl p-6 border">
                  <div className="bg-gradient-to-br from-primary/5 to-purple-500/5 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Resume Analysis</h3>
                      <Badge className="bg-green-100 text-green-800">Live Demo</Badge>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Skill Match</span>
                        <div className="flex items-center">
                          <div className="w-20 h-2 bg-gray-200 rounded-full mr-2">
                            <div className="w-17 h-2 bg-gradient-to-r from-primary to-green-500 rounded-full"></div>
                          </div>
                          <span className="text-sm font-medium text-primary">92%</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Experience</span>
                        <div className="flex items-center">
                          <div className="w-20 h-2 bg-gray-200 rounded-full mr-2">
                            <div className="w-16 h-2 bg-gradient-to-r from-primary to-blue-500 rounded-full"></div>
                          </div>
                          <span className="text-sm font-medium text-primary">87%</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Culture Fit</span>
                        <div className="flex items-center">
                          <div className="w-20 h-2 bg-gray-200 rounded-full mr-2">
                            <div className="w-18 h-2 bg-gradient-to-r from-primary to-purple-500 rounded-full"></div>
                          </div>
                          <span className="text-sm font-medium text-primary">95%</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 p-3 bg-white rounded-lg border">
                      <div className="flex items-center text-sm">
                        <Shield className="h-4 w-4 text-green-500 mr-2" />
                        <span className="text-gray-700">No bias detected • Fair evaluation</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Floating elements */}
                <div className="absolute -top-4 -right-4 bg-white rounded-lg shadow-lg p-3 border">
                  <div className="flex items-center text-sm">
                    <Zap className="h-4 w-4 text-yellow-500 mr-1" />
                    <span className="font-medium">Analyzed in 3.2s</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 bg-gradient-to-r from-primary to-purple-600 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div className="space-y-2">
                <div className="text-4xl font-bold">85%</div>
                <div className="text-blue-100">Better Accuracy</div>
              </div>
              <div className="space-y-2">
                <div className="text-4xl font-bold">75%</div>
                <div className="text-blue-100">Time Saved</div>
              </div>
              <div className="space-y-2">
                <div className="text-4xl font-bold">500+</div>
                <div className="text-blue-100">Companies</div>
              </div>
              <div className="space-y-2">
                <div className="text-4xl font-bold">50K+</div>
                <div className="text-blue-100">Resumes Analyzed</div>
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

            {/* Features Section */}
            <section className="max-w-6xl mx-auto mb-16">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                  How EvalMatch Transforms Your Hiring Process
                </h2>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  Powerful AI capabilities that revolutionize how you find, evaluate, and hire top talent
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <Card className="group hover:shadow-xl transition-all duration-300 border-0 shadow-lg hover:-translate-y-2">
                  <CardContent className="p-8 text-center">
                    <div className="bg-gradient-to-br from-primary/10 to-blue-100 p-4 rounded-2xl inline-block mb-6 group-hover:scale-110 transition-transform duration-300">
                      <Brain className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3 text-gray-900">Intelligent Resume Matching</h3>
                    <p className="text-gray-600 leading-relaxed">AI analyzes up to 100 resumes simultaneously using advanced NLP to match skills, experience, and qualifications with 85% accuracy.</p>
                    <div className="mt-4 inline-flex items-center text-primary text-sm font-medium">
                      Learn more <ArrowRight className="ml-1 h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="group hover:shadow-xl transition-all duration-300 border-0 shadow-lg hover:-translate-y-2">
                  <CardContent className="p-8 text-center">
                    <div className="bg-gradient-to-br from-green-100 to-emerald-100 p-4 rounded-2xl inline-block mb-6 group-hover:scale-110 transition-transform duration-300">
                      <Shield className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3 text-gray-900">Bias Detection & Prevention</h3>
                    <p className="text-gray-600 leading-relaxed">Automatically detects and eliminates unconscious bias in job descriptions and candidate evaluation, promoting diversity and inclusion.</p>
                    <div className="mt-4 inline-flex items-center text-green-600 text-sm font-medium">
                      Learn more <ArrowRight className="ml-1 h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="group hover:shadow-xl transition-all duration-300 border-0 shadow-lg hover:-translate-y-2">
                  <CardContent className="p-8 text-center">
                    <div className="bg-gradient-to-br from-purple-100 to-violet-100 p-4 rounded-2xl inline-block mb-6 group-hover:scale-110 transition-transform duration-300">
                      <MessageCircleQuestion className="h-8 w-8 text-purple-600" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3 text-gray-900">Custom Interview Questions</h3>
                    <p className="text-gray-600 leading-relaxed">Generate personalized, relevant interview questions based on candidate profiles and job requirements using multi-AI provider technology.</p>
                    <div className="mt-4 inline-flex items-center text-purple-600 text-sm font-medium">
                      Learn more <ArrowRight className="ml-1 h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Benefits Section */}
            <section className="max-w-6xl mx-auto mb-16">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                  Why HR Teams Love EvalMatch
                </h2>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  Transform your hiring process with AI-powered insights that save time and improve decisions
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card className="p-8 border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-start space-x-4">
                    <div className="bg-gradient-to-br from-blue-100 to-primary/20 p-3 rounded-xl">
                      <Clock className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold mb-4 text-gray-900">Save Time & Effort</h3>
                      <ul className="space-y-3">
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Review resumes in minutes, not hours</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Automatically rank candidates by best fit</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Generate interview questions instantly</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Focus on interviewing, not screening</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </Card>
                
                <Card className="p-8 border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-start space-x-4">
                    <div className="bg-gradient-to-br from-green-100 to-emerald-100 p-3 rounded-xl">
                      <TrendingUp className="h-6 w-6 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold mb-4 text-gray-900">Make Better Hiring Decisions</h3>
                      <ul className="space-y-3">
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">See exactly why candidates match job requirements</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Identify skill gaps and strengths clearly</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Compare candidates side-by-side objectively</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Reduce hiring mistakes with data-driven insights</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </Card>
                
                <Card className="p-8 border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-start space-x-4">
                    <div className="bg-gradient-to-br from-purple-100 to-violet-100 p-3 rounded-xl">
                      <Users className="h-6 w-6 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold mb-4 text-gray-900">Build Diverse Teams</h3>
                      <ul className="space-y-3">
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Detect and eliminate unconscious bias in job posts</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Ensure fair evaluation of all candidates</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Get suggestions for inclusive language</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Track diversity metrics across your hiring process</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </Card>
                
                <Card className="p-8 border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-start space-x-4">
                    <div className="bg-gradient-to-br from-orange-100 to-yellow-100 p-3 rounded-xl">
                      <Zap className="h-6 w-6 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold mb-4 text-gray-900">Easy to Use</h3>
                      <ul className="space-y-3">
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">No technical setup required</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Upload resumes in any format (PDF, Word, text)</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Get results in clear, easy-to-understand reports</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">Works on any device - desktop, tablet, or phone</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </Card>
              </div>
            </section>

            {/* FAQ Section */}
            <section className="max-w-6xl mx-auto mb-16">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                  What HR Professionals Are Asking About AI Recruitment
                </h2>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  Get instant answers to the most common questions about implementing AI in your hiring process
                </p>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="p-6 border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-start space-x-4">
                    <div className="bg-gradient-to-br from-primary/10 to-blue-100 p-2 rounded-lg flex-shrink-0">
                      <MessageCircleQuestion className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3">
                        "How can AI help me reduce hiring bias?"
                      </h3>
                      <p className="text-gray-600 leading-relaxed">
                        EvalMatch automatically detects biased language in job descriptions, evaluates candidates based on skills rather than demographics, and provides objective scoring that eliminates unconscious bias from your hiring decisions.
                      </p>
                    </div>
                  </div>
                </Card>
                
                <Card className="p-6 border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-start space-x-4">
                    <div className="bg-gradient-to-br from-green-100 to-emerald-100 p-2 rounded-lg flex-shrink-0">
                      <Target className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3">
                        "What's the best AI tool for screening resumes?"
                      </h3>
                      <p className="text-gray-600 leading-relaxed">
                        EvalMatch uses multiple AI models to analyze resumes with 85% accuracy, ranking candidates by job fit and highlighting relevant skills and experience that match your requirements.
                      </p>
                    </div>
                  </div>
                </Card>
                
                <Card className="p-6 border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-start space-x-4">
                    <div className="bg-gradient-to-br from-purple-100 to-violet-100 p-2 rounded-lg flex-shrink-0">
                      <Users className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3">
                        "Can AI recruitment tools help with diversity hiring?"
                      </h3>
                      <p className="text-gray-600 leading-relaxed">
                        Yes, AI removes human bias from initial screening, focuses purely on qualifications, suggests inclusive job description language, and helps you build more diverse candidate pools through fair evaluation.
                      </p>
                    </div>
                  </div>
                </Card>
                
                <Card className="p-6 border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-start space-x-4">
                    <div className="bg-gradient-to-br from-orange-100 to-yellow-100 p-2 rounded-lg flex-shrink-0">
                      <Clock className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3">
                        "How much time does AI recruitment actually save?"
                      </h3>
                      <p className="text-gray-600 leading-relaxed">
                        HR teams typically save 75% of their screening time. Instead of spending hours reviewing each resume, you get instant candidate rankings and can focus your time on interviewing the most qualified candidates.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </section>

            {/* Final CTA Section */}
            <section className="py-20 bg-gradient-to-r from-primary to-purple-600 text-white rounded-3xl mx-auto max-w-6xl mb-12">
              <div className="max-w-4xl mx-auto text-center px-8">
                <h2 className="text-4xl font-bold mb-6">
                  Ready to Transform Your Hiring Process?
                </h2>
                <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
                  Join 500+ companies using AI to eliminate bias and find the best candidates faster than ever before.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
                  <Button 
                    size="lg" 
                    variant="secondary" 
                    className="px-8 py-4 bg-white text-primary hover:bg-gray-100 text-lg font-semibold"
                    onClick={() => setLocation("/upload")}
                  >
                    Start Free Trial - No Credit Card Required
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline" 
                    className="px-8 py-4 border-white text-white hover:bg-white hover:text-primary text-lg"
                  >
                    <Play className="mr-2 h-5 w-5" />
                    Schedule Demo
                  </Button>
                </div>
                <div className="text-sm opacity-80 space-y-1">
                  <div>✅ Free 7-day trial • ✅ Cancel anytime • ✅ Full features included</div>
                  <div>🚀 Get results in minutes • 🎯 85% accuracy guaranteed</div>
                </div>
              </div>
            </section>
          </div>
      </main>
      
      <Footer />
    </div>
  );
}
