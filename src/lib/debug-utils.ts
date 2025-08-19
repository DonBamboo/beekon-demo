/**
 * Debug Mode Utility
 * 
 * Centralized debug mode detection based on VITE_DEBUG_MODE environment variable.
 * Defaults to false when not set - debug UI components are hidden by default.
 */
import React from 'react';

export interface DebugEvent {
  id: string;
  timestamp: number;
  type: 'error' | 'warning' | 'info' | 'real-time' | 'app-state' | 'ui-event' | 'manual' | 'service' | 'auth' | 'network' | 'performance';
  category: 'component' | 'service' | 'auth' | 'database' | 'real-time' | 'network' | 'performance' | 'ui' | 'validation' | 'general';
  source: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
  componentStack?: string;
  websiteId?: string;
  workspaceId?: string;
  userId?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

// Global debug event store
let globalDebugEvents: DebugEvent[] = [];
let debugEventListeners: Array<(event: DebugEvent) => void> = [];

/**
 * Check if debug mode is enabled
 * @returns true if VITE_DEBUG_MODE is explicitly set to 'true', false otherwise
 */
export const isDebugMode = (): boolean => {
  return import.meta.env.VITE_DEBUG_MODE === 'true';
};

/**
 * Conditional debug component wrapper
 * @param component - Component to render when debug mode is enabled
 * @returns Component or null based on debug mode
 */
export const debugOnly = (component: React.ReactNode): React.ReactNode | null => {
  return isDebugMode() ? component : null;
};

/**
 * Debug mode status for logging
 */
export const getDebugModeStatus = (): string => {
  const mode = import.meta.env.VITE_DEBUG_MODE;
  return `Debug Mode: ${isDebugMode() ? 'ON' : 'OFF'} (VITE_DEBUG_MODE=${mode || 'undefined'})`;
};

/**
 * Add a debug event to the global store and notify listeners
 */
export const addDebugEvent = (event: Omit<DebugEvent, 'id' | 'timestamp'>): void => {
  if (!isDebugMode()) return;

  const fullEvent: DebugEvent = {
    ...event,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
  };

  globalDebugEvents.push(fullEvent);
  
  // Keep only last 1000 events to prevent memory leaks
  if (globalDebugEvents.length > 1000) {
    globalDebugEvents = globalDebugEvents.slice(-1000);
  }

  // Notify all listeners
  debugEventListeners.forEach(listener => {
    try {
      listener(fullEvent);
    } catch (error) {
      console.error('Error in debug event listener:', error);
    }
  });
};

/**
 * Subscribe to debug events
 */
export const subscribeToDebugEvents = (listener: (event: DebugEvent) => void): (() => void) => {
  debugEventListeners.push(listener);
  
  return () => {
    const index = debugEventListeners.indexOf(listener);
    if (index > -1) {
      debugEventListeners.splice(index, 1);
    }
  };
};

/**
 * Get all debug events
 */
export const getDebugEvents = (): DebugEvent[] => {
  return [...globalDebugEvents];
};

/**
 * Clear all debug events
 */
export const clearDebugEvents = (): void => {
  globalDebugEvents = [];
};

/**
 * Log error to debug monitor
 */
export const debugError = (
  message: string,
  source: string,
  details?: Record<string, unknown>,
  error?: Error,
  category: DebugEvent['category'] = 'general'
): void => {
  addDebugEvent({
    type: 'error',
    category,
    source,
    message,
    details,
    stack: error?.stack,
    severity: 'high',
  });
};

/**
 * Log warning to debug monitor
 */
export const debugWarning = (
  message: string,
  source: string,
  details?: Record<string, unknown>,
  category: DebugEvent['category'] = 'general'
): void => {
  addDebugEvent({
    type: 'warning',
    category,
    source,
    message,
    details,
    severity: 'medium',
  });
};

/**
 * Log info to debug monitor
 */
export const debugInfo = (
  message: string,
  source: string,
  details?: Record<string, unknown>,
  category: DebugEvent['category'] = 'general'
): void => {
  addDebugEvent({
    type: 'info',
    category,
    source,
    message,
    details,
    severity: 'low',
  });
};

/**
 * Log service operations to debug monitor
 */
export const debugService = (
  operation: string,
  service: string,
  details?: Record<string, unknown>,
  isError = false
): void => {
  addDebugEvent({
    type: isError ? 'error' : 'info',
    category: 'service',
    source: service,
    message: operation,
    details,
    severity: isError ? 'high' : 'low',
  });
};

/**
 * Log authentication events to debug monitor
 */
export const debugAuth = (
  event: string,
  details?: Record<string, unknown>,
  isError = false
): void => {
  addDebugEvent({
    type: isError ? 'error' : 'info',
    category: 'auth',
    source: 'auth-system',
    message: event,
    details,
    severity: isError ? 'high' : 'low',
  });
};

/**
 * Log network events to debug monitor
 */
export const debugNetwork = (
  event: string,
  details?: Record<string, unknown>,
  isError = false
): void => {
  addDebugEvent({
    type: isError ? 'error' : 'info',
    category: 'network',
    source: 'network-layer',
    message: event,
    details,
    severity: isError ? 'medium' : 'low',
  });
};

/**
 * Log performance events to debug monitor
 */
export const debugPerformance = (
  event: string,
  details?: Record<string, unknown>,
  isSlowPerformance = false
): void => {
  addDebugEvent({
    type: isSlowPerformance ? 'warning' : 'info',
    category: 'performance',
    source: 'performance-monitor',
    message: event,
    details,
    severity: isSlowPerformance ? 'medium' : 'low',
  });
};

/**
 * Log component lifecycle events to debug monitor
 */
export const debugComponent = (
  component: string,
  event: string,
  details?: Record<string, unknown>,
  isError = false
): void => {
  addDebugEvent({
    type: isError ? 'error' : 'info',
    category: 'component',
    source: component,
    message: event,
    details,
    severity: isError ? 'high' : 'low',
  });
};

/**
 * Detect and log browser compatibility issues
 */
export const detectBrowserCompatibility = (): void => {
  if (typeof window === 'undefined') return;

  const compatibility = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    cookieEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    features: {
      serviceWorker: 'serviceWorker' in navigator,
      webGL: (() => {
        try {
          const canvas = document.createElement('canvas');
          return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch (e) {
          return false;
        }
      })(),
      indexedDB: 'indexedDB' in window,
      localStorage: (() => {
        try {
          return 'localStorage' in window && window.localStorage !== null;
        } catch (e) {
          return false;
        }
      })(),
      sessionStorage: (() => {
        try {
          return 'sessionStorage' in window && window.sessionStorage !== null;
        } catch (e) {
          return false;
        }
      })(),
      webSockets: 'WebSocket' in window,
      webRTC: 'RTCPeerConnection' in window,
      geolocation: 'geolocation' in navigator,
      notifications: 'Notification' in window,
      performance: 'performance' in window,
      intersectionObserver: 'IntersectionObserver' in window,
      resizeObserver: 'ResizeObserver' in window,
      mutationObserver: 'MutationObserver' in window,
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    },
    screen: {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth,
      orientation: screen.orientation?.type || 'unknown',
    },
  };

  // Check for missing critical features
  const criticalFeatures = ['serviceWorker', 'indexedDB', 'localStorage'];
  const missingCritical = criticalFeatures.filter(feature => !compatibility.features[feature as keyof typeof compatibility.features]);
  
  if (missingCritical.length > 0) {
    debugError(
      `Missing critical browser features: ${missingCritical.join(', ')}`,
      'BrowserCompatibility',
      {
        missingFeatures: missingCritical,
        compatibility,
        recommendation: 'Consider showing browser upgrade prompt',
      },
      undefined,
      'general'
    );
  }

  // Check for older browsers
  const isOldBrowser = (() => {
    const ua = navigator.userAgent;
    if (ua.includes('MSIE') || ua.includes('Trident/')) return true; // IE
    if (ua.includes('Chrome/')) {
      const chromeVersion = parseInt(ua.match(/Chrome\/(\d+)/)?.[1] || '0');
      return chromeVersion < 80; // Chrome < 80 (released Feb 2020)
    }
    if (ua.includes('Firefox/')) {
      const firefoxVersion = parseInt(ua.match(/Firefox\/(\d+)/)?.[1] || '0');
      return firefoxVersion < 75; // Firefox < 75 (released Apr 2020)
    }
    if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      const safariVersion = parseInt(ua.match(/Version\/(\d+)/)?.[1] || '0');
      return safariVersion < 13; // Safari < 13
    }
    return false;
  })();

