// Request deduplication utility to prevent duplicate API calls
class RequestDeduplicator {
  private pendingRequests = new Map<string, Promise<unknown>>();
  private cache = new Map<string, { data: unknown; timestamp: number; ttl: number }>();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes

  // Generate a unique key for the request
  private generateKey(url: string, options?: RequestInit): string {
    const method = options?.method || 'GET';
    const body = options?.body ? JSON.stringify(options.body) : '';
    const headers = options?.headers ? JSON.stringify(options.headers) : '';
    return `${method}:${url}:${body}:${headers}`;
  }

  // Check if cached data is still valid
  private isValidCacheEntry(entry: { timestamp: number; ttl: number }): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  // Deduplicated request wrapper
  async request<T = unknown>(
    url: string, 
    options?: RequestInit,
    { ttl = this.defaultTTL, skipCache = false } = {}
  ): Promise<T> {
    const key = this.generateKey(url, options);

    // Check cache first (unless skipping cache)
    if (!skipCache) {
      const cached = this.cache.get(key);
      if (cached && this.isValidCacheEntry(cached)) {
        return cached.data;
      }
    }

    // Check if request is already in flight
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending;
    }

    // Make the request
    const requestPromise = this.makeRequest<T>(url, options);
    this.pendingRequests.set(key, requestPromise);

    try {
      const result = await requestPromise;
      
      // Cache the result
      this.cache.set(key, {
        data: result,
        timestamp: Date.now(),
        ttl,
      });

      return result;
    } finally {
      // Remove from pending requests
      this.pendingRequests.delete(key);
    }
  }

  private async makeRequest<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Clear cache for specific pattern or all
  clearCache(pattern?: string): void {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  // Cancel pending requests for specific pattern or all
  cancelPendingRequests(pattern?: string): void {
    if (pattern) {
      for (const key of this.pendingRequests.keys()) {
        if (key.includes(pattern)) {
          this.pendingRequests.delete(key);
        }
      }
    } else {
      this.pendingRequests.clear();
    }
  }

  // Get cache statistics
  getCacheStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const entry of this.cache.values()) {
      if (this.isValidCacheEntry(entry)) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      pendingRequests: this.pendingRequests.size,
    };
  }

  // Clean expired entries
  cleanExpired(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValidCacheEntry(entry)) {
        this.cache.delete(key);
      }
    }
  }
}

// Global instance for the entire application
export const requestDeduplicator = new RequestDeduplicator();

// Hook for React components
export function useRequestDeduplication() {
  return {
    request: requestDeduplicator.request.bind(requestDeduplicator),
    clearCache: requestDeduplicator.clearCache.bind(requestDeduplicator),
    cancelPendingRequests: requestDeduplicator.cancelPendingRequests.bind(requestDeduplicator),
    getCacheStats: requestDeduplicator.getCacheStats.bind(requestDeduplicator),
    cleanExpired: requestDeduplicator.cleanExpired.bind(requestDeduplicator),
  };
}

// Service-specific request wrappers with appropriate TTLs
export const dedicatedRequestMethods = {
  // Dashboard data - moderate TTL
  dashboardRequest: <T = unknown>(url: string, options?: RequestInit) => 
    requestDeduplicator.request<T>(url, options, { ttl: 5 * 60 * 1000 }), // 5 minutes

  // Analysis results - shorter TTL due to frequent updates
  analysisRequest: <T = unknown>(url: string, options?: RequestInit) => 
    requestDeduplicator.request<T>(url, options, { ttl: 2 * 60 * 1000 }), // 2 minutes

  // Competitor data - longer TTL
  competitorRequest: <T = unknown>(url: string, options?: RequestInit) => 
    requestDeduplicator.request<T>(url, options, { ttl: 10 * 60 * 1000 }), // 10 minutes

  // Website list - longest TTL
  websiteRequest: <T = unknown>(url: string, options?: RequestInit) => 
    requestDeduplicator.request<T>(url, options, { ttl: 15 * 60 * 1000 }), // 15 minutes

  // Real-time data - no cache
  realtimeRequest: <T = unknown>(url: string, options?: RequestInit) => 
    requestDeduplicator.request<T>(url, options, { ttl: 0, skipCache: true }),
};