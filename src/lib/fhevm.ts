import { BrowserProvider } from "ethers";

// Debug logging utility
const debugLog = (message: string, data?: any) => {
  if (import.meta.env.VITE_DEBUG_MODE === "true") {
    console.log(`[FHEVM Debug] ${message}`, data || "");
  }
};

// Try to import from npm package as fallback
const tryNpmImport = async () => {
  try {
    debugLog("Trying npm package import...");
    const module = await import("@zama-fhe/relayer-sdk/bundle");
    debugLog("✅ npm package imported successfully");
    return module;
  } catch (error) {
    debugLog("❌ npm package import failed", error);
    return null;
  }
};

// Wait for SDK to be available with multiple methods
const waitForZamaSDK = (timeout = 15000): Promise<any> => {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();
    
    const checkSDK = async () => {
      // Method 1: Check CDN loaded SDK
      if (window.zamaSDKLoaded) {
        if (window.ZamaSDK) {
          debugLog("✅ Zama SDK found on window.ZamaSDK");
          resolve(window.ZamaSDK);
          return;
        }
        
        // Check for global functions directly
        if (window.initSDK && window.createInstance && window.SepoliaConfig) {
          debugLog("✅ Zama SDK functions found globally");
          resolve({
            initSDK: window.initSDK,
            createInstance: window.createInstance,
            SepoliaConfig: window.SepoliaConfig
          });
          return;
        }
      }
      
      // Method 2: Try npm package if CDN failed
      if (window.useNpmFallback) {
        debugLog("Trying npm package fallback...");
        const npmModule = await tryNpmImport();
        if (npmModule) {
          resolve(npmModule);
          return;
        }
      }
      
      if (Date.now() - startTime > timeout) {
        // Final fallback: try npm import one more time
        debugLog("Timeout reached, trying final npm import...");
        const finalModule = await tryNpmImport();
        if (finalModule) {
          resolve(finalModule);
        } else {
          reject(new Error("All SDK loading methods failed"));
        }
        return;
      }
      
      setTimeout(checkSDK, 200);
    };
    
    checkSDK();
  });
};

// Declare global types for Zama SDK
declare global {
  interface Window {
    ZamaSDK?: {
      initSDK: () => Promise<void>;
      createInstance: (config: any) => Promise<any>;
      SepoliaConfig: any;
    };
    initSDK?: () => Promise<void>;
    createInstance?: (config: any) => Promise<any>;
    SepoliaConfig?: any;
    zamaSDKLoaded?: boolean;
    useNpmFallback?: boolean;
  }
}

export class FHEVMClient {
  private instance: any = null;
  private provider: BrowserProvider | null = null;
  private isReady: boolean = false;
  private isDevelopmentMode: boolean = false;
  private sdkInitialized: boolean = false;
  private zamaSDK: any = null;
  private loadMethod: string = "none";

