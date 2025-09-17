/**
 * Profile Page Component
 * 
 * Displays user profile information with prominent credit balance and activity
 */

import React from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { 
  User, 
  CreditCard, 
  Calendar,
  Building,
  Mail,
  Shield,
  TrendingUp,
  History,
  Package,
  ArrowRight
} from 'lucide-react';

// Import real hooks
import { useProfile, type UserProfile } from '@/hooks/use-profile';
import { useCredits, useCreditHistory, useCreditPackages, type CreditPackage } from '@/hooks/use-credits';

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // API hooks
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: credits, isLoading: creditsLoading } = useCredits();
  const { data: packagesData, isLoading: packagesLoading } = useCreditPackages();
  const { data: history, isLoading: historyLoading } = useCreditHistory();

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow">
          <div className="container mx-auto px-4 py-8">
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <p className="text-muted-foreground">Please sign in to view your profile.</p>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (profileLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow">
          <div className="container mx-auto px-4 py-8">
            <div className="space-y-6">
              {/* Loading skeleton */}
              <div className="animate-pulse bg-muted rounded-lg h-32"></div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="animate-pulse bg-muted rounded-lg h-48"></div>
                <div className="animate-pulse bg-muted rounded-lg h-48"></div>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const displayName = profile?.displayName || user.displayName || user.email?.split('@')[0] || 'User';
  const initials = displayName
    .split(' ')
    .map(name => name.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const creditBalance = profile?.creditSummary?.balance || 0;
  const totalUsed = profile?.creditSummary?.totalUsed || 0;
  const totalPurchased = profile?.creditSummary?.totalPurchased || 0;

  const getTierBadgeColor = (tier: string) => {
    switch (tier) {
      case 'enterprise': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'premium': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'basic': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getCreditStatusColor = (balance: number) => {
    if (balance === 0) return 'text-red-600 bg-red-50 border-red-200';
    if (balance < 10) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow">
        <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* User Info */}
            <div className="flex items-center space-x-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={profile?.photoURL || user.photoURL || ''} alt={displayName} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-foreground">{displayName}</h1>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {profile?.email || user.email}
                </p>
                <div className="flex items-center gap-2">
                  <Badge className={getTierBadgeColor(profile?.tier || 'testing')}>
                    <Shield className="h-3 w-3 mr-1" />
                    {(profile?.tier || 'testing').charAt(0).toUpperCase() + (profile?.tier || 'testing').slice(1)}
                  </Badge>
                  {user.emailVerified && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Verified
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Credit Balance Highlight */}
            <div className={`rounded-lg p-4 border ${getCreditStatusColor(creditBalance)}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Credit Balance</span>
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="text-3xl font-bold">{creditBalance}</div>
              <p className="text-sm mt-1">
                {creditBalance === 0 ? 'No credits remaining' : 
                 creditBalance < 10 ? 'Low balance' : 
                 'Available for analysis'}
              </p>
            </div>

            {/* Quick Stats */}
            <div className="space-y-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{totalUsed}</div>
                <div className="text-sm text-muted-foreground">Analyses Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{totalPurchased}</div>
                <div className="text-sm text-muted-foreground">Credits Purchased</div>
              </div>
              {profile?.createdAt && (
                <div className="text-center">
                  <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Member since {new Date(profile.createdAt).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>
              Your latest credit transactions and analysis activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse bg-muted rounded h-16"></div>
                ))}
              </div>
            ) : (history as any)?.transactions?.length > 0 ? (
              <div className="space-y-3">
                {(history as any).transactions.slice(0, 5).map((transaction: any) => (
                  <div key={transaction.id} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                    <div>
                      <p className="font-medium">{transaction.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(transaction.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className={`font-medium ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No activity yet</p>
                <p className="text-sm">Start analyzing resumes to see your activity here</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ways to Earn Credits */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Ways to Earn Credits
            </CardTitle>
            <CardDescription>
              Free methods to earn credits and power your recruitment
            </CardDescription>
          </CardHeader>
          <CardContent>
            {packagesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse bg-muted rounded h-20"></div>
                ))}
              </div>
            ) : packagesData?.packages && packagesData.packages.length > 0 ? (
              <div className="space-y-3">
                {packagesData.packages.slice(0, 3).map((pkg: CreditPackage) => (
                  <div key={pkg.id} className={`
                    p-4 border rounded-lg transition-colors hover:bg-muted/30
                    ${pkg.popular ? 'border-primary bg-primary/5' : 'border-border'}
                  `}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{pkg.name}</h4>
                          {pkg.popular && (
                            <Badge className="bg-primary text-primary-foreground text-xs">Popular</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{pkg.description}</p>
                        <p className="text-lg font-bold text-green-600">{pkg.priceDisplay}</p>
                        {(pkg as any).requirement && (
                          <p className="text-xs text-muted-foreground mt-1">
                            📋 {(pkg as any).requirement}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold">{pkg.credits}</div>
                        <div className="text-sm text-muted-foreground">Credits</div>
                      </div>
                    </div>
                  </div>
                ))}
                <Button className="w-full" variant="outline">
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Start Earning Credits Today
                </Button>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No earning methods available</p>
                <p className="text-sm">Check back later for ways to earn free credits</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}