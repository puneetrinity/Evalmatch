import { useState } from "react";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Feedback() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [feedbackType, setFeedbackType] = useState("general");
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleRatingClick = (value: number) => {
    setRating(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // In a real application, you would send this data to a server
    // For now, we'll just simulate a submission
    setTimeout(() => {
      console.log({
        name,
        email,
        feedbackType,
        rating,
        comment
      });
      
      setIsSubmitting(false);
      setIsSubmitted(true);
      
      toast({
        title: "Feedback received",
        description: "Thank you for your feedback! We appreciate your input.",
      });
      
      // Reset form
      setName("");
      setEmail("");
      setFeedbackType("general");
      setRating(0);
      setComment("");
    }, 1000);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 max-w-3xl">
        <h1 className="text-3xl font-bold mb-6">Feedback</h1>
        
        <Card className="mb-8">
          <CardContent className="pt-6">
            <p className="text-gray-600 mb-6">
              We value your feedback on TalentMate AI. Please let us know about your experience 
              using our platform. Your insights help us improve our services and better meet your needs.
            </p>
            
            {!isSubmitted ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Your Name</Label>
                    <Input 
                      id="name" 
                      placeholder="Enter your name" 
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      required 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="Enter your email" 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Feedback Type</Label>
                  <RadioGroup 
                    value={feedbackType} 
                    onValueChange={setFeedbackType}
                    className="flex flex-col space-y-1"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="general" id="general" />
                      <Label htmlFor="general">General Feedback</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="bug" id="bug" />
                      <Label htmlFor="bug">Report a Bug</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="feature" id="feature" />
                      <Label htmlFor="feature">Feature Request</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="improvement" id="improvement" />
                      <Label htmlFor="improvement">Improvement Suggestion</Label>
                    </div>
                  </RadioGroup>
                </div>
                
                <div className="space-y-3">
                  <Label>How would you rate your experience?</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleRatingClick(value)}
                        className={`w-12 h-12 rounded-full flex items-center justify-center text-lg transition-colors ${
                          rating >= value 
                            ? 'bg-primary text-white' 
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="comment">Your Feedback</Label>
                  <Textarea 
                    id="comment" 
                    placeholder="Please share your thoughts, suggestions, or report issues..." 
                    rows={5} 
                    value={comment} 
                    onChange={(e) => setComment(e.target.value)} 
                    required 
                  />
                </div>
                
                <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
                  {isSubmitting ? (
                    <>
                      <span className="mr-2 animate-spin">⟳</span>
                      Submitting...
                    </>
                  ) : "Submit Feedback"}
                </Button>
              </form>
            ) : (
              <div className="py-8 text-center">
                <div className="bg-green-50 text-green-700 p-6 rounded-lg inline-flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
                <p className="text-gray-600 mb-6">
                  Your feedback has been submitted successfully. We appreciate your 
                  time and input to help us improve TalentMate AI.
                </p>
                <Button onClick={() => setIsSubmitted(false)}>
                  Submit Another Response
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        
        <div className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-3">Contact Us</h2>
          <p className="text-gray-600 mb-4">
            If you need direct assistance or have specific questions, please feel free to contact our support team:
          </p>
          <ul className="space-y-2">
            <li className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>support@talentmateai.com</span>
            </li>
            <li className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span>(555) 123-4567</span>
            </li>
          </ul>
        </div>
      </main>
      <Footer />
    </div>
  );
}