import { Link } from "wouter";
import { HelpCenter } from "@/components/onboarding";
import { Button } from "@/components/ui/button";

export default function Header() {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center">
            <Link href="/" className="text-primary text-2xl font-bold">
              EvalMatchAI
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <button className="text-gray-500 hover:text-gray-700">
              <i className="fas fa-cog"></i>
            </button>
            <HelpCenter 
              triggerButton={
                <Button className="bg-primary text-white hover:bg-primary/80 transition-colors">
                  Help Center
                </Button>
              } 
            />
          </div>
        </div>
      </div>
    </header>
  );
}
