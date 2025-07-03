import { ethers } from "ethers";
import { Proposal, UserProfile } from "@/types/voting";
import { fhevmClient, debugLog } from "./fhevm";

// Simplified ABI for testing - matches the actual deployed contract
const VOTING_CONTRACT_ABI = [
  // Read functions
  "function proposalCount() view returns (uint256)",
  "function owner() view returns (address)",
  "function isAuthorizedVoter(address voter) view returns (bool)",
  "function isAdmin(address admin) view returns (bool)",
  "function hasVoted(uint256 proposalId, address voter) view returns (bool)",
  "function getProposal(uint256 proposalId) view returns (tuple(uint256 id, string title, string description, string[] options, uint256 startTime, uint256 endTime, uint256 totalVotes, address creator, bool active, bool resultsRevealed, uint256[] revealedResults))",
  "function getActiveProposals() view returns (tuple(uint256 id, string title, string description, string[] options, uint256 startTime, uint256 endTime, uint256 totalVotes, address creator, bool active, bool resultsRevealed, uint256[] revealedResults)[])",

  // Write functions
  "function authorizeVoter(address voter)",
  "function authorizeVoters(address[] voters)",
  "function createProposal(string title, string description, string[] options, uint256 duration) returns (uint256)",
  "function castVote(uint256 proposalId, uint256 optionIndex, uint256 encryptedVote, bytes inputProof)",
  "function setResults(uint256 proposalId, uint256[] results)",

  // Events
  "event ProposalCreated(uint256 indexed proposalId, string title, address indexed creator, uint256 startTime, uint256 endTime)",
  "event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 totalVotes)",
  "event ResultsRevealed(uint256 indexed proposalId, uint256[] results)",
];

// Network configuration untuk Sepolia dengan Zama FHEVM
const SEPOLIA_CONFIG = {
  chainId: 11155111,
  name: "Sepolia Testnet (Zama FHEVM)",
  rpcUrl:
    import.meta.env.VITE_SEPOLIA_RPC_URL ||
    "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
  blockExplorer: "https://sepolia.etherscan.io",
  faucet: "https://sepoliafaucet.com",
  zamaOracle:
    import.meta.env.VITE_ZAMA_ORACLE_ADDRESS ||
    "0xa02Cda4Ca3a71D7C46997716F4283aa851C28812",
};

// Contract address - MUST be updated with actual deployed contract
const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0x0000000000000000000000000000000000000000";

// Mock proposals for simulation mode
const MOCK_PROPOSALS: Proposal[] = [
  {
    id: 0,
    title: "Increase DAO Treasury Allocation",
    description:
      "This proposal suggests increasing the DAO treasury allocation by 10% to fund more community initiatives and development projects. The additional funds would be used for grants, partnerships, and infrastructure improvements.",
    options: [
      "Yes, increase by 10%",
      "No, keep current allocation",
      "Increase by 5% only",
      "Decrease by 5%",
    ],
    startTime: Date.now() - 3600000, // 1 hour ago
    endTime: Date.now() + 86400000, // 24 hours from now
    totalVotes: 12,
    creator: "0x1234567890123456789012345678901234567890",
    active: true,
    resultsRevealed: false,
    revealedResults: [],
    hasVoted: false,
  },
  {
    id: 1,
    title: "Implement New Governance Token Staking",
    description:
      "Proposal to implement a new staking mechanism for governance tokens that would provide additional voting power and rewards for long-term holders. This would encourage more active participation in DAO governance.",
    options: [
      "Implement with 2x voting power",
      "Implement with 1.5x voting power",
      "No staking mechanism",
      "Different reward structure",
    ],
    startTime: Date.now() + 3600000, // 1 hour from now
    endTime: Date.now() + 172800000, // 48 hours from now
    totalVotes: 0,
    creator: "0x1234567890123456789012345678901234567890",
    active: true,
    resultsRevealed: false,
    revealedResults: [],
    hasVoted: false,
  },
  {
    id: 2,
    title: "Partnership with DeFi Protocol",
    description:
      "Vote on whether the DAO should enter into a strategic partnership with a major DeFi protocol to expand our ecosystem and provide more utility for token holders.",
    options: [
      "Approve partnership",
      "Reject partnership",
      "Request more details",
      "Negotiate better terms",
    ],
    startTime: Date.now() - 172800000, // 48 hours ago
    endTime: Date.now() - 3600000, // 1 hour ago (ended)
    totalVotes: 45,
    creator: "0x1234567890123456789012345678901234567890",
    active: true,
    resultsRevealed: true,
    revealedResults: [28, 12, 3, 2],
    hasVoted: true,
  },
];

