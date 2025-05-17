import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";

export default function PrivacyPolicy() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
        
        <div className="prose prose-slate max-w-none">
          <p className="text-lg mb-4">Last Updated: {new Date().toLocaleDateString()}</p>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
            <p>
              At TalentMate AI ("we", "our", or "us"), we respect your privacy and are committed to protecting 
              your personal data. This privacy policy explains how we collect, use, and safeguard your information 
              when you use our resume analysis and job matching service.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
            <p>We collect the following types of information:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>
                <strong>Resume Content:</strong> The text and data from resumes you upload, including your skills, 
                work experience, education, and contact information.
              </li>
              <li>
                <strong>Job Descriptions:</strong> Information you provide about job positions, including requirements, 
                responsibilities, and qualifications.
              </li>
              <li>
                <strong>Usage Data:</strong> Information about how you interact with our service, including pages visited, 
                features used, and time spent on the platform.
              </li>
              <li>
                <strong>Feedback:</strong> Any feedback, suggestions, or survey responses you provide about our service.
              </li>
            </ul>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
            <p>We use your information for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>To provide and improve our resume analysis and job matching services</li>
              <li>To analyze resumes and job descriptions for compatibility and bias detection</li>
              <li>To generate personalized interview questions and recommendations</li>
              <li>To improve and optimize our algorithms and service functionality</li>
              <li>To communicate with you about our services</li>
              <li>To respond to your inquiries and fulfill your requests</li>
            </ul>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your personal data 
              against unauthorized or unlawful processing, accidental loss, destruction, or damage. These 
              measures include:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Encrypted data transmission</li>
              <li>Secure storage of your information</li>
              <li>Limited access to your personal data by our employees</li>
              <li>Regular security assessments and updates</li>
            </ul>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Data Retention</h2>
            <p>
              We retain your personal data only for as long as necessary to fulfill the purposes for which 
              we collected it, including for the purposes of satisfying any legal, regulatory, tax, accounting, 
              or reporting requirements. You can request deletion of your data at any time by contacting us.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. AI and Data Processing</h2>
            <p>
              Our service uses artificial intelligence to analyze resumes and job descriptions. The AI models 
              process your data to provide analysis, matching, and recommendations. We continuously improve these 
              models to provide better service. Your data may be anonymized and used to train and improve our AI 
              systems, but we never share your identifiable personal information with third parties without your 
              consent.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">7. Your Rights</h2>
            <p>Depending on your location, you may have the following rights regarding your personal data:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>The right to access your personal data</li>
              <li>The right to correct inaccurate or incomplete data</li>
              <li>The right to delete your personal data</li>
              <li>The right to restrict or object to processing of your data</li>
              <li>The right to data portability</li>
              <li>The right to withdraw consent at any time</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, please contact us using the information provided in the 
              "Contact Us" section below.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">8. Changes to This Privacy Policy</h2>
            <p>
              We may update this privacy policy from time to time. We will notify you of any changes by 
              posting the new privacy policy on this page and updating the "Last Updated" date. You are 
              advised to review this privacy policy periodically for any changes.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">9. Contact Us</h2>
            <p>
              If you have any questions about this privacy policy or our data practices, please contact us at:
            </p>
            <p className="mt-2">
              <strong>Email:</strong> privacy@talentmateai.com<br />
              <strong>Address:</strong> TalentMate AI, 123 AI Boulevard, Tech Valley, CA 94000
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}