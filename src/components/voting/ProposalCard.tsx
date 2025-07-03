import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { 
  Clock, 
  Users, 
  CheckCircle, 
  XCircle, 
  Vote,
  Eye,
  AlertCircle,
  Lock,
  Circle,
  Dot
} from 'lucide-react';
import { Proposal } from '@/types/voting';
import { votingContract } from '@/lib/contract';
import { toast } from '@/hooks/use-toast';

interface ProposalCardProps {
  proposal: Proposal;
  userIsAdmin: boolean;
  onVoteSuccess: () => void;
}

export function ProposalCard({ proposal, userIsAdmin, onVoteSuccess }: ProposalCardProps) {
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [isVoting, setIsVoting] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);

  const now = Date.now();
  const isActive = now >= proposal.startTime && now <= proposal.endTime;
  const hasEnded = now > proposal.endTime;
  const canVote = isActive && !proposal.hasVoted;

  const handleVote = async () => {
    if (!selectedOption || isVoting) return;

    setIsVoting(true);
    try {
      const optionIndex = parseInt(selectedOption);
      const success = await votingContract.castVote(proposal.id, optionIndex);
      
      if (success) {
        toast({
          title: "Vote Cast Successfully",
          description: "Your encrypted vote has been recorded on the blockchain.",
        });
        onVoteSuccess();
      } else {
        throw new Error('Vote failed');
      }
    } catch (error) {
      toast({
        title: "Vote Failed",
        description: "There was an error casting your vote. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsVoting(false);
    }
  };

  const handleRevealResults = async () => {
    setIsRevealing(true);
    try {
      const success = await votingContract.revealResults(proposal.id);
      
      if (success) {
        toast({
          title: "Results Revelation Requested",
          description: "Results will be decrypted and revealed shortly.",
        });
        onVoteSuccess();
      }
    } catch (error) {
      toast({
        title: "Revelation Failed",
        description: "Could not reveal results. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRevealing(false);
    }
  };

  const getStatusBadge = () => {
    if (hasEnded && proposal.resultsRevealed) {
      return <Badge variant="secondary"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
    }
    if (hasEnded) {
      return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Ended</Badge>;
    }
    if (isActive) {
      return <Badge variant="default"><Vote className="h-3 w-3 mr-1" />Active</Badge>;
    }
    return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  };

  const calculateProgress = () => {
    if (hasEnded) return 100;
    if (!isActive) return 0;
    
    const total = proposal.endTime - proposal.startTime;
    const elapsed = now - proposal.startTime;
    return Math.min((elapsed / total) * 100, 100);
  };

  const getWinningOption = () => {
    if (!proposal.resultsRevealed || !proposal.revealedResults.length) return null;
    
    const maxVotes = Math.max(...proposal.revealedResults);
    const winningIndex = proposal.revealedResults.indexOf(maxVotes);
    return { index: winningIndex, votes: maxVotes };
  };

  const winner = getWinningOption();

  return (
    <Card className="transition-all duration-200 hover:shadow-lg bg-card border-border">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <CardTitle className="text-xl">{proposal.title}</CardTitle>
            <div className="flex items-center space-x-2">
              {getStatusBadge()}
              {proposal.hasVoted && (
                <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Voted
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>ID: #{proposal.id}</p>
            <p>{proposal.totalVotes} votes</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <p className="text-muted-foreground">{proposal.description}</p>

        {/* Time Information */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center text-muted-foreground">
              <Clock className="h-4 w-4 mr-1" />
              {isActive ? 'Ends' : hasEnded ? 'Ended' : 'Starts'}: {format(new Date(hasEnded ? proposal.endTime : isActive ? proposal.endTime : proposal.startTime), 'PPp')}
            </span>
            <span className="flex items-center text-muted-foreground">
              <Users className="h-4 w-4 mr-1" />
              {proposal.totalVotes} votes
            </span>
          </div>
          <Progress value={calculateProgress()} className="h-2" />
        </div>

        {/* Voting Options */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center">
            <Lock className="h-4 w-4 mr-2 text-primary" />
            Voting Options {!proposal.resultsRevealed && "(Encrypted)"}
          </h4>
          
          {proposal.resultsRevealed ? (
            // Show Results
            <div className="space-y-3">
              {proposal.options.map((option, index) => {
                const votes = proposal.revealedResults[index] || 0;
                const percentage = proposal.totalVotes > 0 ? (votes / proposal.totalVotes) * 100 : 0;
                const isWinner = winner?.index === index;

                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${isWinner ? 'text-green-600' : ''}`}>
                        {option} {isWinner && '🏆'}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {votes} votes ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
            </div>
          ) : canVote ? (
            // Show Voting Interface with Clear Radio Buttons
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <Vote className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Select your choice (your vote will be encrypted)
                  </span>
                </div>
                
                <RadioGroup value={selectedOption} onValueChange={setSelectedOption} className="space-y-3">
                  {proposal.options.map((option, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <RadioGroupItem 
                        value={index.toString()} 
                        id={`option-${index}`}
                        className="border-2 border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <Label 
                        htmlFor={`option-${index}`} 
                        className="cursor-pointer flex-1 font-medium text-foreground"
                      >
                        <div className="flex items-center space-x-2">
                          <Circle className="h-4 w-4 text-muted-foreground" />
                          <span>{option}</span>
                        </div>
                      </Label>
                      {selectedOption === index.toString() && (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  ))}
                </RadioGroup>
              </div>
              
              <Button 
                onClick={handleVote}
                disabled={!selectedOption || isVoting}
                className="w-full"
                size="lg"
              >
                {isVoting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Casting Encrypted Vote...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    Cast Encrypted Vote
                  </>
                )}
              </Button>
              
              {selectedOption && (
                <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Lock className="h-4 w-4" />
                    <span>
                      You selected: <strong>{proposal.options[parseInt(selectedOption)]}</strong>
                    </span>
                  </div>
                  <p className="mt-1">Your vote will be encrypted using FHE technology for complete privacy.</p>
                </div>
              )}
            </div>
          ) : (
            // Show Options (No Voting)
            <div className="space-y-2">
              {proposal.options.map((option, index) => (
                <div key={index} className="p-4 border rounded-lg bg-muted/20 border-border">
                  <div className="flex items-center space-x-3">
                    <Dot className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{option}</span>
                    {proposal.hasVoted && (
                      <Badge variant="outline" className="text-xs">
                        <Lock className="h-3 w-3 mr-1" />
                        Vote encrypted
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              
              {proposal.hasVoted && (
                <div className="flex items-center text-sm text-green-600 mt-3 bg-green-50 dark:bg-green-950/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Your vote has been recorded and encrypted
                </div>
              )}
              
              {hasEnded && !canVote && !proposal.hasVoted && (
                <div className="flex items-center text-sm text-muted-foreground mt-3 bg-muted/50 p-3 rounded-lg">
                  <XCircle className="h-4 w-4 mr-2" />
                  Voting period has ended
                </div>
              )}
            </div>
          )}
        </div>

        {/* Admin Controls */}
        {userIsAdmin && hasEnded && !proposal.resultsRevealed && (
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 mr-1" />
                Results pending decryption
              </div>
              <Button 
                onClick={handleRevealResults}
                disabled={isRevealing}
                size="sm"
                variant="outline"
              >
                <Eye className="h-4 w-4 mr-1" />
                {isRevealing ? 'Revealing...' : 'Reveal Results'}
              </Button>
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          <p>Created by: {proposal.creator.slice(0, 8)}...{proposal.creator.slice(-6)}</p>
          <p>Created: {format(new Date(proposal.startTime), 'PPp')}</p>
        </div>
      </CardContent>
    </Card>
  );
}