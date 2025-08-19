/**
 * Debug Mode Utility
 * 
 * Centralized debug mode detection based on VITE_DEBUG_MODE environment variable.
 * Defaults to false when not set - debug UI components are hidden by default.
 */

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
 * Copy text to clipboard with error handling
 * @param text - Text to copy to clipboard
 * @param successMessage - Optional success message (defaults to "Copied to clipboard")
 * @returns Promise<boolean> - Success status
 */
export const copyToClipboard = async (text: string, successMessage?: string): Promise<boolean> => {
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