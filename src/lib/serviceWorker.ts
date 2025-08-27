// Service Worker registration and management utilities
import React from 'react';
import { debugError, debugInfo, debugNetwork } from '@/lib/debug-utils';

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
      debugInfo(
        'Service Worker not supported in this browser',
        'ServiceWorkerManager',
        { 
          userAgent: 'unknown',
          hasServiceWorker: false
        },
        'network'
      );
      return null;
    }

    try {
      debugInfo(
        'Attempting Service Worker registration',
        'ServiceWorkerManager',
        { swPath: '/sw.js', scope: '/' },
        'network'
      );

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      this.registration = registration;

      // Handle updates
      registration.addEventListener('updatefound', () => {
        debugInfo(
          'Service Worker update found',
          'ServiceWorkerManager',
          { registrationScope: registration.scope },
          'network'
        );

        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            debugInfo(
              `Service Worker state changed: ${newWorker.state}`,
              'ServiceWorkerManager',
              { state: newWorker.state, scriptURL: newWorker.scriptURL },
              'network'
            );

            if (newWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New content is available
                debugInfo(
                  'New Service Worker content is available',
                  'ServiceWorkerManager',
                  {},
                  'network'
                );
                this.config.onUpdate?.(registration);
              } else {
                // Content is cached for offline use
                debugInfo(
                  'Service Worker content is cached for offline use',
                  'ServiceWorkerManager',
                  {},
                  'network'
                );
                this.config.onSuccess?.(registration);
              }
            }
          });
        }
      });

      debugInfo(
        'Service Worker registered successfully',
        'ServiceWorkerManager',
        { 
          scope: registration.scope,
          updateViaCache: registration.updateViaCache,
        },
        'network'
      );

      return registration;
    } catch (error) {
      debugError(
        `Service Worker registration failed: ${error instanceof Error ? error.message : String(error)}`,
        'ServiceWorkerManager',
        {
          error: error instanceof Error ? error.stack : String(error),
          swPath: '/sw.js',
        },
        error instanceof Error ? error : undefined,
        'network'
      );
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
    const handleOnline = () => {
      setIsOffline(false);
      debugNetwork(
        'Network connection restored',
        { 
          wasOffline: true, 
          timestamp: new Date().toISOString(),
          connectionType: 'unknown',
        }
      );
    };
    
    const handleOffline = () => {
      setIsOffline(true);
      debugNetwork(
        'Network connection lost',
        { 
          wasOnline: true, 
          timestamp: new Date().toISOString(),
        },
        true
      );
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial network status check
    debugNetwork(
      'Initial network status',
      { 
        isOnline: navigator.onLine,
        timestamp: new Date().toISOString(),
      }
    );

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

      const newStatus = {
        isOnline: navigator.onLine,
        isSlowConnection: connection ? connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g' : false,
        connectionType: connection ? connection.effectiveType : 'unknown',
      };

      // Log network status changes to debug monitor
      if (newStatus.isOnline !== networkStatus.isOnline || 
          newStatus.connectionType !== networkStatus.connectionType ||
          newStatus.isSlowConnection !== networkStatus.isSlowConnection) {
        
        debugNetwork(
          'Network status updated',
          {
            ...newStatus,
            previousStatus: networkStatus,
            downlink: connection?.downlink,
            rtt: connection?.rtt,
            saveData: connection?.saveData,
            timestamp: new Date().toISOString(),
          },
          newStatus.isSlowConnection || !newStatus.isOnline
        );
      }

      setNetworkStatus(newStatus);
    };

    const handleOnline = () => updateNetworkStatus();
    const handleOffline = () => updateNetworkStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for connection changes
    const connection = (navigator as NavigatorExtended).connection;
    if (connection) {
      (connection as unknown as EventTarget).addEventListener('change', updateNetworkStatus);
    }

    // Initial check
    updateNetworkStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        (connection as unknown as EventTarget).removeEventListener('change', updateNetworkStatus);
      }
    };
  }, [networkStatus]);

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

