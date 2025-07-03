import { BrowserProvider } from "ethers";

// Debug logging utility
const debugLog = (message: string, data?: any) => {
  if (import.meta.env.VITE_DEBUG_MODE === "true") {
    console.log(`[FHEVM Debug] ${message}`, data || "");
  }
};

// Zama FHEVM configuration for Sepolia
const ZAMA_CONFIG = {
  chainId: 11155111, // Sepolia
  network: "sepolia",
  
  // Contract addresses
  executorAddress: import.meta.env.VITE_FHEVM_EXECUTOR_CONTRACT || "0x848B0066793BcC60346Da1F49049357399B8D595",
  aclAddress: import.meta.env.VITE_ACL_CONTRACT || "0x687820221192C5B662b25367F70076A37bc79b6c",
  kmsVerifierAddress: import.meta.env.VITE_KMS_VERIFIER_CONTRACT || "0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC",
  inputVerifierAddress: import.meta.env.VITE_INPUT_VERIFIER_CONTRACT || "0xbc91f3daD1A5F19F8390c400196e58073B6a0BC4",
  
  // Relayer URL - the only external service needed for web apps
  relayerUrl: import.meta.env.VITE_RELAYER_URL || "https://relayer.testnet.zama.cloud"
};

export class FHEVMClient {
  private instance: any = null;
  private provider: BrowserProvider | null = null;
  private isReady: boolean = false;
  private publicKey: string | null = null;
  private isDevelopmentMode: boolean = false;

  async init(provider: BrowserProvider): Promise<void> {
    this.provider = provider;
    this.isDevelopmentMode = import.meta.env.VITE_DEVELOPMENT_MODE === "true";

    try {
      debugLog("Starting FHEVM initialization...", {
        developmentMode: this.isDevelopmentMode,
        relayerUrl: ZAMA_CONFIG.relayerUrl
      });

      // Verify network
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      if (chainId !== ZAMA_CONFIG.chainId) {
        throw new Error(`Wrong network. Expected Sepolia (${ZAMA_CONFIG.chainId}), got ${chainId}`);
      }

      debugLog("✅ Network verified", { chainId, name: network.name });

      // Get public key from relayer
      await this.fetchPublicKeyFromRelayer();

      // Initialize FHEVM instance
      if (!this.isDevelopmentMode) {
        try {
          await this.initializeFHEVMJS();
        } catch (fhevmError) {
          debugLog("❌ fhevmjs initialization failed, switching to development mode", fhevmError);
          this.isDevelopmentMode = true;
        }
      }

      if (this.isDevelopmentMode) {
        debugLog("🔧 Running in development/simulation mode");
        this.isReady = true;
      }

      debugLog("✅ FHEVM client initialization completed", {
        isReady: this.isReady,
        developmentMode: this.isDevelopmentMode,
        hasPublicKey: !!this.publicKey
      });

    } catch (error) {
      debugLog("❌ FHEVM initialization failed, falling back to simulation mode", error);
      this.isDevelopmentMode = true;
      this.isReady = true;
    }
  }

  private async fetchPublicKeyFromRelayer(): Promise<void> {
    debugLog("Fetching public key from Zama relayer...");

    try {
      const response = await fetch(`${ZAMA_CONFIG.relayerUrl}/public-key`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        }
      });

      if (!response.ok) {
        throw new Error(`Relayer responded with status: ${response.status}`);
      }

      const data = await response.json();
      this.publicKey = data.publicKey || data.public_key || data.key;
      
      if (!this.publicKey) {
        throw new Error("Public key not found in relayer response");
      }

