import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Wait a bit for the Zama SDK to load from CDN
const initApp = () => {
  const root = createRoot(document.getElementById('root')!);
  
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
};

// Check if Zama SDK is already loaded
if (window.ZamaSDK || window.initSDK) {
  console.log('[App] Zama SDK detected, initializing app immediately');
  initApp();
} else {
  console.log('[App] Waiting for Zama SDK to load...');
  // Wait a bit for the SDK to load
  setTimeout(() => {
    if (window.ZamaSDK || window.initSDK) {
      console.log('[App] Zama SDK loaded, initializing app');
    } else {
      console.log('[App] Zama SDK not detected, proceeding with simulation mode');
    }
    initApp();
  }, 1000);
}