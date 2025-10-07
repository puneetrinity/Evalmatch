import { Button } from "@/components/ui/button";
import { Twitter, Linkedin, Facebook, Link2, Share2 } from "lucide-react";
import { useState } from "react";

interface SocialShareProps {
  url?: string;
  title?: string;
  description?: string;
}

export default function SocialShare({
  url = "https://evalmatch.app",
  title = "AI Recruitment Platform - EvalMatch",
  description = "Hire smarter with AI-powered candidate matching and bias detection"
}: SocialShareProps) {
  const [copied, setCopied] = useState(false);

  const shareUrls = {
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-gray-600 mr-2">Share:</span>

      {/* Twitter */}
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => window.open(shareUrls.twitter, '_blank', 'width=550,height=420')}
      >
        <Twitter className="h-4 w-4" />
        <span className="sr-only">Share on Twitter</span>
      </Button>

      {/* LinkedIn */}
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => window.open(shareUrls.linkedin, '_blank', 'width=550,height=420')}
      >
        <Linkedin className="h-4 w-4" />
        <span className="sr-only">Share on LinkedIn</span>
      </Button>

      {/* Facebook */}
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => window.open(shareUrls.facebook, '_blank', 'width=550,height=420')}
      >
        <Facebook className="h-4 w-4" />
        <span className="sr-only">Share on Facebook</span>
      </Button>

      {/* Copy Link */}
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={handleCopyLink}
      >
        <Link2 className="h-4 w-4" />
        {copied ? "Copied!" : <span className="sr-only">Copy link</span>}
      </Button>

      {/* Native Share (mobile) */}
      {navigator.share && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleNativeShare}
        >
          <Share2 className="h-4 w-4" />
          <span className="sr-only">Share</span>
        </Button>
      )}
    </div>
  );
}
