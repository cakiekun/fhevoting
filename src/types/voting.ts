export interface Proposal {
  id: number;
  title: string;
  description: string;
  options: string[];
  startTime: number;
  endTime: number;
  totalVotes: number;
  creator: string;
  active: boolean;
  resultsRevealed: boolean;
  revealedResults: number[];
  hasVoted?: boolean;
}

export interface VoteData {
  proposalId: number;
  optionIndex: number;
  encryptedVote: string;
}

export interface UserProfile {
  address: string;
  isAuthorized: boolean;
  isAdmin: boolean;
  votedProposals: number[];
}

export interface ContractState {
  connected: boolean;
  loading: boolean;
  userProfile: UserProfile | null;
  proposals: Proposal[];
  error: string | null;
}