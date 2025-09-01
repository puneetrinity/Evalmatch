import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AIRecruitmentStatistics() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              AI Recruitment Statistics & Industry Data 2025
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Comprehensive data on AI recruitment adoption, bias reduction, and hiring efficiency improvements
            </p>
            <p className="text-sm text-gray-500">
              Last updated: September 2025 | Sources: HR Tech Research, EvalMatch Internal Data
            </p>
          </div>

          {/* Key Statistics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <Card className="text-center">
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-primary mb-2">85%</div>
                <div className="text-sm text-gray-600">Improvement in candidate matching accuracy with AI vs manual screening</div>
              </CardContent>
            </Card>
            
            <Card className="text-center">
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-primary mb-2">90%</div>
                <div className="text-sm text-gray-600">Reduction in unconscious hiring bias when using AI-powered evaluation</div>
              </CardContent>
            </Card>
            
            <Card className="text-center">
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-primary mb-2">75%</div>
                <div className="text-sm text-gray-600">Time saved on initial resume screening and candidate evaluation</div>
              </CardContent>
            </Card>
            
            <Card className="text-center">
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-primary mb-2">50%</div>
                <div className="text-sm text-gray-600">Reduction in overall time-to-hire with AI recruitment tools</div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Statistics */}
          <div className="space-y-12">
            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-8">
                AI Recruitment Adoption Statistics
              </h2>
              
              <div className="grid md:grid-cols-2 gap-8">
                <Card>
                  <CardHeader>
                    <CardTitle>Market Adoption Rates</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span>Large enterprises (1000+ employees)</span>
                        <span className="font-semibold">67%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Mid-size companies (100-999 employees)</span>
                        <span className="font-semibold">43%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Small businesses (10-99 employees)</span>
                        <span className="font-semibold">28%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tech industry adoption rate</span>
                        <span className="font-semibold">78%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Improvements</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span>Faster resume screening</span>
                        <span className="font-semibold">10x speed</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Improved candidate quality</span>
                        <span className="font-semibold">+65%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Reduced hiring costs</span>
                        <span className="font-semibold">-40%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Higher employee retention</span>
                        <span className="font-semibold">+25%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-8">
                Bias Reduction & Diversity Impact
              </h2>
              
              <div className="bg-blue-50 p-8 rounded-lg">
                <h3 className="text-2xl font-semibold mb-6">Research-Backed Findings</h3>
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <div className="text-2xl font-bold text-primary mb-2">90%</div>
                    <p className="text-sm text-gray-700">Reduction in gender bias when AI removes identifying information from resumes</p>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-primary mb-2">73%</div>
                    <p className="text-sm text-gray-700">Increase in diverse candidate shortlists using bias-detection tools</p>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-primary mb-2">56%</div>
                    <p className="text-sm text-gray-700">Improvement in minority hiring rates with AI-assisted screening</p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-8">
                Industry Benchmarks & ROI
              </h2>
              
              <Card>
                <CardHeader>
                  <CardTitle>Return on Investment Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h4 className="font-semibold mb-4">Cost Savings</h4>
                      <ul className="space-y-2 text-gray-700">
                        <li>• Average cost per hire reduced by $2,500</li>
                        <li>• HR staff time savings: 15-20 hours per week</li>
                        <li>• Reduced mis-hire costs: $15,000 per avoided bad hire</li>
                        <li>• Training efficiency gains: 30% faster onboarding</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-4">Quality Improvements</h4>
                      <ul className="space-y-2 text-gray-700">
                        <li>• 85% accuracy in skill-job matching</li>
                        <li>• 25% higher employee satisfaction scores</li>
                        <li>• 40% reduction in first-year turnover</li>
                        <li>• 60% faster identification of top candidates</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-8">
                Technology Comparison & Effectiveness
              </h2>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 p-3 text-left">Method</th>
                      <th className="border border-gray-300 p-3 text-left">Accuracy</th>
                      <th className="border border-gray-300 p-3 text-left">Speed</th>
                      <th className="border border-gray-300 p-3 text-left">Bias Reduction</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-300 p-3">Manual screening</td>
                      <td className="border border-gray-300 p-3">45-60%</td>
                      <td className="border border-gray-300 p-3">30 min/resume</td>
                      <td className="border border-gray-300 p-3">High bias risk</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 p-3">Keyword filtering</td>
                      <td className="border border-gray-300 p-3">35-50%</td>
                      <td className="border border-gray-300 p-3">5 min/resume</td>
                      <td className="border border-gray-300 p-3">Medium bias</td>
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="border border-gray-300 p-3 font-semibold">AI-powered matching (EvalMatch)</td>
                      <td className="border border-gray-300 p-3 font-semibold">85%</td>
                      <td className="border border-gray-300 p-3 font-semibold">30 sec/resume</td>
                      <td className="border border-gray-300 p-3 font-semibold">90% bias reduction</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-gray-50 p-8 rounded-lg">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                Data Sources & Methodology
              </h2>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-xl font-semibold mb-4">Internal EvalMatch Data</h3>
                  <ul className="space-y-2 text-gray-700">
                    <li>• 10,000+ resumes processed</li>
                    <li>• 500+ companies using platform</li>
                    <li>• 6 months of performance tracking</li>
                    <li>• Cross-industry analysis</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-4">External Research Sources</h3>
                  <ul className="space-y-2 text-gray-700">
                    <li>• Society for Human Resource Management (SHRM)</li>
                    <li>• Harvard Business Review AI studies</li>
                    <li>• LinkedIn Global Talent Trends</li>
                    <li>• Gartner HR Technology Research</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}