      debugLog("✅ Public key fetched from relayer", {
        keyLength: this.publicKey.length
      });

    } catch (error) {
      debugLog("❌ Failed to fetch public key from relayer", error);
      throw error;
    }
  }

  private async initializeFHEVMJS(): Promise<void> {
    try {
      debugLog("Attempting to load fhevmjs...");

      const fhevmModule = await import("fhevmjs");
      const { createInstance } = fhevmModule;

      if (!this.publicKey) {
        throw new Error("Public key is required for FHEVM initialization");
      }

      debugLog("Creating FHEVM instance with Sepolia config", {
        chainId: ZAMA_CONFIG.chainId,
        publicKeyLength: this.publicKey.length,
        aclAddress: ZAMA_CONFIG.aclAddress
      });

      // Create instance with proper Sepolia configuration
      this.instance = await createInstance({
        chainId: ZAMA_CONFIG.chainId,
        publicKey: this.publicKey,
        aclAddress: ZAMA_CONFIG.aclAddress,
        kmsVerifierAddress: ZAMA_CONFIG.kmsVerifierAddress,
        inputVerifierAddress: ZAMA_CONFIG.inputVerifierAddress
      });

      this.isReady = true;
      debugLog("✅ FHEVM instance created successfully");

    } catch (error) {
      debugLog("❌ FHEVM instance creation failed", error);
      throw error;
    }
  }

  async encrypt32(value: number): Promise<{ data: Uint8Array; proof: Uint8Array }> {
    debugLog("Encrypting value", {
      value,
      developmentMode: this.isDevelopmentMode,
      hasInstance: !!this.instance
    });

    if (this.isDevelopmentMode || !this.isReady || !this.instance) {
      debugLog("🔧 Using simulation encryption");
      return this.simulateEncryption(value);
    }

    try {
      debugLog("🔐 Encrypting value with FHEVM", { value });

      const encrypted = this.instance.encrypt32(value);

      debugLog("✅ Encryption successful", {
        dataLength: encrypted.data?.length,
        proofLength: encrypted.proof?.length
      });

      return {
        data: encrypted.data,
        proof: encrypted.proof || new Uint8Array(0)
      };

    } catch (error) {
      debugLog("❌ Encryption failed, using simulation", error);
      return this.simulateEncryption(value);
    }
  }

  private simulateEncryption(value: number): { data: Uint8Array; proof: Uint8Array } {
    debugLog("🔒 Using simulated encryption", { value });

    const data = new Uint8Array(32);
    const proof = new Uint8Array(32);

    // Fill with pseudo-random data based on value and timestamp
    const seed = value + Date.now();
    for (let i = 0; i < 32; i++) {
      data[i] = (seed * 7 + i * 13) % 256;
      proof[i] = (seed * 11 + i * 17) % 256;
    }

    return { data, proof };
  }

  async encryptVote(vote: number): Promise<{ encryptedVote: Uint8Array; proof: Uint8Array }> {
    if (vote < 0 || vote > 255) {
      throw new Error("Vote must be between 0 and 255");
    }

    debugLog("Encrypting vote", {
      vote,
      mode: this.isDevelopmentMode ? "simulation" : "fhevm"
    });

    const encrypted = await this.encrypt32(vote);
    return {
      encryptedVote: encrypted.data,
      proof: encrypted.proof
    };
  }

  // Create encrypted input for contract calls
  async createEncryptedInput(contractAddress: string, userAddress: string): Promise<any> {
    if (this.isDevelopmentMode || !this.instance) {
      debugLog("🔧 Creating simulated encrypted input");
      return {
        addUint32: (value: number) => ({ data: new Uint8Array(32), proof: new Uint8Array(32) }),
        encrypt: () => ({ data: new Uint8Array(32), proof: new Uint8Array(32) })
      };
    }

    try {
      debugLog("Creating encrypted input", { contractAddress, userAddress });
      
      const input = this.instance.createEncryptedInput(contractAddress, userAddress);
      
      debugLog("✅ Encrypted input created successfully");
      return input;

    } catch (error) {
      debugLog("❌ Failed to create encrypted input", error);
      throw error;
    }
  }

  // Request decryption through relayer
  async requestDecryption(
    contractAddress: string,
    ciphertext: string,
    userAddress: string
  ): Promise<any> {
    if (this.isDevelopmentMode) {
      debugLog("🔧 Simulating decryption request");
      return { success: true, result: Math.floor(Math.random() * 100) };
    }

    try {
      debugLog("Requesting decryption through relayer", {
        contractAddress,
        ciphertext: ciphertext.slice(0, 20) + "...",
        userAddress
      });

      const response = await fetch(`${ZAMA_CONFIG.relayerUrl}/decrypt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contractAddress,
          ciphertext,
          userAddress,
          chainId: ZAMA_CONFIG.chainId
        })
      });

      if (!response.ok) {
        throw new Error(`Decryption request failed: ${response.statusText}`);
      }

      const result = await response.json();
      debugLog("✅ Decryption completed", result);
      
      return result;

    } catch (error) {
      debugLog("❌ Decryption request failed", error);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.isReady;
  }

  getInstance() {
    return this.instance;
  }

  getZamaConfig() {
    return ZAMA_CONFIG;
  }

  isSimulationMode(): boolean {
    return this.isDevelopmentMode;
  }

  // Helper methods for data conversion
  toHexString(bytes: Uint8Array): string {
    const hex = "0x" + Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");

    debugLog("Converting to hex", {
      inputLength: bytes.length,
      outputLength: hex.length
    });

    return hex;
  }

  fromHexString(hex: string): Uint8Array {
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }

    debugLog("Converting from hex", {
      inputLength: hex.length,
      outputLength: bytes.length
    });

    return bytes;
  }

  createExternalInput(encryptedData: Uint8Array): string {
    const hex = this.toHexString(encryptedData);
    debugLog("Creating external input", { hex: hex.slice(0, 20) + "..." });
    return hex;
  }

  getDebugInfo() {
    return {
      isReady: this.isReady,
      hasInstance: !!this.instance,
      hasPublicKey: !!this.publicKey,
      isDevelopmentMode: this.isDevelopmentMode,
      zamaConfig: ZAMA_CONFIG,
      provider: !!this.provider,
      publicKeyLength: this.publicKey?.length || 0
    };
  }

  async testRelayerConnectivity(): Promise<boolean> {
    try {
      const response = await fetch(`${ZAMA_CONFIG.relayerUrl}/health`, {
        method: "GET",
        timeout: 3000
      });
      const isOnline = response.ok;
      debugLog("Relayer connectivity test", { isOnline, url: ZAMA_CONFIG.relayerUrl });
      return isOnline;
    } catch {
      debugLog("Relayer connectivity test failed", { url: ZAMA_CONFIG.relayerUrl });
      return false;
    }
  }
}

export const fhevmClient = new FHEVMClient();
export { debugLog };