/**
 * Persistent storage utilities for cross-session data persistence
 * Handles localStorage, sessionStorage with graceful fallbacks
 */

export interface StorageConfig {
  version: number;
  expiration?: number; // Optional expiration time in milliseconds
}

export interface StoredData<T = any> {
  data: T;
  timestamp: number;
  version: number;
  expiration?: number;
}

class StorageManager {
  private isStorageAvailable(storage: Storage): boolean {
    try {
      const test = '__storage_test__';
      storage.setItem(test, 'test');
      storage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  private get localStorage(): Storage | null {
    return typeof window !== 'undefined' && this.isStorageAvailable(window.localStorage) 
      ? window.localStorage 
      : null;
  }

  private get sessionStorage(): Storage | null {
    return typeof window !== 'undefined' && this.isStorageAvailable(window.sessionStorage)
      ? window.sessionStorage
      : null;
  }

  /**
   * Store data in localStorage with versioning and expiration
   */
  setLocal<T>(key: string, data: T, config: StorageConfig = { version: 1 }): boolean {
    if (!this.localStorage) return false;

    try {
      const storedData: StoredData<T> = {
        data,
        timestamp: Date.now(),
        version: config.version,
        expiration: config.expiration ? Date.now() + config.expiration : undefined,
      };

      this.localStorage.setItem(key, JSON.stringify(storedData));
      return true;
    } catch (error) {
      console.warn('Failed to store data in localStorage:', error);
      return false;
    }
  }

  /**
   * Retrieve data from localStorage with validation
   */
  getLocal<T>(key: string, expectedVersion: number = 1): T | null {
    if (!this.localStorage) return null;

    try {
      const item = this.localStorage.getItem(key);
      if (!item) return null;

      const storedData: StoredData<T> = JSON.parse(item);

      // Version check
      if (storedData.version !== expectedVersion) {
        this.localStorage.removeItem(key);
        return null;
      }

      // Expiration check
      if (storedData.expiration && Date.now() > storedData.expiration) {
        this.localStorage.removeItem(key);
        return null;
      }

      return storedData.data;
    } catch (error) {
      console.warn('Failed to retrieve data from localStorage:', error);
      return null;
    }
  }

  /**
   * Store data in sessionStorage
   */
  setSession<T>(key: string, data: T, config: StorageConfig = { version: 1 }): boolean {
    if (!this.sessionStorage) return false;

    try {
      const storedData: StoredData<T> = {
        data,
        timestamp: Date.now(),
        version: config.version,
        expiration: config.expiration ? Date.now() + config.expiration : undefined,
      };

      this.sessionStorage.setItem(key, JSON.stringify(storedData));
      return true;
    } catch (error) {
      console.warn('Failed to store data in sessionStorage:', error);
      return false;
    }
  }

  /**
   * Retrieve data from sessionStorage with validation
   */
  getSession<T>(key: string, expectedVersion: number = 1): T | null {
    if (!this.sessionStorage) return null;

    try {
      const item = this.sessionStorage.getItem(key);
      if (!item) return null;

      const storedData: StoredData<T> = JSON.parse(item);

      // Version check
      if (storedData.version !== expectedVersion) {
        this.sessionStorage.removeItem(key);
        return null;
      }

      // Expiration check
      if (storedData.expiration && Date.now() > storedData.expiration) {
        this.sessionStorage.removeItem(key);
        return null;
      }

      return storedData.data;
    } catch (error) {
      console.warn('Failed to retrieve data from sessionStorage:', error);
      return null;
    }
  }

  /**
   * Remove data from localStorage
   */
  removeLocal(key: string): boolean {
    if (!this.localStorage) return false;

    try {
      this.localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn('Failed to remove data from localStorage:', error);
      return false;
    }
  }

  /**
   * Remove data from sessionStorage
   */
  removeSession(key: string): boolean {
    if (!this.sessionStorage) return false;

    try {
      this.sessionStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn('Failed to remove data from sessionStorage:', error);
      return false;
    }
  }

  /**
   * Clear all storage data with optional prefix filter
   */
  clearLocal(prefix?: string): boolean {
    if (!this.localStorage) return false;

    try {
      if (prefix) {
        const keys = Object.keys(this.localStorage).filter(key => key.startsWith(prefix));
        keys.forEach(key => this.localStorage!.removeItem(key));
      } else {
        this.localStorage.clear();
      }
      return true;
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
      return false;
    }
  }

  /**
   * Clear all session storage data with optional prefix filter
   */
  clearSession(prefix?: string): boolean {
    if (!this.sessionStorage) return false;

    try {
      if (prefix) {
        const keys = Object.keys(this.sessionStorage).filter(key => key.startsWith(prefix));
        keys.forEach(key => this.sessionStorage!.removeItem(key));
      } else {
        this.sessionStorage.clear();
      }
      return true;
    } catch (error) {
      console.warn('Failed to clear sessionStorage:', error);
      return false;
    }
  }

  /**
   * Get storage usage statistics
   */
  getStorageStats(): { local: number; session: number; localAvailable: boolean; sessionAvailable: boolean } {
    let localSize = 0;
    let sessionSize = 0;

    if (this.localStorage) {
      try {
        localSize = new Blob(Object.values(this.localStorage)).size;
      } catch {
        localSize = 0;
      }
    }

    if (this.sessionStorage) {
      try {
        sessionSize = new Blob(Object.values(this.sessionStorage)).size;
      } catch {
        sessionSize = 0;
      }
    }

    return {
      local: localSize,
      session: sessionSize,
      localAvailable: !!this.localStorage,
      sessionAvailable: !!this.sessionStorage,
    };
  }
}

// Export singleton instance
export const storage = new StorageManager();

// Storage keys used throughout the application
export const STORAGE_KEYS = {
  // User preferences (localStorage - persistent across sessions)
  USER_PREFERENCES: 'beekon_user_preferences',
  SELECTED_WEBSITE: 'beekon_selected_website',
  FILTER_PRESETS: 'beekon_filter_presets',
  UI_SETTINGS: 'beekon_ui_settings',
  
  // Page-specific filters (localStorage - persistent across sessions)
  ANALYSIS_FILTERS: 'beekon_analysis_filters',
  COMPETITOR_FILTERS: 'beekon_competitor_filters', 
  DASHBOARD_FILTERS: 'beekon_dashboard_filters',
  
  // Session data (sessionStorage - cleared on tab close)
  NAVIGATION_STATE: 'beekon_navigation_state',
  FORM_DRAFTS: 'beekon_form_drafts',
  SCROLL_POSITIONS: 'beekon_scroll_positions',
  
  // Cache data (sessionStorage - cleared on tab close, but can be refreshed)
  TOPICS_CACHE: 'beekon_topics_cache',
  LLM_PROVIDERS_CACHE: 'beekon_llm_providers_cache',
  WEBSITE_METADATA_CACHE: 'beekon_website_metadata_cache',
} as const;

// Storage version for data migration
export const STORAGE_VERSION = 1;

// Helper functions for common storage operations
export const persistentStorage = {
  /**
   * Save user preferences with automatic versioning
   */
  saveUserPreferences: (preferences: any) => {
    return storage.setLocal(STORAGE_KEYS.USER_PREFERENCES, preferences, { 
      version: STORAGE_VERSION 
    });
  },

  /**
   * Load user preferences with version validation
   */
  loadUserPreferences: () => {
    return storage.getLocal(STORAGE_KEYS.USER_PREFERENCES, STORAGE_VERSION);
  },

  /**
   * Save page filters with expiration (7 days)
   */
  savePageFilters: (page: string, filters: any) => {
    const key = `beekon_${page}_filters`;
    return storage.setLocal(key, filters, { 
      version: STORAGE_VERSION,
      expiration: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  },

  /**
   * Load page filters with validation
   */
  loadPageFilters: (page: string) => {
    const key = `beekon_${page}_filters`;
    return storage.getLocal(key, STORAGE_VERSION);
  },

  /**
   * Save navigation state to session storage
   */
  saveNavigationState: (state: any) => {
    return storage.setSession(STORAGE_KEYS.NAVIGATION_STATE, state, {
      version: STORAGE_VERSION
    });
  },

  /**
   * Load navigation state from session storage
   */
  loadNavigationState: () => {
    return storage.getSession(STORAGE_KEYS.NAVIGATION_STATE, STORAGE_VERSION);
  },

  /**
   * Cache data with expiration
   */
  cacheData: (key: string, data: any, expirationMs: number = 30 * 60 * 1000) => {
    return storage.setSession(key, data, {
      version: STORAGE_VERSION,
      expiration: expirationMs,
    });
  },

  /**
   * Get cached data with expiration check
   */
  getCachedData: (key: string) => {
    return storage.getSession(key, STORAGE_VERSION);
  },

  /**
   * Clear all application data (for logout/reset)
   */
  clearAllData: () => {
    storage.clearLocal('beekon_');
    storage.clearSession('beekon_');
  },
};