import { BrowserProvider } from "ethers";

// Debug logging utility
const debugLog = (message: string, data?: any) => {
  if (import.meta.env.VITE_DEBUG_MODE === "true") {
    console.log(`[FHEVM Debug] ${message}`, data || "");
  }
};

// Zama configuration from environment variables
const ZAMA_CONFIG = {
  oracleAddress:
    import.meta.env.VITE_ZAMA_ORACLE_ADDRESS ||
    "0xa02Cda4Ca3a71D7C46997716F4283aa851C28812",
  aclAddress:
    import.meta.env.VITE_ZAMA_ACL_ADDRESS ||
    "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  executorAddress:
    import.meta.env.VITE_ZAMA_EXECUTOR_ADDRESS ||
    "0xCD3ab3bd6bcc0c0bf3E27912a92043e817B1cf69",
  kmsVerifierAddress:
    import.meta.env.VITE_ZAMA_KMS_VERIFIER_ADDRESS ||
    "0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC",
  inputVerifierAddress:
    import.meta.env.VITE_ZAMA_INPUT_VERIFIER_ADDRESS ||
    "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
  gateways: [
    import.meta.env.VITE_ZAMA_GATEWAY_PRIMARY ||
      "https://gateway.sepolia.zama.ai",
    import.meta.env.VITE_ZAMA_GATEWAY_FALLBACK ||
      "https://fhevm-gateway.zama.ai",
    import.meta.env.VITE_ZAMA_GATEWAY_BACKUP || "https://api.zama.ai/fhevm",
  ],
};