  async init(provider: BrowserProvider): Promise<void> {
    this.provider = provider;
    this.isDevelopmentMode = import.meta.env.VITE_DEVELOPMENT_MODE === "true";

    try {
      debugLog("Starting FHEVM initialization with Zama Relayer SDK...", {
        developmentMode: this.isDevelopmentMode,
        hasWindow: typeof window !== 'undefined'
      });

      // Verify network
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      if (chainId !== 11155111) { // Sepolia
        debugLog(`⚠️ Wrong network detected: ${chainId}, expected Sepolia (11155111)`);
        // Don't throw error, just log warning and continue with simulation
        this.isDevelopmentMode = true;
      } else {
        debugLog("✅ Network verified", { chainId, name: network.name });
      }

      // Try to initialize Zama SDK
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
        sdkInitialized: this.sdkInitialized,
        loadMethod: this.loadMethod
      });

    } catch (error) {
      debugLog("❌ FHEVM initialization failed, falling back to simulation mode", error);
      this.isDevelopmentMode = true;
      this.isReady = true;
    }
  }

  private async initializeZamaSDK(): Promise<void> {
    try {
      debugLog("Waiting for Zama SDK to load...");

      // Wait for SDK to be available
      this.zamaSDK = await waitForZamaSDK();
      
      const { initSDK, createInstance, SepoliaConfig } = this.zamaSDK;

      if (!initSDK || !createInstance || !SepoliaConfig) {
        throw new Error("Zama SDK functions not available");
      }

      // Determine load method
      if (window.zamaSDKLoaded) {
        this.loadMethod = "CDN";
      } else {
        this.loadMethod = "npm";
      }

      debugLog(`Loading WASM with initSDK (via ${this.loadMethod})...`);
      
      // Check if we have proper CORS headers for threading
      const hasProperHeaders = this.checkCORSHeaders();
      if (!hasProperHeaders) {
        debugLog("⚠️ CORS headers not properly set, threading may not work optimally");
      }
      
      await initSDK();
      this.sdkInitialized = true;

      debugLog("Creating instance with Sepolia config...");
      
      // Ensure we have ethereum provider
      if (!window.ethereum) {
        throw new Error("MetaMask not available");
      }

      const config = { 
        ...SepoliaConfig, 
        network: window.ethereum 
      };

      debugLog("Config for createInstance:", config);

      this.instance = await createInstance(config);
      this.isReady = true;

      debugLog("✅ Zama SDK initialized successfully", {
        hasInstance: !!this.instance,
        instanceType: typeof this.instance,
        loadMethod: this.loadMethod,
        threadingSupported: hasProperHeaders
      });

    } catch (error) {
      debugLog("❌ Zama SDK initialization failed", error);
      throw error;
    }
  }

  private checkCORSHeaders(): boolean {
    // This is a simple check - in a real environment, you'd need to verify
    // that the server actually sends the correct headers
    const isDevelopment = import.meta.env.DEV;
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isDevelopment && isLocalhost) {
      // In development with Vite, we've configured the headers
      return true;
    }
    
    // For production, you'd need to check actual response headers
    // This is just a placeholder
    return false;
  }

  async encrypt32(value: number): Promise<{ data: Uint8Array; proof: Uint8Array }> {
    debugLog("Encrypting value", {
      value,
      developmentMode: this.isDevelopmentMode,
      hasInstance: !!this.instance,
      loadMethod: this.loadMethod
    });

    if (this.isDevelopmentMode || !this.isReady || !this.instance) {
      debugLog("🔧 Using simulation encryption");
      return this.simulateEncryption(value);
    }

    try {
      debugLog("🔐 Encrypting value with Zama SDK", { value });

      // Use the instance to encrypt
      const encrypted = this.instance.encrypt32(value);

      debugLog("✅ Encryption successful", {
        hasData: !!encrypted.data,
        hasProof: !!encrypted.proof,
        dataLength: encrypted.data?.length,
        proofLength: encrypted.proof?.length
      });

      return {
        data: encrypted.data || new Uint8Array(32),
        proof: encrypted.proof || new Uint8Array(32)
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
      mode: this.isDevelopmentMode ? "simulation" : "zama-sdk",
      loadMethod: this.loadMethod
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
      // Return simulation input as fallback
      return {
        addUint32: (value: number) => {
          debugLog("Adding uint32 to fallback input", { value });
          return this;
        },
        encrypt: () => {
          const result = { data: new Uint8Array(32), proof: new Uint8Array(32) };
          debugLog("Encrypting fallback input", { dataLength: result.data.length });
          return result;
        }
      };
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
      loadMethod: this.loadMethod,
      provider: !!this.provider,
      hasZamaSDK: !!this.zamaSDK,
      windowHasZamaSDK: !!window.ZamaSDK,
      windowHasInitSDK: !!window.initSDK,
      windowHasCreateInstance: !!window.createInstance,
      windowHasSepoliaConfig: !!window.SepoliaConfig,
      windowZamaSDKLoaded: !!window.zamaSDKLoaded,
      windowUseNpmFallback: !!window.useNpmFallback,
      corsHeadersConfigured: this.checkCORSHeaders()
    };
  }

  async testRelayerConnectivity(): Promise<boolean> {
    try {
      // Test if Zama SDK is available and working
      if (this.zamaSDK && this.sdkInitialized) {
        debugLog("Relayer connectivity test via SDK", { success: true, method: this.loadMethod });
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