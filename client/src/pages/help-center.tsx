import React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Layout from "@/components/layout";

export default function HelpCenterPage() {
  return (
    <Layout>
      <div className="py-8 px-4 mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">Help Center</h1>
        
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
                <AccordionItem value="item-1">
                  <AccordionTrigger>What file formats are supported for resume uploads?</AccordionTrigger>
                  <AccordionContent>
                    We recommend PDF files for the best extraction quality. We also support DOC, DOCX, and TXT files, but PDF provides the most reliable results.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="item-2">
                  <AccordionTrigger>How accurate is the skill matching?</AccordionTrigger>
                  <AccordionContent>
                    Our AI uses advanced natural language processing to identify both explicit skills and implied competencies from your resume. The matching algorithm normalizes different terms for the same skill (e.g., "JavaScript" and "JS") and uses contextual understanding to evaluate your experience level.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="item-3">
                  <AccordionTrigger>Is my resume data secure?</AccordionTrigger>
                  <AccordionContent>
                    Yes, we take data security seriously. Your resume data is encrypted and only processed for the specific analysis you request. We do not share your personal information with third parties or use it for purposes beyond providing our service to you.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="item-4">
                  <AccordionTrigger>How does the bias detection work?</AccordionTrigger>
                  <AccordionContent>
                    Our bias detection system analyzes job descriptions for potentially biased language related to age, gender, race, and other protected characteristics. It identifies problematic phrases and suggests more inclusive alternatives.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="item-5">
                  <AccordionTrigger>Can I use this for multiple job applications?</AccordionTrigger>
                  <AccordionContent>
                    Absolutely! You can upload your resume once and compare it against multiple job descriptions. This helps you identify which positions are the best match for your skills and experience, and helps you tailor your applications accordingly.
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