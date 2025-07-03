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
  Lock
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
    <Card className="transition-all duration-200 hover:shadow-lg">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <CardTitle className="text-xl">{proposal.title}</CardTitle>
            <div className="flex items-center space-x-2">
              {getStatusBadge()}
              {proposal.hasVoted && (
                <Badge variant="outline" className="text-green-600">
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
            // Show Voting Interface
            <div className="space-y-4">
              <RadioGroup value={selectedOption} onValueChange={setSelectedOption}>
                {proposal.options.map((option, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <RadioGroupItem value={index.toString()} id={`option-${index}`} />
                    <Label htmlFor={`option-${index}`} className="cursor-pointer">
                      {option}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              
              <Button 
                onClick={handleVote}
                disabled={!selectedOption || isVoting}
                className="w-full"
              >
                {isVoting ? 'Casting Encrypted Vote...' : 'Cast Encrypted Vote'}
              </Button>
            </div>
          ) : (
            // Show Options (No Voting)
            <div className="space-y-2">
              {proposal.options.map((option, index) => (
                <div key={index} className="p-3 border rounded-lg bg-muted/20">
                  <span className="font-medium">{option}</span>
                  {proposal.hasVoted && (
                    <span className="ml-2 text-sm text-muted-foreground">
                      (Vote encrypted)
                    </span>
                  )}
                </div>
              ))}
              
              {proposal.hasVoted && (
                <div className="flex items-center text-sm text-green-600 mt-2">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Your vote has been recorded and encrypted
                </div>
              )}
              
              {hasEnded && !canVote && !proposal.hasVoted && (
                <div className="flex items-center text-sm text-muted-foreground mt-2">
                  <XCircle className="h-4 w-4 mr-1" />
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