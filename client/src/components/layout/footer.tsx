import { Link } from "wouter";

export default function Footer() {
  return (
    <footer className="bg-white border-t mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="text-gray-500 text-sm mb-4 md:mb-0">
            &copy; {new Date().getFullYear()} EvalMatchAI. All rights reserved.
          </div>
          <div className="flex space-x-6">
            <Link href="/privacy-policy" className="text-gray-500 hover:text-gray-700">Privacy Policy</Link>
            <Link href="/terms-of-service" className="text-gray-500 hover:text-gray-700">Terms of Service</Link>
            <Link href="/feedback" className="text-gray-500 hover:text-gray-700">Feedback</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