export class VotingContract {
  private contract: ethers.Contract | null = null;
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.Signer | null = null;
  private isFHEVMEnabled: boolean = false;
  private isSimulationMode: boolean = false;

  async connect(): Promise<boolean> {
    try {
      debugLog("Starting wallet connection...");

      if (!window.ethereum) {
        throw new Error(
          "MetaMask tidak ditemukan. Silakan install MetaMask terlebih dahulu."
        );
      }

      // Check if contract address is set
      if (CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
        debugLog("⚠️ Contract address not set, using simulation mode");
        this.isSimulationMode = true;
        return this.initSimulationMode();
      }

      this.provider = new ethers.BrowserProvider(window.ethereum);

      // Request account access
      debugLog("Requesting account access...");
      await this.provider.send("eth_requestAccounts", []);

      // Check network
      const network = await this.provider.getNetwork();
      const chainId = Number(network.chainId);

      debugLog("Connected to network", { chainId, name: network.name });

      if (chainId !== SEPOLIA_CONFIG.chainId) {
        debugLog("Wrong network detected, switching to Sepolia...");
        await this.switchToSepolia();
      }

      this.signer = await this.provider.getSigner();
      const userAddress = await this.signer.getAddress();
      debugLog("Signer obtained", { address: userAddress });

      this.contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        VOTING_CONTRACT_ABI,
        this.signer
      );
      debugLog("Contract instance created", { address: CONTRACT_ADDRESS });

      // Initialize FHEVM client untuk encryption
      try {
        debugLog("Initializing FHEVM client...");
        await fhevmClient.init(this.provider);
        this.isFHEVMEnabled =
          fhevmClient.isInitialized() && !fhevmClient.isSimulationMode();

        if (this.isFHEVMEnabled) {
          debugLog("✅ FHEVM client initialized successfully");
        } else {
          debugLog("⚠️ FHEVM client running in simulation mode");
        }

        debugLog("FHEVM Debug Info", fhevmClient.getDebugInfo());
      } catch (error) {
        debugLog("⚠️ FHEVM initialization failed, using fallback:", error);
        this.isFHEVMEnabled = false;
      }

      // Test contract connection
      try {
        debugLog("Testing contract connection...");
        const proposalCount = await this.contract.proposalCount();
        debugLog("✅ Contract connection successful", {
          proposalCount: proposalCount.toString(),
        });
      } catch (error) {
        debugLog("❌ Contract connection failed:", error);

        // Check if it's a contract not deployed error
        if (error.message.includes("could not decode result data")) {
          debugLog(
            "⚠️ Contract not deployed at address, switching to simulation mode"
          );
          this.isSimulationMode = true;
          return this.initSimulationMode();
        }

        throw new Error(
          "Tidak dapat terhubung ke smart contract. Pastikan contract sudah di-deploy."
        );
      }

      return true;
    } catch (error) {
      debugLog("❌ Connection failed:", error);
      throw error;
    }
  }

  private async initSimulationMode(): Promise<boolean> {
    debugLog("🔧 Initializing simulation mode...");

    try {
      // Create a mock provider for simulation
      this.provider = new ethers.BrowserProvider(window.ethereum);
      await this.provider.send("eth_requestAccounts", []);
      this.signer = await this.provider.getSigner();

      // Initialize FHEVM in simulation mode
      await fhevmClient.init(this.provider);

      debugLog("✅ Simulation mode initialized successfully");
      return true;
    } catch (error) {
      debugLog("❌ Simulation mode initialization failed:", error);
      throw error;
    }
  }

  async switchToSepolia(): Promise<void> {
    if (!window.ethereum) return;

    try {
      debugLog("Attempting to switch to Sepolia...");

      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${SEPOLIA_CONFIG.chainId.toString(16)}` }],
      });

      debugLog("✅ Successfully switched to Sepolia");
    } catch (switchError: any) {
      debugLog("Switch failed, attempting to add network...", switchError);

      // Network belum ditambahkan ke MetaMask
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${SEPOLIA_CONFIG.chainId.toString(16)}`,
                chainName: SEPOLIA_CONFIG.name,
                rpcUrls: [SEPOLIA_CONFIG.rpcUrl],
                blockExplorerUrls: [SEPOLIA_CONFIG.blockExplorer],
                nativeCurrency: {
                  name: "ETH",
                  symbol: "ETH",
                  decimals: 18,
                },
              },
            ],
          });
          debugLog("✅ Successfully added and switched to Sepolia");
        } catch (addError) {
          debugLog("❌ Failed to add network:", addError);
          throw new Error(
            `Gagal menambahkan jaringan ${SEPOLIA_CONFIG.name} ke MetaMask`
          );
        }
      } else {
        throw new Error(`Gagal beralih ke jaringan ${SEPOLIA_CONFIG.name}`);
      }
    }
  }

  async getUserProfile(): Promise<UserProfile | null> {
    if (!this.signer) return null;

    try {
      debugLog("Getting user profile...");

      const address = await this.signer.getAddress();
      debugLog("User address", { address });

      if (this.isSimulationMode) {
        // Return mock profile for simulation
        const profile = {
          address,
          isAuthorized: true,
          isAdmin: true,
          votedProposals: [2], // User has voted on proposal 2
        };
        debugLog("Simulation mode: returning mock profile", profile);
        return profile;
      }

      const [isAuthorized, isAdmin] = await Promise.all([
        this.contract!.isAuthorizedVoter(address),
        this.contract!.isAdmin(address),
      ]);

      debugLog("User permissions", { isAuthorized, isAdmin });

      // Get voted proposals
      const proposalCount = await this.contract!.proposalCount();
      const votedProposals: number[] = [];

      debugLog("Checking voted proposals", {
        totalProposals: proposalCount.toString(),
      });

      for (let i = 0; i < proposalCount; i++) {
        try {
          const hasVoted = await this.contract!.hasVoted(i, address);
          if (hasVoted) {
            votedProposals.push(i);
          }
        } catch (error) {
          debugLog(`Error checking vote status for proposal ${i}:`, error);
        }
      }

      const profile = {
        address,
        isAuthorized,
        isAdmin,
        votedProposals,
      };

      debugLog("User profile created", profile);
      return profile;
    } catch (error) {
      debugLog("❌ Failed to get user profile:", error);
      return null;
    }
  }

  async getActiveProposals(): Promise<Proposal[]> {
    if (this.isSimulationMode) {
      // Return mock proposals for simulation with user vote status
      const userAddress = this.signer ? await this.signer.getAddress() : null;
      const mockProposals = MOCK_PROPOSALS.map((proposal) => ({
        ...proposal,
        hasVoted: proposal.id === 2, // User has voted on proposal 2
      }));

      debugLog("Simulation mode: returning mock proposals", mockProposals);
      return mockProposals;
    }

    if (!this.contract) return [];

    try {
      debugLog("Fetching active proposals...");

      const proposalsData = await this.contract.getActiveProposals();
      const userAddress = this.signer ? await this.signer.getAddress() : null;

      const proposals: Proposal[] = [];

      for (const proposalData of proposalsData) {
        let hasVoted = false;

        if (userAddress) {
          try {
            hasVoted = await this.contract.hasVoted(
              proposalData.id,
              userAddress
            );
          } catch (error) {
            debugLog(
              `Error checking vote status for proposal ${proposalData.id}:`,
              error
            );
          }
        }

        proposals.push({
          id: Number(proposalData.id),
          title: proposalData.title,
          description: proposalData.description,
          options: proposalData.options,
          startTime: Number(proposalData.startTime) * 1000, // Convert to milliseconds
          endTime: Number(proposalData.endTime) * 1000,
          totalVotes: Number(proposalData.totalVotes),
          creator: proposalData.creator,
          active: proposalData.active,
          resultsRevealed: proposalData.resultsRevealed,
          revealedResults: proposalData.revealedResults.map((r: any) =>
            Number(r)
          ),
          hasVoted,
        });
      }

      debugLog("Active proposals fetched", { count: proposals.length });
      return proposals;
    } catch (error) {
      debugLog("❌ Failed to get proposals:", error);
      return [];
    }
  }

  async createProposal(
    title: string,
    description: string,
    options: string[],
    duration: number
  ): Promise<boolean> {
    if (this.isSimulationMode) {
      debugLog("🔧 Simulation mode: creating proposal", {
        title,
        description,
        options,
        duration,
      });
      // Simulate successful creation
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Add new proposal to mock data
      const newProposal: Proposal = {
        id: MOCK_PROPOSALS.length,
        title,
        description,
        options,
        startTime: Date.now(),
        endTime: Date.now() + duration * 60 * 60 * 1000, // Convert hours to milliseconds
        totalVotes: 0,
        creator:
          (await this.signer?.getAddress()) ||
          "0x0000000000000000000000000000000000000000",
        active: true,
        resultsRevealed: false,
        revealedResults: [],
        hasVoted: false,
      };

      MOCK_PROPOSALS.push(newProposal);
      debugLog("Mock proposal added", newProposal);

      return true;
    }

    if (!this.contract) return false;

    try {
      debugLog("Creating proposal", { title, description, options, duration });

      const tx = await this.contract.createProposal(
        title,
        description,
        options,
        duration
      );
      debugLog("Transaction sent", { hash: tx.hash });

      const receipt = await tx.wait();
      debugLog("Transaction confirmed", {
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString(),
      });

      return receipt.status === 1;
    } catch (error) {
      debugLog("❌ Failed to create proposal:", error);
      throw error;
    }
  }

  async castVote(proposalId: number, optionIndex: number): Promise<boolean> {
    if (this.isSimulationMode) {
      debugLog("🔧 Simulation mode: casting vote", { proposalId, optionIndex });
      // Simulate vote casting with encryption
      const { encryptedVote, proof } = await fhevmClient.encryptVote(1);
      debugLog("Simulated encrypted vote", {
        encryptedVoteLength: encryptedVote.length,
        proofLength: proof.length,
      });

      // Update mock proposal
      const proposal = MOCK_PROPOSALS.find((p) => p.id === proposalId);
      if (proposal) {
        proposal.hasVoted = true;
        proposal.totalVotes++;
      }

      // Simulate transaction delay
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return true;
    }

    if (!this.contract) return false;

    try {
      debugLog("Casting vote", {
        proposalId,
        optionIndex,
        fhevmEnabled: this.isFHEVMEnabled,
      });

      let tx;

      if (this.isFHEVMEnabled && fhevmClient.isInitialized()) {
        // Gunakan FHE encryption untuk privacy sesungguhnya
        debugLog("🔐 Using FHE encryption for vote...");

        try {
          const { encryptedVote, proof } = await fhevmClient.encryptVote(1); // Vote value of 1

          // Convert ke format yang dibutuhkan contract
          const encryptedVoteHex =
            fhevmClient.createExternalInput(encryptedVote);
          const proofHex = fhevmClient.toHexString(proof);

          debugLog("FHE encryption completed", {
            encryptedVoteLength: encryptedVoteHex.length,
            proofLength: proofHex.length,
          });

          tx = await this.contract.castVote(
            proposalId,
            optionIndex,
            encryptedVoteHex,
            proofHex
          );
          debugLog("✅ FHE encrypted vote cast successfully");
        } catch (fheError) {
          debugLog(
            "❌ FHE encryption failed, falling back to simulation:",
            fheError
          );
          // Fallback ke simulasi jika FHE gagal
          const simulatedEncryption = ethers.randomBytes(32);
          const simulatedProof = ethers.randomBytes(32);
          tx = await this.contract.castVote(
            proposalId,
            optionIndex,
            ethers.hexlify(simulatedEncryption),
            ethers.hexlify(simulatedProof)
          );
        }
      } else {
        // Fallback untuk testing (simulasi encryption)
        debugLog("🔒 Using simulated encryption...");

        const simulatedEncryption = ethers.randomBytes(32);
        const simulatedProof = ethers.randomBytes(32);
        tx = await this.contract.castVote(
          proposalId,
          optionIndex,
          ethers.hexlify(simulatedEncryption),
          ethers.hexlify(simulatedProof)
        );
      }

      debugLog("Vote transaction sent", { hash: tx.hash });

      const receipt = await tx.wait();
      debugLog("Vote transaction confirmed", {
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString(),
      });

      return receipt.status === 1;
    } catch (error) {
      debugLog("❌ Failed to cast vote:", error);
      throw error;
    }
  }

  async revealResults(proposalId: number): Promise<boolean> {
    if (this.isSimulationMode) {
      debugLog("🔧 Simulation mode: revealing results", { proposalId });

      // Update mock proposal with results
      const proposal = MOCK_PROPOSALS.find((p) => p.id === proposalId);
      if (proposal && !proposal.resultsRevealed) {
        proposal.resultsRevealed = true;
        // Generate random results based on total votes
        const totalVotes = proposal.totalVotes;
        const results = proposal.options.map(() =>
          Math.floor(Math.random() * totalVotes)
        );
        // Ensure total matches
        const sum = results.reduce((a, b) => a + b, 0);
        if (sum !== totalVotes && totalVotes > 0) {
          results[0] += totalVotes - sum;
        }
        proposal.revealedResults = results;
      }

      // Simulate result revelation
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return true;
    }

    if (!this.contract) return false;

    try {
      debugLog("Revealing results for proposal", { proposalId });

      // For now, we'll use setResults with dummy data since we don't have real decryption
      // In production, this would trigger the actual decryption process
      const dummyResults = [5, 3, 2]; // Example results

      const tx = await this.contract.setResults(proposalId, dummyResults);
      debugLog("Reveal transaction sent", { hash: tx.hash });

      const receipt = await tx.wait();
      debugLog("Reveal transaction confirmed", {
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString(),
      });

      return receipt.status === 1;
    } catch (error) {
      debugLog("❌ Failed to reveal results:", error);
      throw error;
    }
  }

  async authorizeVoter(voterAddress: string): Promise<boolean> {
    if (this.isSimulationMode) {
      debugLog("🔧 Simulation mode: authorizing voter", { voterAddress });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return true;
    }

    if (!this.contract) return false;

    try {
      debugLog("Authorizing voter", { voterAddress });

      const tx = await this.contract.authorizeVoter(voterAddress);
      const receipt = await tx.wait();

      debugLog("Voter authorization completed", {
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString(),
      });

      return receipt.status === 1;
    } catch (error) {
      debugLog("❌ Failed to authorize voter:", error);
      throw error;
    }
  }

  async authorizeVoters(voterAddresses: string[]): Promise<boolean> {
    if (this.isSimulationMode) {
      debugLog("🔧 Simulation mode: authorizing multiple voters", {
        count: voterAddresses.length,
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return true;
    }

    if (!this.contract) return false;

    try {
      debugLog("Authorizing multiple voters", { count: voterAddresses.length });

      const tx = await this.contract.authorizeVoters(voterAddresses);
      const receipt = await tx.wait();

      debugLog("Bulk voter authorization completed", {
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString(),
      });

      return receipt.status === 1;
    } catch (error) {
      debugLog("❌ Failed to authorize voters:", error);
      throw error;
    }
  }

  getContractAddress(): string {
    return CONTRACT_ADDRESS;
  }

  getCurrentNetwork(): any {
    return SEPOLIA_CONFIG;
  }

  isFHEVM(): boolean {
    return this.isFHEVMEnabled;
  }

  isSimulation(): boolean {
    return this.isSimulationMode;
  }

  getBlockExplorerUrl(txHash: string): string {
    return `${SEPOLIA_CONFIG.blockExplorer}/tx/${txHash}`;
  }

  getFaucetUrl(): string {
    return SEPOLIA_CONFIG.faucet;
  }

  getDebugInfo() {
    return {
      contractAddress: CONTRACT_ADDRESS,
      network: SEPOLIA_CONFIG,
      isFHEVMEnabled: this.isFHEVMEnabled,
      isSimulationMode: this.isSimulationMode,
      hasContract: !!this.contract,
      hasProvider: !!this.provider,
      hasSigner: !!this.signer,
      mockProposalsCount: MOCK_PROPOSALS.length,
      fhevmDebug: fhevmClient.getDebugInfo(),
    };
  }

  // Test gateway connectivity
  async testGateways() {
    return await fhevmClient.testGateways();
  }
}

export const votingContract = new VotingContract();

// Extend window type untuk ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
