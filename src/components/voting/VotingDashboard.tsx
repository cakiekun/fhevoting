import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Vote, 
  TrendingUp, 
  Clock, 
  CheckCircle,
  Shield,
  Plus,
  RefreshCw,
  Network,
  Lock,
  Zap,
  Bug,
  Info,
  AlertTriangle,
  Wifi,
  WifiOff
} from 'lucide-react';
import { ProposalCard } from './ProposalCard';
import { CreateProposalDialog } from './CreateProposalDialog';
import { AdminPanel } from '../admin/AdminPanel';
import { Proposal, UserProfile } from '@/types/voting';
import { votingContract } from '@/lib/contract';
import { debugLog } from '@/lib/fhevm';

interface VotingDashboardProps {
  userProfile: UserProfile;
  proposals: Proposal[];
  onRefresh: () => void;
}

export function VotingDashboard({ userProfile, proposals, onRefresh }: VotingDashboardProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<{ [key: string]: boolean }>({});

  const activeProposals = proposals.filter(p => {
    const now = Date.now();
    return p.active && now >= p.startTime && now <= p.endTime;
  });

  const pendingProposals = proposals.filter(p => {
    const now = Date.now();
    return p.active && now < p.startTime;
  });

  const completedProposals = proposals.filter(p => {
    const now = Date.now();
    return p.active && now > p.endTime;
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    debugLog('Dashboard refresh triggered');
    await onRefresh();
    setTimeout(() => setRefreshing(false), 500);
  };

  const testGateways = async () => {
    debugLog('Testing gateway connectivity...');
    const status = await votingContract.testGateways();
    setGatewayStatus(status);
  };

  const getStats = () => {
    const totalVotes = proposals.reduce((sum, p) => sum + p.totalVotes, 0);
    const userVotes = proposals.filter(p => p.hasVoted).length;
    
    return {
      totalProposals: proposals.length,
      activeProposals: activeProposals.length,
      totalVotes,
      userVotes
    };
  };

  const stats = getStats();
  const isFHEVM = votingContract.isFHEVM();
  const isSimulation = votingContract.isSimulation();
  const isDebugMode = import.meta.env.VITE_DEBUG_MODE === 'true';

  useEffect(() => {
    debugLog('Dashboard mounted', {
      userProfile,
      proposalsCount: proposals.length,
      isFHEVM,
      isSimulation,
      isDebugMode
    });

    // Test gateways on mount
    if (isDebugMode) {
      testGateways();
    }
  }, []);

  const getConnectionStatus = () => {
    if (isSimulation) {
      return {
        color: 'yellow',
        icon: AlertTriangle,
        text: 'Simulation Mode',
        description: 'Contract not deployed or gateway offline'
      };
    } else if (isFHEVM) {
      return {
        color: 'green',
        icon: Lock,
        text: 'FHE Encryption Active',
        description: 'Full privacy protection enabled'
      };
    } else {
      return {
        color: 'blue',
        icon: Shield,
        text: 'Standard Mode',
        description: 'Basic encryption active'
      };
    }
  };

  const connectionStatus = getConnectionStatus();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">DAO Governance</h2>
          <p className="text-muted-foreground">
            Participate in {isSimulation ? 'simulated' : isFHEVM ? 'fully encrypted' : 'secure'} voting for community proposals
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {isDebugMode && (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={testGateways}
              >
                <Wifi className="h-4 w-4 mr-2" />
                Test Gateways
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowDebugInfo(!showDebugInfo)}
              >
                <Bug className="h-4 w-4 mr-2" />
                Debug
              </Button>
            </>
          )}
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {userProfile.isAdmin && (
            <CreateProposalDialog onSuccess={onRefresh} />
          )}
        </div>
      </div>

      {/* Simulation Mode Warning */}
      {isSimulation && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <span className="font-medium text-yellow-900 dark:text-yellow-100">
                  Running in Simulation Mode
                </span>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  The smart contract is not deployed or Zama gateways are offline. All operations are simulated for demonstration purposes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug Info Panel */}
      {isDebugMode && showDebugInfo && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-blue-800 dark:text-blue-200">
              <Info className="h-5 w-5" />
              <span>Debug Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Contract Debug Info:</h4>
              <pre className="text-xs overflow-auto max-h-40 bg-blue-100 dark:bg-blue-900 p-2 rounded">
                {JSON.stringify(votingContract.getDebugInfo(), null, 2)}
              </pre>
            </div>
            
            {Object.keys(gatewayStatus).length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Gateway Status:</h4>
                <div className="space-y-1">
                  {Object.entries(gatewayStatus).map(([gateway, status]) => (
                    <div key={gateway} className="flex items-center space-x-2 text-xs">
                      {status ? (
                        <Wifi className="h-3 w-3 text-green-500" />
                      ) : (
                        <WifiOff className="h-3 w-3 text-red-500" />
                      )}
                      <span className={status ? 'text-green-700' : 'text-red-700'}>
                        {gateway}: {status ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Network & FHE Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Network className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-blue-900 dark:text-blue-100">
                Connected to {votingContract.getCurrentNetwork()?.name || 'Unknown Network'}
              </span>
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {isSimulation ? 'Simulation' : 'Live'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-${connectionStatus.color}-200 bg-${connectionStatus.color}-50 dark:border-${connectionStatus.color}-800 dark:bg-${connectionStatus.color}-950`}>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <connectionStatus.icon className={`h-5 w-5 text-${connectionStatus.color}-600`} />
              <div>
                <span className={`font-medium text-${connectionStatus.color}-900 dark:text-${connectionStatus.color}-100`}>
                  {connectionStatus.text}
                </span>
                <p className={`text-xs text-${connectionStatus.color}-700 dark:text-${connectionStatus.color}-300 mt-1`}>
                  {connectionStatus.description}
                </p>
              </div>
              {isFHEVM && (
                <Badge variant="secondary" className={`bg-${connectionStatus.color}-100 text-${connectionStatus.color}-800 dark:bg-${connectionStatus.color}-900 dark:text-${connectionStatus.color}-200`}>
                  <Zap className="h-3 w-3 mr-1" />
                  FHEVM
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Proposals</CardTitle>
            <Vote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProposals}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeProposals} currently active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Voting</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeProposals}</div>
            <p className="text-xs text-muted-foreground">
              Proposals accepting votes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Votes</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalVotes}</div>
            <p className="text-xs text-muted-foreground">
              {isSimulation ? 'Simulated votes' : isFHEVM ? 'Encrypted votes' : 'Across all proposals'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Participation</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.userVotes}</div>
            <p className="text-xs text-muted-foreground">
              {isSimulation ? 'Simulated votes cast' : isFHEVM ? 'Encrypted votes cast' : 'Votes cast by you'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active" className="flex items-center space-x-2">
            <Clock className="h-4 w-4" />
            <span>Active ({activeProposals.length})</span>
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4" />
            <span>Completed ({completedProposals.length})</span>
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center space-x-2">
            <Clock className="h-4 w-4" />
            <span>Pending ({pendingProposals.length})</span>
          </TabsTrigger>
          {userProfile.isAdmin && (
            <TabsTrigger value="admin" className="flex items-center space-x-2">
              <Shield className="h-4 w-4" />
              <span>Admin</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {activeProposals.length > 0 ? (
            <div className="grid gap-6">
              {activeProposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  userIsAdmin={userProfile.isAdmin}
                  onVoteSuccess={onRefresh}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Vote className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Active Proposals</h3>
                <p className="text-muted-foreground text-center">
                  {isSimulation 
                    ? "In simulation mode, you can create demo proposals to test the system."
                    : "There are currently no active proposals accepting votes."
                  }
                </p>
                {userProfile.isAdmin && (
                  <div className="mt-4">
                    <CreateProposalDialog onSuccess={onRefresh} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {completedProposals.length > 0 ? (
            <div className="grid gap-6">
              {completedProposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  userIsAdmin={userProfile.isAdmin}
                  onVoteSuccess={onRefresh}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Completed Proposals</h3>
                <p className="text-muted-foreground text-center">
                  Completed proposals will appear here once voting ends.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          {pendingProposals.length > 0 ? (
            <div className="grid gap-6">
              {pendingProposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  userIsAdmin={userProfile.isAdmin}
                  onVoteSuccess={onRefresh}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Pending Proposals</h3>
                <p className="text-muted-foreground text-center">
                  Proposals scheduled for future voting will appear here.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {userProfile.isAdmin && (
          <TabsContent value="admin" className="space-y-4">
            <AdminPanel onRefresh={onRefresh} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}