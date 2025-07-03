import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Shield, 
  Users, 
  Plus, 
  Check, 
  AlertCircle,
  ExternalLink,
  Copy
} from 'lucide-react';
import { votingContract } from '@/lib/contract';
import { toast } from '@/hooks/use-toast';

interface AdminPanelProps {
  onRefresh: () => void;
}

export function AdminPanel({ onRefresh }: AdminPanelProps) {
  const [voterAddress, setVoterAddress] = useState('');
  const [voterAddresses, setVoterAddresses] = useState('');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isBulkAuthorizing, setIsBulkAuthorizing] = useState(false);

  const handleAuthorizeSingleVoter = async () => {
    if (!voterAddress.trim()) {
      toast({
        title: "Error",
        description: "Masukkan alamat voter yang valid",
        variant: "destructive",
      });
      return;
    }

    setIsAuthorizing(true);
    try {
      const success = await votingContract.authorizeVoter(voterAddress.trim());
      
      if (success) {
        toast({
          title: "Voter Authorized",
          description: `Voter ${voterAddress} berhasil diotorisasi`,
        });
        setVoterAddress('');
        onRefresh();
      }
    } catch (error: any) {
      toast({
        title: "Authorization Failed",
        description: error.message || "Gagal mengotorisasi voter",
        variant: "destructive",
      });
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleAuthorizeBulkVoters = async () => {
    const addresses = voterAddresses
      .split('\n')
      .map(addr => addr.trim())
      .filter(addr => addr.length > 0);

    if (addresses.length === 0) {
      toast({
        title: "Error",
        description: "Masukkan minimal satu alamat voter",
        variant: "destructive",
      });
      return;
    }

    // Validate addresses
    const invalidAddresses = addresses.filter(addr => !addr.match(/^0x[a-fA-F0-9]{40}$/));
    if (invalidAddresses.length > 0) {
      toast({
        title: "Invalid Addresses",
        description: `Alamat tidak valid: ${invalidAddresses.join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    setIsBulkAuthorizing(true);
    try {
      const success = await votingContract.authorizeVoters(addresses);
      
      if (success) {
        toast({
          title: "Bulk Authorization Success",
          description: `${addresses.length} voter berhasil diotorisasi`,
        });
        setVoterAddresses('');
        onRefresh();
      }
    } catch (error: any) {
      toast({
        title: "Bulk Authorization Failed",
        description: error.message || "Gagal mengotorisasi voters",
        variant: "destructive",
      });
    } finally {
      setIsBulkAuthorizing(false);
    }
  };

  const copyContractAddress = () => {
    const address = votingContract.getContractAddress();
    navigator.clipboard.writeText(address);
    toast({
      title: "Copied",
      description: "Contract address copied to clipboard",
    });
  };

  const openInExplorer = () => {
    const network = votingContract.getCurrentNetwork();
    const address = votingContract.getContractAddress();
    const url = `${network?.blockExplorer}/address/${address}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <Shield className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Admin Panel</h2>
      </div>

      {/* Contract Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5" />
            <span>Contract Information</span>
          </CardTitle>
          <CardDescription>
            Informasi smart contract yang sedang aktif
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-sm font-medium">Contract Address</Label>
              <div className="flex items-center space-x-2 mt-1">
                <code className="flex-1 p-2 bg-muted rounded text-sm font-mono">
                  {votingContract.getContractAddress()}
                </code>
                <Button size="sm" variant="outline" onClick={copyContractAddress}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={openInExplorer}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Network</Label>
              <div className="mt-1">
                <Badge variant="secondary">
                  {votingContract.getCurrentNetwork()?.name || 'Sepolia Testnet'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Voter Authorization */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Single Voter Authorization */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Authorize Single Voter</span>
            </CardTitle>
            <CardDescription>
              Otorisasi satu voter untuk berpartisipasi dalam voting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="voter-address">Voter Address</Label>
              <Input
                id="voter-address"
                placeholder="0x..."
                value={voterAddress}
                onChange={(e) => setVoterAddress(e.target.value)}
              />
            </div>
            <Button 
              onClick={handleAuthorizeSingleVoter}
              disabled={isAuthorizing || !voterAddress.trim()}
              className="w-full"
            >
              {isAuthorizing ? (
                <>Authorizing...</>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Authorize Voter
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Bulk Voter Authorization */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Bulk Authorize Voters</span>
            </CardTitle>
            <CardDescription>
              Otorisasi multiple voters sekaligus (satu address per baris)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="voter-addresses">Voter Addresses</Label>
              <Textarea
                id="voter-addresses"
                placeholder="0x...&#10;0x...&#10;0x..."
                rows={4}
                value={voterAddresses}
                onChange={(e) => setVoterAddresses(e.target.value)}
              />
            </div>
            <Button 
              onClick={handleAuthorizeBulkVoters}
              disabled={isBulkAuthorizing || !voterAddresses.trim()}
              className="w-full"
            >
              {isBulkAuthorizing ? (
                <>Authorizing...</>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Authorize All Voters
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Instructions</CardTitle>
          <CardDescription>
            Langkah-langkah untuk menggunakan sistem voting
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <Badge variant="outline" className="mt-0.5">1</Badge>
              <div>
                <p className="font-medium">Deploy Contract</p>
                <p className="text-sm text-muted-foreground">
                  Contract sudah di-deploy di Sepolia testnet
                </p>
              </div>
            </div>
            
            <Separator />
            
            <div className="flex items-start space-x-3">
              <Badge variant="outline" className="mt-0.5">2</Badge>
              <div>
                <p className="font-medium">Authorize Voters</p>
                <p className="text-sm text-muted-foreground">
                  Gunakan form di atas untuk mengotorisasi voters
                </p>
              </div>
            </div>
            
            <Separator />
            
            <div className="flex items-start space-x-3">
              <Badge variant="outline" className="mt-0.5">3</Badge>
              <div>
                <p className="font-medium">Create Proposals</p>
                <p className="text-sm text-muted-foreground">
                  Buat proposal voting menggunakan tombol "Create Proposal"
                </p>
              </div>
            </div>
            
            <Separator />
            
            <div className="flex items-start space-x-3">
              <Badge variant="outline" className="mt-0.5">4</Badge>
              <div>
                <p className="font-medium">Monitor Voting</p>
                <p className="text-sm text-muted-foreground">
                  Pantau progress voting dan reveal results setelah periode voting berakhir
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}