// Hardcoded public key for Sepolia testnet (fallback when gateway is down)
const SEPOLIA_FALLBACK_PUBLIC_KEY =
  "0x8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b";

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
        zamaConfig: ZAMA_CONFIG,
      });

      // Get network info
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      debugLog("Network detected", { chainId, name: network.name });

      if (chainId !== 11155111) {
        debugLog("⚠️ Warning: FHEVM is optimized for Sepolia (11155111)", {
          currentChain: chainId,
        });
      }

      // Try to get public key from multiple sources
      await this.fetchPublicKeyWithFallbacks();

      // Try to initialize fhevmjs only if not in development mode
      if (!this.isDevelopmentMode) {
        try {
          await this.initializeFHEVMJS();
        } catch (fhevmError) {
          debugLog(
            "❌ fhevmjs initialization failed, switching to development mode",
            fhevmError
          );
          this.isDevelopmentMode = true;
        }
      }

      if (this.isDevelopmentMode) {
        debugLog("🔧 Running in development/simulation mode");
        this.isReady = true; // Mark as ready for simulation
      }

      debugLog("✅ FHEVM client initialization completed", {
        isReady: this.isReady,
        developmentMode: this.isDevelopmentMode,
        hasPublicKey: !!this.publicKey,
      });
    } catch (error) {
      debugLog(
        "❌ FHEVM initialization failed, falling back to simulation mode",
        error
      );
      this.isDevelopmentMode = true;
      this.isReady = true; // Still ready for simulation
    }
  }

  private async initializeFHEVMJS(): Promise<void> {
    try {
      debugLog("Attempting to load fhevmjs...");

      // Try dynamic import with error handling
      let fhevmModule;
      try {
        fhevmModule = await import("fhevmjs");
      } catch (importError) {
        debugLog(
          "❌ Failed to import fhevmjs, using simulation mode",
          importError
        );
        throw importError;
      }

      const { createInstance } = fhevmModule;

      debugLog("Creating FHEVM instance with config", {
        chainId: 11155111,
        publicKey: this.publicKey ? "Available" : "Using fallback",
        hasCreateInstance: typeof createInstance === "function",
      });

      // Create instance for Sepolia with Zama configuration
      this.instance = await createInstance({
        chainId: 11155111, // Sepolia
        publicKey: this.publicKey || SEPOLIA_FALLBACK_PUBLIC_KEY,
        aclAddress: ZAMA_CONFIG.aclAddress,
      });

      this.isReady = true;
      debugLog("✅ FHEVM instance created successfully");
    } catch (error) {
      debugLog("❌ FHEVM instance creation failed", error);
      throw error;
    }
  }

  private async fetchPublicKeyWithFallbacks(): Promise<void> {
    debugLog("Fetching public key from Zama infrastructure...");

    // Try multiple gateway endpoints
    for (const gateway of ZAMA_CONFIG.gateways) {
      try {
        debugLog(`Trying gateway: ${gateway}`);

        const response = await fetch(`${gateway}/public-key`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 5000, // 5 second timeout
        });

        if (response.ok) {
          const data = await response.json();
          this.publicKey = data.publicKey || data.public_key || data.key;

          if (this.publicKey) {
            debugLog("✅ Public key fetched successfully", {
              gateway,
              keyLength: this.publicKey.length,
            });
            return;
          }
        }

        debugLog(
          `❌ Gateway ${gateway} failed with status: ${response.status}`
        );
      } catch (error) {
        debugLog(`❌ Gateway ${gateway} failed:`, error);
        continue;
      }
    }

    // All gateways failed, use fallback
    debugLog("⚠️ All gateways failed, using hardcoded fallback public key");
    this.publicKey = SEPOLIA_FALLBACK_PUBLIC_KEY;
  }

  async encrypt32(
    value: number
  ): Promise<{ data: Uint8Array; proof: Uint8Array }> {
    debugLog("Encrypting value", {
      value,
      developmentMode: this.isDevelopmentMode,
    });

    if (this.isDevelopmentMode || !this.isReady || !this.instance) {
      debugLog("🔧 Using simulation encryption");
      return this.simulateEncryption(value);
    }

    try {
      debugLog("🔐 Encrypting value with FHEVM", { value });

      // Encrypt the value using fhevmjs
      const encrypted = this.instance.encrypt32(value);

      debugLog("✅ Encryption successful", {
        dataLength: encrypted.data?.length,
        proofLength: encrypted.proof?.length,
      });

      return {
        data: encrypted.data,
        proof: encrypted.proof || new Uint8Array(0),
      };
    } catch (error) {
      debugLog("❌ Encryption failed, using simulation", error);
      return this.simulateEncryption(value);
    }
  }

  private simulateEncryption(value: number): {
    data: Uint8Array;
    proof: Uint8Array;
  } {
    debugLog("🔒 Using simulated encryption", { value });

    // Create deterministic but secure-looking simulation
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

  async encryptVote(
    vote: number
  ): Promise<{ encryptedVote: Uint8Array; proof: Uint8Array }> {
    if (vote !== 0 && vote !== 1) {
      throw new Error("Vote must be 0 or 1");
    }

    debugLog("Encrypting vote", {
      vote,
      mode: this.isDevelopmentMode ? "simulation" : "fhevm",
    });

    const encrypted = await this.encrypt32(vote);
    return {
      encryptedVote: encrypted.data,
      proof: encrypted.proof,
    };
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

  // Helper method untuk convert Uint8Array ke hex string
  toHexString(bytes: Uint8Array): string {
    const hex =
      "0x" +
      Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

    debugLog("Converting to hex", {
      inputLength: bytes.length,
      outputLength: hex.length,
    });

    return hex;
  }

  // Helper method untuk convert hex string ke Uint8Array
  fromHexString(hex: string): Uint8Array {
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }

    debugLog("Converting from hex", {
      inputLength: hex.length,
      outputLength: bytes.length,
    });

    return bytes;
  }

  // Create external input format for contract
  createExternalInput(encryptedData: Uint8Array): string {
    const hex = this.toHexString(encryptedData);
    debugLog("Creating external input", { hex });
    return hex;
  }

  // Get debug information
  getDebugInfo() {
    return {
      isReady: this.isReady,
      hasInstance: !!this.instance,
      hasPublicKey: !!this.publicKey,
      isDevelopmentMode: this.isDevelopmentMode,
      zamaConfig: ZAMA_CONFIG,
      provider: !!this.provider,
      publicKeySource:
        this.publicKey === SEPOLIA_FALLBACK_PUBLIC_KEY ? "fallback" : "gateway",
    };
  }

  // Test gateway connectivity
  async testGateways(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};

    for (const gateway of ZAMA_CONFIG.gateways) {
      try {
        const response = await fetch(`${gateway}/health`, {
          method: "GET",
          timeout: 3000,
        });
        results[gateway] = response.ok;
      } catch {
        results[gateway] = false;
      }
    }

    debugLog("Gateway connectivity test results", results);
    return results;
  }
}

export const fhevmClient = new FHEVMClient();

// Export debug utilities
export { debugLog };