  if (isOldBrowser) {
    debugWarning(
      'Potentially outdated browser detected',
      'BrowserCompatibility',
      {
        userAgent: navigator.userAgent,
        recommendation: 'Consider showing browser upgrade notice',
      },
      'general'
    );
  }

  // Log successful compatibility check
  debugInfo(
    'Browser compatibility check completed',
    'BrowserCompatibility',
    {
      supportedFeatures: Object.entries(compatibility.features).filter(([, supported]) => supported).map(([feature]) => feature),
      missingFeatures: Object.entries(compatibility.features).filter(([, supported]) => !supported).map(([feature]) => feature),
      viewport: compatibility.viewport,
      isOldBrowser,
    },
    'general'
  );
};

/**
 * Copy text to clipboard with error handling
 * @param text - Text to copy to clipboard
 * @returns Promise<boolean> - Success status
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    // Modern clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    return success;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
};

/**
 * Format debug data for copying with metadata
 * @param data - Data to format
 * @param context - Additional context information
 * @returns Formatted JSON string
 */
export const formatDebugData = (
  data: unknown, 
  context?: { 
    eventType?: string;
    workspace?: string;
    websiteCount?: number;
    connectionStatus?: boolean;
  }
): string => {
  const timestamp = new Date().toISOString();
  
  const formatted = {
    timestamp,
    debugSession: {
      workspace: context?.workspace || 'Unknown',
      websiteCount: context?.websiteCount || 0,
      connectionStatus: context?.connectionStatus ? 'connected' : 'disconnected',
    },
    ...(context?.eventType && { eventType: context.eventType }),
    data,
  };
  
  return JSON.stringify(formatted, null, 2);
};