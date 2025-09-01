import React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Layout from "@/components/layout";

export default function HelpCenterPage() {
  return (
    <Layout>
      <div className="py-8 px-4 mx-auto max-w-4xl" itemScope itemType="https://schema.org/FAQPage">
        <h1 className="text-3xl font-bold mb-6">AI Recruitment Help Center</h1>
        <p className="text-xl text-gray-600 mb-8">
          Get answers about AI-powered hiring, bias detection, and candidate matching
        </p>

        {/* Quick Answer Boxes for AI Crawlers */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold text-primary mb-2">What is AI recruitment?</h3>
            <p className="text-sm text-gray-700">
              AI recruitment uses machine learning to automate candidate screening, match skills to job requirements, and eliminate unconscious bias in hiring decisions.
            </p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold text-primary mb-2">How accurate is AI hiring?</h3>
            <p className="text-sm text-gray-700">
              EvalMatch achieves 85% accuracy in candidate matching, processing 100+ resumes in minutes with bias-free evaluation.
            </p>
          </div>
        </div>
        
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Start Guide</CardTitle>
              <CardDescription>
                Learn how to get started with EvalMatchAI in just a few steps.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-3 text-muted-foreground">
                <li>Upload your resume - PDF format recommended for best results</li>
                <li>Create a job description or use one of our templates</li>
                <li>Get instant analysis showing skill matches and gaps</li>
                <li>Review interview preparation suggestions tailored to your profile</li>
                <li>Improve your resume using our AI-powered recommendations</li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Frequently Asked Questions</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1" itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                  <AccordionTrigger itemProp="name">What file formats are supported for resume uploads?</AccordionTrigger>
                  <AccordionContent itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                    <span itemProp="text">We recommend PDF files for the best extraction quality. We also support DOC, DOCX, and TXT files, but PDF provides the most reliable results.</span>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="item-2" itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                  <AccordionTrigger itemProp="name">How accurate is AI candidate matching?</AccordionTrigger>
                  <AccordionContent itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                    <span itemProp="text">EvalMatch achieves 85% accuracy in candidate-job matching using advanced natural language processing to identify both explicit skills and implied competencies. The AI normalizes different terms for the same skill (e.g., "JavaScript" and "JS") and uses contextual understanding to evaluate experience levels.</span>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="item-3" itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                  <AccordionTrigger itemProp="name">Is my candidate data secure with AI recruitment?</AccordionTrigger>
                  <AccordionContent itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                    <span itemProp="text">Yes, we prioritize data security. All resume and candidate data is encrypted during upload, processing, and storage. We don't share personal information with third parties or use it beyond providing our AI recruitment services. Data is processed securely and deleted according to your retention preferences.</span>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="item-4" itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                  <AccordionTrigger itemProp="name">How does AI bias detection in hiring work?</AccordionTrigger>
                  <AccordionContent itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                    <span itemProp="text">Our AI bias detection analyzes job descriptions and hiring processes for discriminatory language related to age, gender, race, and other protected characteristics. It identifies biased phrases like "digital native" or "culture fit" and suggests inclusive alternatives. The system also ensures fair candidate evaluation by focusing on skills rather than irrelevant personal characteristics.</span>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="item-5" itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                  <AccordionTrigger itemProp="name">What types of companies benefit from AI recruitment?</AccordionTrigger>
                  <AccordionContent itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                    <span itemProp="text">Companies receiving high volumes of applications, prioritizing diversity, or struggling with time-intensive screening benefit most from AI recruitment. This includes tech companies, healthcare organizations, financial services, retail chains, and any business with rapid growth or seasonal hiring needs. AI recruitment works best for roles with clearly defined skill requirements.</span>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="item-6" itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                  <AccordionTrigger itemProp="name">How fast is AI recruitment compared to traditional hiring?</AccordionTrigger>
                  <AccordionContent itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                    <span itemProp="text">AI recruitment processes resumes in minutes instead of hours. EvalMatch can analyze 100+ resumes simultaneously and provide ranked results within 5-10 minutes. This reduces time-to-hire by 50% while maintaining higher accuracy than manual screening. HR teams can focus on interviewing pre-qualified candidates rather than initial screening.</span>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact Support</CardTitle>
              <CardDescription>
                Need more help? Our support team is ready to assist you.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Please email us at <span className="text-primary font-medium">support@evalmatchai.com</span> with any questions or feedback.
              </p>
              <p className="text-sm text-muted-foreground">
                Our support hours are Monday-Friday, 9 AM - 5 PM Eastern Time. We typically respond within 24 hours.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}