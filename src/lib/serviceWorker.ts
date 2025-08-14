// Service Worker registration and management utilities
import React from 'react';

// Extended Navigator interface for browser features
interface NavigatorExtended extends Navigator {
  standalone?: boolean;
  connection?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
    saveData: boolean;
  };
  mozConnection?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
    saveData: boolean;
  };
  webkitConnection?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
    saveData: boolean;
  };
}

// BeforeInstallPrompt event interface
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface ServiceWorkerConfig {
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onError?: (error: Error) => void;
}

export class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private config: ServiceWorkerConfig;

  constructor(config: ServiceWorkerConfig = {}) {
    this.config = config;
  }

  // Register service worker
  async register(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
      // Service Worker not supported
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      this.registration = registration;

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New content is available
                this.config.onUpdate?.(registration);
              } else {
                // Content is cached for offline use
                this.config.onSuccess?.(registration);
              }
            }
          });
        }
      });

      // Service Worker registered successfully
      return registration;
    } catch (error) {
      // Service Worker registration failed
      this.config.onError?.(error as Error);
      return null;
    }
  }

  // Update service worker
  async update(): Promise<void> {
    if (this.registration) {
      try {
        await this.registration.update();
        // Service Worker updated successfully
      } catch (error) {
        // Service Worker update failed
      }
    }
  }

  // Unregister service worker
  async unregister(): Promise<boolean> {
    if (this.registration) {
      try {
        const result = await this.registration.unregister();
        // Service Worker unregistered successfully
        return result;
      } catch (error) {
        // Service Worker unregister failed
        return false;
      }
    }
    return false;
  }

  // Skip waiting and activate new service worker
  async skipWaiting(): Promise<void> {
    if (this.registration && this.registration.waiting) {
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  // Clear all caches
  async clearCaches(): Promise<void> {
    if (this.registration) {
      this.registration.active?.postMessage({ type: 'CLEAR_CACHE' });
    }
  }

  // Preload URLs
  async preloadUrls(urls: string[]): Promise<void> {
    if (this.registration) {
      this.registration.active?.postMessage({ 
        type: 'CACHE_URLS', 
        urls 
      });
    }
  }

  // Check if service worker is supported
  static isSupported(): boolean {
    return 'serviceWorker' in navigator;
  }

  // Check if app is running in standalone mode (PWA)
  static isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as NavigatorExtended).standalone === true;
  }

  // Get service worker registration
  getRegistration(): ServiceWorkerRegistration | null {
    return this.registration;
  }
}

// Hook for using service worker in React components
export function useServiceWorker(config: ServiceWorkerConfig = {}) {
  const [registration, setRegistration] = React.useState<ServiceWorkerRegistration | null>(null);
  const [isSupported, setIsSupported] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const managerRef = React.useRef<ServiceWorkerManager | null>(null);

  React.useEffect(() => {
    setIsSupported(ServiceWorkerManager.isSupported());
    
    if (ServiceWorkerManager.isSupported()) {
      managerRef.current = new ServiceWorkerManager({
        ...config,
        onSuccess: (reg) => {
          setRegistration(reg);
          config.onSuccess?.(reg);
        },
        onUpdate: (reg) => {
          setRegistration(reg);
          config.onUpdate?.(reg);
        },
        onError: (err) => {
          setError(err);
          config.onError?.(err);
        },
      });
    }
  }, [config]);

  const register = React.useCallback(async () => {
    if (!managerRef.current) return null;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const reg = await managerRef.current.register();
      setRegistration(reg);
      return reg;
    } catch (err) {
      setError(err as Error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const update = React.useCallback(async () => {
    if (managerRef.current) {
      await managerRef.current.update();
    }
  }, []);

  const unregister = React.useCallback(async () => {
    if (managerRef.current) {
      const result = await managerRef.current.unregister();
      if (result) {
        setRegistration(null);
      }
      return result;
    }
    return false;
  }, []);

  const skipWaiting = React.useCallback(async () => {
    if (managerRef.current) {
      await managerRef.current.skipWaiting();
    }
  }, []);

  const clearCaches = React.useCallback(async () => {
    if (managerRef.current) {
      await managerRef.current.clearCaches();
    }
  }, []);

  const preloadUrls = React.useCallback(async (urls: string[]) => {
    if (managerRef.current) {
      await managerRef.current.preloadUrls(urls);
    }
  }, []);

  return {
    registration,
    isSupported,
    isLoading,
    error,
    register,
    update,
    unregister,
    skipWaiting,
    clearCaches,
    preloadUrls,
    isStandalone: ServiceWorkerManager.isStandalone(),
  };
}

// Offline detection hook
export function useOfflineStatus() {
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOffline;
}

// Network status hook
export function useNetworkStatus() {
  const [networkStatus, setNetworkStatus] = React.useState({
    isOnline: navigator.onLine,
    isSlowConnection: false,
    connectionType: 'unknown',
  });

  React.useEffect(() => {
    const updateNetworkStatus = () => {
      const connection = (navigator as NavigatorExtended).connection || 
                       (navigator as NavigatorExtended).mozConnection || 
                       (navigator as NavigatorExtended).webkitConnection;

      setNetworkStatus({
        isOnline: navigator.onLine,
        isSlowConnection: connection ? connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g' : false,
        connectionType: connection ? connection.effectiveType : 'unknown',
      });
    };

    const handleOnline = () => updateNetworkStatus();
    const handleOffline = () => updateNetworkStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for connection changes
    const connection = (navigator as NavigatorExtended).connection;
    if (connection) {
      (connection as EventTarget).addEventListener('change', updateNetworkStatus);
    }

    // Initial check
    updateNetworkStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        (connection as EventTarget).removeEventListener('change', updateNetworkStatus);
      }
    };
  }, []);

  return networkStatus;
}

// PWA install prompt hook
export function usePWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = React.useState(false);

  React.useEffect(() => {
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setInstallPrompt(e);
      setCanInstall(true);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setCanInstall(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = React.useCallback(async () => {
    if (installPrompt) {
      const result = await installPrompt.prompt();
      setInstallPrompt(null);
      setCanInstall(false);
      return result;
    }
    return null;
  }, [installPrompt]);

  return {
    canInstall,
    install,
    isStandalone: ServiceWorkerManager.isStandalone(),
  };
}

// Default service worker registration
export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (process.env.NODE_ENV === 'production') {
    const manager = new ServiceWorkerManager();
    return await manager.register();
  }
  return null;
}

