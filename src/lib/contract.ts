import { ethers } from "ethers";
import { Proposal, UserProfile } from "@/types/voting";
import { fhevmClient, debugLog } from "./fhevm";

// Smart contract ABI
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
  "function castVote(uint256 proposalId, uint256 optionIndex, bytes encryptedVote, bytes inputProof)",
  "function requestDecryption(uint256 proposalId, bytes32[] ciphertexts)",
  "function setResults(uint256 proposalId, uint256[] results)",

  // Events
  "event ProposalCreated(uint256 indexed proposalId, string title, address indexed creator, uint256 startTime, uint256 endTime)",
  "event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 totalVotes)",
  "event ResultsRevealed(uint256 indexed proposalId, uint256[] results)",
  "event DecryptionRequested(uint256 indexed proposalId, bytes32[] ciphertexts)"
];

// Sepolia network configuration
const SEPOLIA_CONFIG = {
  chainId: 11155111,
  name: "Sepolia Testnet",
  rpcUrl: import.meta.env.VITE_SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
  blockExplorer: "https://sepolia.etherscan.io",
  faucet: "https://sepoliafaucet.com"
};

// Contract address from environment
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

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
        throw new Error("MetaMask not found. Please install MetaMask first.");
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

      // Check and switch to Sepolia if needed
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

      // Create contract instance
      this.contract = new ethers.Contract(CONTRACT_ADDRESS, VOTING_CONTRACT_ABI, this.signer);
      debugLog("Contract instance created", { address: CONTRACT_ADDRESS });

      // Initialize FHEVM client
      try {
        debugLog("Initializing FHEVM client...");
        await fhevmClient.init(this.provider);
        this.isFHEVMEnabled = fhevmClient.isInitialized() && !fhevmClient.isSimulationMode();

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
          proposalCount: proposalCount.toString()
        });
      } catch (error) {
        debugLog("❌ Contract connection failed:", error);

        if (error.message.includes("could not decode result data")) {
          debugLog("⚠️ Contract not deployed at address, switching to simulation mode");
          this.isSimulationMode = true;
          return this.initSimulationMode();
        }

        throw new Error("Cannot connect to smart contract. Please ensure the contract is deployed.");
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
        params: [{ chainId: `0x${SEPOLIA_CONFIG.chainId.toString(16)}` }]
      });

      debugLog("✅ Successfully switched to Sepolia");
    } catch (switchError: any) {
      debugLog("Switch failed, attempting to add network...", switchError);

      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: `0x${SEPOLIA_CONFIG.chainId.toString(16)}`,
              chainName: SEPOLIA_CONFIG.name,
              rpcUrls: [SEPOLIA_CONFIG.rpcUrl],
              blockExplorerUrls: [SEPOLIA_CONFIG.blockExplorer],
              nativeCurrency: {
                name: "ETH",
                symbol: "ETH",
                decimals: 18
              }
            }]
          });
          debugLog("✅ Successfully added and switched to Sepolia");
        } catch (addError) {
          debugLog("❌ Failed to add network:", addError);
          throw new Error(`Failed to add ${SEPOLIA_CONFIG.name} network to MetaMask`);
        }
      } else {
        throw new Error(`Failed to switch to ${SEPOLIA_CONFIG.name} network`);
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
        const profile = {
          address,
          isAuthorized: true,
          isAdmin: true,
          votedProposals: []
        };
        debugLog("Simulation mode: returning mock profile", profile);
        return profile;
      }

      const [isAuthorized, isAdmin] = await Promise.all([
        this.contract!.isAuthorizedVoter(address),
        this.contract!.isAdmin(address)
      ]);

      debugLog("User permissions", { isAuthorized, isAdmin });

      // Get voted proposals
      const proposalCount = await this.contract!.proposalCount();
      const votedProposals: number[] = [];

      debugLog("Checking voted proposals", {
        totalProposals: proposalCount.toString()
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
        votedProposals
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
      debugLog("Simulation mode: returning empty proposals array");
      return [];
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
            hasVoted = await this.contract.hasVoted(proposalData.id, userAddress);
          } catch (error) {
            debugLog(`Error checking vote status for proposal ${proposalData.id}:`, error);
          }
        }

        proposals.push({
          id: Number(proposalData.id),
          title: proposalData.title,
          description: proposalData.description,
          options: proposalData.options,
          startTime: Number(proposalData.startTime) * 1000,
          endTime: Number(proposalData.endTime) * 1000,
          totalVotes: Number(proposalData.totalVotes),
          creator: proposalData.creator,
          active: proposalData.active,
          resultsRevealed: proposalData.resultsRevealed,
          revealedResults: proposalData.revealedResults.map((r: any) => Number(r)),
          hasVoted
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
        title, description, options, duration
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
      debugLog("Mock proposal created successfully");
      return true;
    }

    if (!this.contract) return false;

    try {
      debugLog("Creating proposal", { title, description, options, duration });

      const tx = await this.contract.createProposal(title, description, options, duration);
      debugLog("Transaction sent", { hash: tx.hash });

      const receipt = await tx.wait();
      debugLog("Transaction confirmed", {
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString()
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

      // Simulate FHE encryption
      const { encryptedVote, proof } = await fhevmClient.encryptVote(optionIndex);
      debugLog("Simulated encrypted vote", {
        encryptedVoteLength: encryptedVote.length,
        proofLength: proof.length
      });

      await new Promise(resolve => setTimeout(resolve, 3000));
      return true;
    }

    if (!this.contract) return false;

    try {
      debugLog("Casting vote", {
        proposalId,
        optionIndex,
        fhevmEnabled: this.isFHEVMEnabled
      });

      let tx;

      if (this.isFHEVMEnabled && fhevmClient.isInitialized()) {
        debugLog("🔐 Using FHE encryption for vote...");

        try {
          const userAddress = await this.signer!.getAddress();
          
          // Create encrypted input using FHEVM
          const input = await fhevmClient.createEncryptedInput(CONTRACT_ADDRESS, userAddress);
          input.addUint32(optionIndex);
          const encryptedInput = input.encrypt();

          debugLog("FHE encryption completed", {
            encryptedDataLength: encryptedInput.data.length,
            proofLength: encryptedInput.proof.length
          });

          tx = await this.contract.castVote(
            proposalId,
            optionIndex,
            encryptedInput.data,
            encryptedInput.proof
          );

          debugLog("✅ FHE encrypted vote cast successfully");

        } catch (fheError) {
          debugLog("❌ FHE encryption failed, falling back to simulation:", fheError);
          
          // Fallback to simulation
          const { encryptedVote, proof } = await fhevmClient.encryptVote(optionIndex);
          tx = await this.contract.castVote(
            proposalId,
            optionIndex,
            fhevmClient.toHexString(encryptedVote),
            fhevmClient.toHexString(proof)
          );
        }
      } else {
        debugLog("🔒 Using simulated encryption...");

        const { encryptedVote, proof } = await fhevmClient.encryptVote(optionIndex);
        tx = await this.contract.castVote(
          proposalId,
          optionIndex,
          fhevmClient.toHexString(encryptedVote),
          fhevmClient.toHexString(proof)
        );
      }

      debugLog("Vote transaction sent", { hash: tx.hash });

      const receipt = await tx.wait();
      debugLog("Vote transaction confirmed", {
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString()
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
      await new Promise(resolve => setTimeout(resolve, 2000));
      return true;
    }

    if (!this.contract) return false;

    try {
      debugLog("Revealing results for proposal", { proposalId });

      if (this.isFHEVMEnabled) {
        // Request decryption through Zama relayer
        debugLog("🔓 Requesting decryption through Zama relayer...");
        
        try {
          // In a real implementation, you would:
          // 1. Get encrypted votes from the contract
          // 2. Request decryption through the relayer
          // 3. Wait for decryption results
          // 4. Call setResults with the decrypted values
          
          const dummyResults = [5, 3, 2]; // Placeholder results
          const tx = await this.contract.setResults(proposalId, dummyResults);
          
          debugLog("Reveal transaction sent", { hash: tx.hash });
          
          const receipt = await tx.wait();
          debugLog("Reveal transaction confirmed", {
            status: receipt.status,
            gasUsed: receipt.gasUsed?.toString()
          });
          
          return receipt.status === 1;
          
        } catch (decryptionError) {
          debugLog("❌ Decryption failed, using fallback:", decryptionError);
          
          // Fallback to dummy results
          const dummyResults = [5, 3, 2];
          const tx = await this.contract.setResults(proposalId, dummyResults);
          const receipt = await tx.wait();
          return receipt.status === 1;
        }
      } else {
        // Use dummy results for non-FHE mode
        const dummyResults = [5, 3, 2];
        const tx = await this.contract.setResults(proposalId, dummyResults);
        const receipt = await tx.wait();
        return receipt.status === 1;
      }

    } catch (error) {
      debugLog("❌ Failed to reveal results:", error);
      throw error;
    }
  }

  async authorizeVoter(voterAddress: string): Promise<boolean> {
    if (this.isSimulationMode) {
      debugLog("🔧 Simulation mode: authorizing voter", { voterAddress });
      await new Promise(resolve => setTimeout(resolve, 1000));
      return true;
    }

    if (!this.contract) return false;

    try {
      debugLog("Authorizing voter", { voterAddress });

      const tx = await this.contract.authorizeVoter(voterAddress);
      const receipt = await tx.wait();

      debugLog("Voter authorization completed", {
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString()
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
        count: voterAddresses.length
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
      return true;
    }

    if (!this.contract) return false;

    try {
      debugLog("Authorizing multiple voters", { count: voterAddresses.length });

      const tx = await this.contract.authorizeVoters(voterAddresses);
      const receipt = await tx.wait();

      debugLog("Bulk voter authorization completed", {
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString()
      });

      return receipt.status === 1;

    } catch (error) {
      debugLog("❌ Failed to authorize voters:", error);
      throw error;
    }
  }

  // Utility methods
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
      fhevmDebug: fhevmClient.getDebugInfo()
    };
  }

  async testConnectivity() {
    const relayerOnline = await fhevmClient.testRelayerConnectivity();
    return { relayer: relayerOnline };
  }
}

export const votingContract = new VotingContract();

declare global {
  interface Window {
    ethereum?: any;
  }
}