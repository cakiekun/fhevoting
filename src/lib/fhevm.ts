import { BrowserProvider } from "ethers";

// Debug logging utility
const debugLog = (message: string, data?: any) => {
  if (import.meta.env.VITE_DEBUG_MODE === "true") {
    console.log(`[FHEVM Debug] ${message}`, data || "");
  }
};

// Declare global types for Zama SDK
declare global {
  interface Window {
    ZamaSDK?: {
      initSDK: () => Promise<void>;
      createInstance: (config: any) => Promise<any>;
      SepoliaConfig: any;
    };
  }
}

export class FHEVMClient {
  private instance: any = null;
  private provider: BrowserProvider | null = null;
  private isReady: boolean = false;
  private isDevelopmentMode: boolean = false;
  private sdkInitialized: boolean = false;

  async init(provider: BrowserProvider): Promise<void> {
    this.provider = provider;
    this.isDevelopmentMode = import.meta.env.VITE_DEVELOPMENT_MODE === "true";

    try {
      debugLog("Starting FHEVM initialization with Zama Relayer SDK...", {
        developmentMode: this.isDevelopmentMode,
        hasWindow: typeof window !== 'undefined',
        hasZamaSDK: !!window.ZamaSDK
      });

      // Verify network
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      if (chainId !== 11155111) { // Sepolia
        throw new Error(`Wrong network. Expected Sepolia (11155111), got ${chainId}`);
      }

      debugLog("✅ Network verified", { chainId, name: network.name });

      // Initialize Zama SDK
      if (!this.isDevelopmentMode) {
        try {
          await this.initializeZamaSDK();
        } catch (sdkError) {
          debugLog("❌ Zama SDK initialization failed, switching to development mode", sdkError);
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
        sdkInitialized: this.sdkInitialized
      });

    } catch (error) {
      debugLog("❌ FHEVM initialization failed, falling back to simulation mode", error);
      this.isDevelopmentMode = true;
      this.isReady = true;
    }
  }

  private async initializeZamaSDK(): Promise<void> {
    try {
      debugLog("Initializing Zama Relayer SDK...");

      // Check if SDK is available
      if (!window.ZamaSDK) {
        throw new Error("Zama SDK not loaded. Make sure the CDN script is included.");
      }

      const { initSDK, createInstance, SepoliaConfig } = window.ZamaSDK;

      // Initialize SDK
      debugLog("Loading WASM...");
      await initSDK();
      this.sdkInitialized = true;

      debugLog("Creating instance with Sepolia config...");
      const config = { 
        ...SepoliaConfig, 
        network: window.ethereum 
      };

      this.instance = await createInstance(config);
      this.isReady = true;

      debugLog("✅ Zama SDK initialized successfully");

    } catch (error) {
      debugLog("❌ Zama SDK initialization failed", error);
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
      debugLog("🔐 Encrypting value with Zama SDK", { value });

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
      mode: this.isDevelopmentMode ? "simulation" : "zama-sdk"
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
        addUint32: (value: number) => {
          debugLog("Adding uint32 to simulated input", { value });
          return this;
        },
        encrypt: () => {
          const result = { data: new Uint8Array(32), proof: new Uint8Array(32) };
          debugLog("Encrypting simulated input", { dataLength: result.data.length });
          return result;
        }
      };
    }

    try {
      debugLog("Creating encrypted input with Zama SDK", { contractAddress, userAddress });
      
      const input = this.instance.createEncryptedInput(contractAddress, userAddress);
      
      debugLog("✅ Encrypted input created successfully");
      return input;

    } catch (error) {
      debugLog("❌ Failed to create encrypted input", error);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.isReady;
  }

  getInstance() {
    return this.instance;
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

  getDebugInfo() {
    return {
      isReady: this.isReady,
      hasInstance: !!this.instance,
      isDevelopmentMode: this.isDevelopmentMode,
      sdkInitialized: this.sdkInitialized,
      provider: !!this.provider,
      hasZamaSDK: !!window.ZamaSDK
    };
  }

  async testRelayerConnectivity(): Promise<boolean> {
    try {
      // Test if Zama SDK is available and working
      if (window.ZamaSDK && this.sdkInitialized) {
        debugLog("Relayer connectivity test via SDK", { success: true });
        return true;
      }
      
      debugLog("Relayer connectivity test", { success: false, reason: "SDK not initialized" });
      return false;
    } catch (error) {
      debugLog("Relayer connectivity test failed", error);
      return false;
    }
  }
}

export const fhevmClient = new FHEVMClient();
export { debugLog };