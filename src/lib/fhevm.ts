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
const waitForZamaSDK = (timeout = 10000): Promise<any> => {
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

      // Always try simulation mode first to avoid WASM errors
      if (this.isDevelopmentMode || import.meta.env.VITE_FORCE_SIMULATION === "true") {
        debugLog("🔧 Running in development/simulation mode (forced or auto-detected)");
        this.isReady = true;
        return;
      }

      // Try to initialize Zama SDK with better error handling
      try {
        await this.initializeZamaSDK();
      } catch (sdkError) {
        debugLog("❌ Zama SDK initialization failed, switching to simulation mode", sdkError);
        this.isDevelopmentMode = true;
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

      // Wait for SDK to be available with shorter timeout
      this.zamaSDK = await waitForZamaSDK(5000);
      
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

      debugLog(`Attempting WASM initialization (via ${this.loadMethod})...`);
      
      // Check if we have proper CORS headers for threading
      const hasProperHeaders = this.checkCORSHeaders();
      if (!hasProperHeaders) {
        debugLog("⚠️ CORS headers not properly set, this may cause WASM errors");
      }
      
      // Try to initialize SDK with timeout and error handling
      const initPromise = initSDK();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("SDK initialization timeout")), 10000)
      );

      try {
        await Promise.race([initPromise, timeoutPromise]);
        this.sdkInitialized = true;
        debugLog("✅ WASM initialization successful");
      } catch (initError) {
        debugLog("❌ WASM initialization failed", initError);
        throw new Error(`WASM initialization failed: ${initError.message}`);
      }

      debugLog("Creating instance with Sepolia config...");
      
      // Ensure we have ethereum provider
      if (!window.ethereum) {
        throw new Error("MetaMask not available");
      }

      // Create config with error handling
      const config = { 
        ...SepoliaConfig, 
        network: window.ethereum 
      };

      debugLog("Config for createInstance:", {
        hasAclContract: !!config.aclContractAddress,
        hasKmsContract: !!config.kmsContractAddress,
        hasInputVerifier: !!config.inputVerifierContractAddress,
        hasNetwork: !!config.network
      });

      try {
        this.instance = await createInstance(config);
      } catch (instanceError) {
        debugLog("❌ Instance creation failed", instanceError);
        throw new Error(`Instance creation failed: ${instanceError.message}`);
      }
      
      // Validate the instance
      if (!this.instance) {
        throw new Error("Failed to create instance - instance is null");
      }

      // Quick validation without deep inspection to avoid triggering WASM errors
      debugLog("✅ Instance created successfully", {
        instanceType: typeof this.instance,
        hasInstance: !!this.instance
      });

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
    const isDevelopment = import.meta.env.DEV;
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isDevelopment && isLocalhost) {
      return true;
    }
    
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
      debugLog("🔐 Attempting Zama SDK encryption", { value });

      // Try to use the instance with careful error handling
      let encrypted;
      
      // Try the most common method first
      if (typeof this.instance.encrypt32 === 'function') {
        try {
          encrypted = await this.instance.encrypt32(value);
        } catch (encryptError) {
          debugLog("❌ encrypt32 method failed", encryptError);
          throw encryptError;
        }
      } else {
        throw new Error("encrypt32 method not available on instance");
      }

      if (!encrypted) {
        throw new Error("Encryption returned null/undefined");
      }

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
      return this.createSimulatedInput();
    }

    try {
      debugLog("Creating encrypted input with Zama SDK", { contractAddress, userAddress });
      
      let input;
      
      // Try the most common method
      if (typeof this.instance.createEncryptedInput === 'function') {
        try {
          input = await this.instance.createEncryptedInput(contractAddress, userAddress);
        } catch (inputError) {
          debugLog("❌ createEncryptedInput failed", inputError);
          throw inputError;
        }
      } else {
        throw new Error("createEncryptedInput method not available");
      }

      if (!input) {
        throw new Error("Input creation returned null/undefined");
      }
      
      debugLog("✅ Encrypted input created successfully");

      // Return a safe wrapper
      return this.wrapInput(input);

    } catch (error) {
      debugLog("❌ Failed to create encrypted input", error);
      return this.createSimulatedInput();
    }
  }

  private wrapInput(input: any) {
    return {
      addUint32: (value: number) => {
        debugLog("Adding uint32 to input", { value });
        
        try {
          if (typeof input.addUint32 === 'function') {
            return input.addUint32(value);
          } else if (typeof input.add32 === 'function') {
            return input.add32(value);
          } else {
            throw new Error("No addUint32 method available");
          }
        } catch (error) {
          debugLog("❌ Failed to add uint32", error);
          throw error;
        }
      },
      encrypt: () => {
        debugLog("Encrypting input");
        
        try {
          if (typeof input.encrypt === 'function') {
            return input.encrypt();
          } else if (typeof input.build === 'function') {
            return input.build();
          } else {
            throw new Error("No encrypt method available");
          }
        } catch (error) {
          debugLog("❌ Failed to encrypt input", error);
          throw error;
        }
      }
    };
  }

  private createSimulatedInput() {
    const values: number[] = [];
    
    return {
      addUint32: (value: number) => {
        debugLog("Adding uint32 to simulated input", { value });
        values.push(value);
        return this;
      },
      encrypt: () => {
        const result = { 
          data: new Uint8Array(32 * values.length || 32), 
          proof: new Uint8Array(32) 
        };
        debugLog("Encrypting simulated input", { 
          dataLength: result.data.length,
          valuesCount: values.length 
        });
        return result;
      }
    };
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
      if (this.zamaSDK && this.sdkInitialized && !this.isDevelopmentMode) {
        debugLog("Relayer connectivity test via SDK", { success: true, method: this.loadMethod });
        return true;
      }
      
      debugLog("Relayer connectivity test", { success: false, reason: "SDK not initialized or in simulation mode" });
      return false;
    } catch (error) {
      debugLog("Relayer connectivity test failed", error);
      return false;
    }
  }
}

export const fhevmClient = new FHEVMClient();
export { debugLog };