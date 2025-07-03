import { useState, useEffect } from 'react';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { Header } from '@/components/layout/Header';
import { VotingDashboard } from '@/components/voting/VotingDashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/sonner';
import { 
  Vote, 
  Shield, 
  Lock, 
  Zap,
  ArrowRight,
  CheckCircle,
  Network,
  Wallet
} from 'lucide-react';
import { votingContract } from '@/lib/contract';
import { ContractState } from '@/types/voting';
import { toast } from '@/hooks/use-toast';
import './App.css';

function App() {
  const [contractState, setContractState] = useState<ContractState>({
    connected: false,
    loading: false,
    userProfile: null,
    proposals: [],
    error: null,
  });

  useEffect(() => {
    // Auto-connect if wallet was previously connected
    const savedConnection = localStorage.getItem('wallet-connected');
    if (savedConnection === 'true') {
      handleConnect();
    }
  }, []);

  const handleConnect = async () => {
    setContractState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const connected = await votingContract.connect();
      
      if (connected) {
        const userProfile = await votingContract.getUserProfile();
        const proposals = await votingContract.getActiveProposals();

        setContractState({
          connected: true,
          loading: false,
          userProfile,
          proposals,
          error: null,
        });

        localStorage.setItem('wallet-connected', 'true');
        toast({
          title: "Wallet Connected",
          description: "Successfully connected to the FHE voting system.",
        });
      } else {
        throw new Error('Connection failed');
      }
    } catch (error: any) {
      setContractState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to connect wallet',
      }));
      
      toast({
        title: "Connection Failed",
        description: "Could not connect to wallet. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = () => {
    setContractState({
      connected: false,
      loading: false,
      userProfile: null,
      proposals: [],
      error: null,
    });
    
    localStorage.removeItem('wallet-connected');
    toast({
      title: "Wallet Disconnected",
      description: "Successfully disconnected from the voting system.",
    });
  };

  const handleRefresh = async () => {
    if (!contractState.connected) return;

    try {
      const proposals = await votingContract.getActiveProposals();
      setContractState(prev => ({ ...prev, proposals }));
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Could not fetch latest proposals.",
        variant: "destructive",
      });
    }
  };

  const LandingPage = () => (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/50">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Hero Section */}
          <div className="text-center space-y-6">
            <div className="flex items-center justify-center space-x-2 mb-6">
              <Vote className="h-12 w-12 text-primary" />
              <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                SecureVote DAO
              </h1>
            </div>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
              The first DAO governance platform powered by{' '}
              <span className="font-semibold text-foreground">Fully Homomorphic Encryption</span>
            </p>
            
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Vote on proposals with complete privacy. Your individual vote remains encrypted 
              while still contributing to accurate, verifiable results.
            </p>

            <div className="flex items-center justify-center space-x-4 pt-4">
              <Button size="lg" onClick={handleConnect} disabled={contractState.loading}>
                <Wallet className="h-5 w-5 mr-2" />
                {contractState.loading ? 'Connecting...' : 'Connect Wallet to Start'}
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent" />
              <CardHeader>
                <Lock className="h-8 w-8 text-blue-500 mb-2" />
                <CardTitle>Private Voting</CardTitle>
                <CardDescription>
                  Your vote choice remains completely private using FHE encryption
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Zero-knowledge vote casting</li>
                  <li>• Individual votes never revealed</li>
                  <li>• Cryptographically guaranteed privacy</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent" />
              <CardHeader>
                <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                <CardTitle>Transparent Results</CardTitle>
                <CardDescription>
                  Accurate tallying without compromising individual privacy
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Real-time encrypted counting</li>
                  <li>• Verifiable final results</li>
                  <li>• Tamper-proof vote tallies</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent" />
              <CardHeader>
                <Zap className="h-8 w-8 text-purple-500 mb-2" />
                <CardTitle>FHE Technology</CardTitle>
                <CardDescription>
                  Powered by cutting-edge Fully Homomorphic Encryption
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Compute on encrypted data</li>
                  <li>• No decryption needed</li>
                  <li>• Military-grade security</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent" />
              <CardHeader>
                <Shield className="h-8 w-8 text-orange-500 mb-2" />
                <CardTitle>DAO Governance</CardTitle>
                <CardDescription>
                  Complete governance system for decentralized organizations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Multi-option proposals</li>
                  <li>• Time-bounded voting</li>
                  <li>• Admin controls</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 to-transparent" />
              <CardHeader>
                <Network className="h-8 w-8 text-teal-500 mb-2" />
                <CardTitle>On-Chain Security</CardTitle>
                <CardDescription>
                  All operations secured by blockchain and smart contracts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Immutable vote records</li>
                  <li>• Smart contract automation</li>
                  <li>• Decentralized execution</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-transparent" />
              <CardHeader>
                <Vote className="h-8 w-8 text-pink-500 mb-2" />
                <CardTitle>User Experience</CardTitle>
                <CardDescription>
                  Intuitive interface designed for seamless governance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Simple voting process</li>
                  <li>• Real-time updates</li>
                  <li>• Mobile responsive</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Technology Badge */}
          <div className="text-center">
            <Badge variant="outline" className="text-sm px-4 py-2">
              Built with Zama-FHEVM • Powered by TFHE • Secured by Ethereum
            </Badge>
          </div>

          {/* Error Display */}
          {contractState.error && (
            <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
              <CardContent className="pt-6">
                <p className="text-red-600 dark:text-red-400 text-center">
                  {contractState.error}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <ThemeProvider defaultTheme="dark" storageKey="voting-theme">
      <div className="min-h-screen bg-background">
        <Header
          userProfile={contractState.userProfile}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          connected={contractState.connected}
        />

        <main className="container mx-auto px-4 py-8">
          {contractState.connected && contractState.userProfile ? (
            <VotingDashboard
              userProfile={contractState.userProfile}
              proposals={contractState.proposals}
              onRefresh={handleRefresh}
            />
          ) : (
            <LandingPage />
          )}
        </main>

        <Toaster />
      </div>
    </ThemeProvider>
  );
}

export default App;