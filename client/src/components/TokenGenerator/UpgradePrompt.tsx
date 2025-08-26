/**
 * Upgrade Prompt Component
 * 
 * Displays upgrade suggestions when users approach their limits
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { 
  TrendingUp, 
  Zap, 
  Shield, 
  Star, 
  ArrowRight,
  Check,
  Mail,
  Phone,
  Calendar,
  ExternalLink
} from 'lucide-react';
import type { UsageOverview } from '../../../../shared/schema';

interface UpgradePromptProps {
  usageOverview: UsageOverview;
}

export function UpgradePrompt({ usageOverview }: UpgradePromptProps) {
  const [showDetails, setShowDetails] = useState(false);

  const usagePercentage = (usageOverview.currentUsage / usageOverview.limit) * 100;
  const shouldShowPrompt = usagePercentage >= 70; // Show when 70% or higher

  if (!shouldShowPrompt) {
    return null;
  }

  const isNearLimit = usagePercentage >= 90;
  const isAtLimit = usageOverview.remainingCalls <= 0;

  const tiers = [
    {
      name: 'Basic',
      price: '$29',
      period: '/month',
      maxCalls: '1,000',
      features: [
        '1,000 API calls per month',
        'Email support',
        'Production use allowed',
        'Basic analytics',
        'SLA: 99.5% uptime'
      ],
      recommended: usageOverview.tier === 'testing',
      current: usageOverview.tier === 'basic'
    },
    {
      name: 'Premium',
      price: '$99',
      period: '/month',
      maxCalls: '10,000',
      features: [
        '10,000 API calls per month',
        'Priority email support',
        'Advanced analytics',
        'Webhook notifications',
        'SLA: 99.9% uptime',
        'Custom rate limits'
      ],
      recommended: usageOverview.tier === 'basic' || usageOverview.currentUsage > 500,
      current: usageOverview.tier === 'premium'
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      maxCalls: '100,000+',
      features: [
        '100,000+ API calls per month',
        'Dedicated support manager',
        'Phone & chat support',
        'Custom integrations',
        'SLA: 99.99% uptime',
        'White-label options',
        'On-premise deployment',
        'Volume discounts'
      ],
      recommended: usageOverview.tier === 'premium' || usageOverview.currentUsage > 5000,
      current: usageOverview.tier === 'enterprise'
    }
  ];

  const handleContactSales = () => {
    window.open('mailto:sales@evalmatch.com?subject=EvalMatch API Upgrade Inquiry', '_blank');
  };

  const handleScheduleCall = () => {
    window.open('https://calendly.com/evalmatch/consultation', '_blank');
  };

  return (
    <div className="space-y-4">
      {/* Alert Banner */}
      <Alert className={isAtLimit ? 'border-red-500 bg-red-50' : isNearLimit ? 'border-yellow-500 bg-yellow-50' : 'border-blue-500 bg-blue-50'}>
        <TrendingUp className="h-4 w-4" />
        <AlertDescription>
          <div className="flex items-center justify-between">
            <span>
              {isAtLimit 
                ? 'You have reached your API limit. Upgrade to continue using the API.'
                : isNearLimit
                ? `You have ${usageOverview.remainingCalls} API calls remaining (${(100 - usagePercentage).toFixed(0)}% left).`
                : `You're using ${usagePercentage.toFixed(0)}% of your API quota. Consider upgrading for higher limits.`
              }
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowDetails(!showDetails)}
              className="ml-4"
            >
              {showDetails ? 'Hide Plans' : 'View Plans'}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      {/* Detailed Plans */}
      {showDetails && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Upgrade Your Plan
            </CardTitle>
            <CardDescription>
              Choose a plan that fits your usage needs and unlock more API calls
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {tiers.map((tier) => (
                <div
                  key={tier.name}
                  className={`relative p-6 border rounded-lg ${
                    tier.recommended 
                      ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                      : tier.current 
                      ? 'border-green-500 bg-green-50'
                      : 'border-border'
                  }`}
                >
                  {tier.recommended && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">
                        Recommended
                      </Badge>
                    </div>
                  )}

                  {tier.current && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <Badge variant="outline" className="bg-green-100 border-green-500 text-green-800">
                        Current Plan
                      </Badge>
                    </div>
                  )}

                  <div className="text-center mb-4">
                    <h3 className="text-lg font-semibold">{tier.name}</h3>
                    <div className="mt-2">
                      <span className="text-3xl font-bold">{tier.price}</span>
                      <span className="text-muted-foreground">{tier.period}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tier.maxCalls} API calls
                    </p>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {tier.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {!tier.current && (
                    <Button 
                      className="w-full" 
                      variant={tier.recommended ? 'default' : 'outline'}
                      onClick={tier.name === 'Enterprise' ? handleContactSales : handleContactSales}
                    >
                      {tier.name === 'Enterprise' ? 'Contact Sales' : 'Upgrade Now'}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Contact Information */}
            <div className="border-t pt-6">
              <h4 className="font-medium mb-4">Ready to upgrade or have questions?</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button variant="outline" onClick={handleContactSales} className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Sales
                </Button>
                <Button variant="outline" onClick={() => window.open('tel:+15551234567')} className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Call Us
                </Button>
                <Button variant="outline" onClick={handleScheduleCall} className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Schedule Call
                </Button>
              </div>
              
              <div className="mt-4 text-sm text-muted-foreground">
                <p>
                  <strong>Need custom pricing?</strong> Enterprise customers get volume discounts, 
                  dedicated support, and custom SLAs. Contact us for a personalized quote.
                </p>
              </div>
            </div>

            {/* FAQ */}
            <div className="border-t pt-6 mt-6">
              <h4 className="font-medium mb-3">Frequently Asked Questions</h4>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">How does billing work?</p>
                  <p className="text-muted-foreground">
                    All plans are billed monthly in advance. You can upgrade or downgrade anytime, 
                    and changes take effect immediately.
                  </p>
                </div>
                <div>
                  <p className="font-medium">What happens if I exceed my limit?</p>
                  <p className="text-muted-foreground">
                    API requests will be throttled once you reach your limit. Upgrade your plan 
                    to continue making requests immediately.
                  </p>
                </div>
                <div>
                  <p className="font-medium">Can I cancel anytime?</p>
                  <p className="text-muted-foreground">
                    Yes, you can cancel your subscription anytime. Your API access will continue 
                    until the end of your current billing period.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}