import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";

export default function TermsOfService() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
        
        <div className="prose prose-slate max-w-none">
          <p className="text-lg mb-4">Last Updated: {new Date().toLocaleDateString()}</p>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
            <p>
              Welcome to EvalMatchAI ("we", "our", or "us"). By accessing or using our semantic matching
              service for resume analysis and job matching (the "Service"), you agree to be bound by these Terms of Service 
              ("Terms"). Please read these Terms carefully before using the Service.
            </p>
            <p className="mt-3">
              If you do not agree to these Terms, you may not access or use the Service. By accessing or using 
              the Service, you represent that you have the legal capacity to enter into a binding agreement.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Service Description</h2>
            <p>
              EvalMatchAI provides a semantic matching platform that analyzes resumes and job descriptions to 
              assess compatibility, detect potential bias in job descriptions, and generate tailored interview 
              questions. The Service is provided on an "as is" and "as available" basis.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. User Accounts</h2>
            <p>
              You may be required to create an account to access certain features of the Service. You are 
              responsible for maintaining the confidentiality of your account credentials and for all activities 
              that occur under your account. You agree to notify us immediately of any unauthorized use of your 
              account.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. User Content</h2>
            <p>
              Our Service allows you to upload, submit, store, send, or receive content, including resumes 
              and job descriptions ("User Content"). You retain ownership of any intellectual property rights 
              that you hold in that User Content.
            </p>
            <p className="mt-3">
              By uploading, submitting, storing, sending, or receiving User Content to or through our Service, 
              you grant us a worldwide license to use, host, store, reproduce, modify, create derivative works, 
              communicate, publish, publicly perform, publicly display, and distribute such User Content for the 
              limited purpose of operating, promoting, and improving our Service.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Prohibited Conduct</h2>
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe the intellectual property rights of others</li>
              <li>Upload or transmit viruses, malware, or other malicious code</li>
              <li>Interfere with or disrupt the Service or servers or networks connected to the Service</li>
              <li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Harass, abuse, or harm another person</li>
              <li>Submit false or misleading information</li>
            </ul>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. Intellectual Property</h2>
            <p>
              The Service and its original content, features, and functionality are owned by EvalMatchAI 
              and are protected by international copyright, trademark, patent, trade secret, and other 
              intellectual property or proprietary rights laws.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">7. AI Analysis and Limitations</h2>
            <p>
              Our Service uses artificial intelligence to analyze resumes and job descriptions. While we strive 
              to provide accurate and helpful analysis, you acknowledge that:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>AI analysis is probabilistic and may not be 100% accurate</li>
              <li>The Service should be used as a tool to aid decision-making, not as a replacement for human judgment</li>
              <li>We do not guarantee specific outcomes or results from using our Service</li>
              <li>The bias detection feature is designed to help identify potentially biased language but may not catch all instances of bias</li>
            </ul>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">8. Termination</h2>
            <p>
              We may terminate or suspend your access to the Service immediately, without prior notice or liability, 
              for any reason whatsoever, including, without limitation, if you breach these Terms. Upon termination, 
              your right to use the Service will immediately cease.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">9. Limitation of Liability</h2>
            <p>
              In no event shall EvalMatchAI, its directors, employees, partners, agents, suppliers, or affiliates 
              be liable for any indirect, incidental, special, consequential, or punitive damages, including without 
              limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to 
              or use of or inability to access or use the Service.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">10. Changes to Terms</h2>
            <p>
              We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision 
              is material, we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes 
              a material change will be determined at our sole discretion.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">11. Governing Law</h2>
            <p>
              These Terms shall be governed and construed in accordance with the laws of California, United States, 
              without regard to its conflict of law provisions. Any disputes arising under or in connection with these 
              Terms shall be subject to the exclusive jurisdiction of the courts located in California.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">12. Contact Us</h2>
            <p>
              If you have any questions about these Terms, please contact us at:
            </p>
            <p className="mt-2">
              <strong>Email:</strong> terms@talentmateai.com<br />
              <strong>Address:</strong> TalentMate AI, 123 AI Boulevard, Tech Valley, CA 94000
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}