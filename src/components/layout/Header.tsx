import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { 
  Vote, 
  User, 
  Settings, 
  LogOut,
  Shield,
  Wallet
} from 'lucide-react';
import { votingContract } from '@/lib/contract';
import { UserProfile } from '@/types/voting';

interface HeaderProps {
  userProfile: UserProfile | null;
  onConnect: () => void;
  onDisconnect: () => void;
  connected: boolean;
}

export function Header({ userProfile, onConnect, onDisconnect, connected }: HeaderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Vote className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold">SecureVote DAO</h1>
            </div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Vote className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">SecureVote DAO</h1>
              <p className="text-sm text-muted-foreground">FHE-Powered Encrypted Voting</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <ThemeToggle />
            
            {connected && userProfile ? (
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  {userProfile.isAdmin && (
                    <Badge variant="secondary" className="text-xs">
                      <Shield className="h-3 w-3 mr-1" />
                      Admin
                    </Badge>
                  )}
                  {userProfile.isAuthorized && (
                    <Badge variant="outline" className="text-xs">
                      Authorized Voter
                    </Badge>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="flex items-center space-x-2">
                      <User className="h-4 w-4" />
                      <span className="hidden sm:block">
                        {userProfile.address.slice(0, 6)}...{userProfile.address.slice(-4)}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem>
                      <User className="h-4 w-4 mr-2" />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onDisconnect}>
                      <LogOut className="h-4 w-4 mr-2" />
                      Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <Button onClick={onConnect} className="flex items-center space-x-2">
                <Wallet className="h-4 w-4" />
                <span>Connect Wallet</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}