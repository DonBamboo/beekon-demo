/**
 * Request batching utility to reduce API calls and improve performance
 */

interface BatchedRequest<T> {
  key: string;
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

interface BatchConfig {
  maxBatchSize: number;
  maxWaitTime: number;
  keyGenerator: (...args: unknown[]) => string;
}

export class RequestBatcher<T> {
  private pending: Map<string, BatchedRequest<T>> = new Map();
  private batchTimeout: NodeJS.Timeout | null = null;
  private config: BatchConfig;

  constructor(
    private batchFunction: (keys: string[]) => Promise<Map<string, T>>,
    config: Partial<BatchConfig> = {}
  ) {
    this.config = {
      maxBatchSize: 10,
      maxWaitTime: 50, // 50ms
      keyGenerator: (...args: unknown[]) => JSON.stringify(args),
      ...config,
    };
  }

  async request(key: string): Promise<T> {
    // Check if request is already pending
    const existing = this.pending.get(key);
    if (existing) {
      return existing.promise;
    }

    // Create new batched request
    const request = this.createBatchedRequest(key);
    this.pending.set(key, request);

    // Schedule batch execution
    this.scheduleBatch();

    return request.promise;
  }

  private createBatchedRequest(key: string): BatchedRequest<T> {
    let resolve: (value: T) => void;
    let reject: (error: Error) => void;

    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    return {
      key,
      promise,
      resolve: resolve!,
      reject: reject!,
      timestamp: Date.now(),
    };
  }

  private scheduleBatch(): void {
    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // Execute immediately if batch size limit reached
    if (this.pending.size >= this.config.maxBatchSize) {
      this.executeBatch();
      return;
    }

    // Schedule execution after max wait time
    this.batchTimeout = setTimeout(() => {
      this.executeBatch();
    }, this.config.maxWaitTime);
  }

  private async executeBatch(): void {
    if (this.pending.size === 0) return;

    // Clear timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    // Get current batch
    const batch = Array.from(this.pending.values());
    const keys = batch.map(req => req.key);

    // Clear pending requests
    this.pending.clear();

    try {
      // Execute batch function
      const results = await this.batchFunction(keys);

      // Resolve individual requests
      batch.forEach(request => {
        const result = results.get(request.key);
        if (result !== undefined) {
          request.resolve(result);
        } else {
          request.reject(new Error(`No result for key: ${request.key}`));
        }
      });
    } catch (error) {
      // Reject all pending requests
      batch.forEach(request => {
        request.reject(error);
      });
    }
  }

  // Clear all pending requests
  clear(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    this.pending.clear();
  }
}

// Utility function for creating a simple key-value cache with TTL
export class CacheWithTTL<T> {
  private cache = new Map<string, { value: T; expiry: number }>();
  private defaultTTL: number;

  constructor(defaultTTL: number = 5 * 60 * 1000) { // 5 minutes default
    this.defaultTTL = defaultTTL;
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return item.value;
  }

  set(key: string, value: T, ttl: number = this.defaultTTL): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

// Data loader utility for batching database queries
export class DataLoader<K, V> {
  private batcher: RequestBatcher<V>;
  private cache: CacheWithTTL<V>;

  constructor(
    batchLoadFn: (keys: K[]) => Promise<Map<K, V>>,
    options: {
      maxBatchSize?: number;
      maxWaitTime?: number;
      cacheEnabled?: boolean;
      cacheTTL?: number;
    } = {}
  ) {
    const {
      maxBatchSize = 100,
      maxWaitTime = 16, // ~1 frame at 60fps
      cacheEnabled = true,
      cacheTTL = 5 * 60 * 1000, // 5 minutes
    } = options;

    this.cache = new CacheWithTTL<V>(cacheTTL);

    this.batcher = new RequestBatcher(
      async (keyStrings: string[]) => {
        const keys = keyStrings.map(k => JSON.parse(k) as K);
        const results = await batchLoadFn(keys);
        const stringResults = new Map<string, V>();
        
        results.forEach((value, key) => {
          const keyString = JSON.stringify(key);
          stringResults.set(keyString, value);
          
          // Cache the result
          if (cacheEnabled) {
            this.cache.set(keyString, value);
          }
        });
        
        return stringResults;
      },
      {
        maxBatchSize,
        maxWaitTime,
        keyGenerator: (key: K) => JSON.stringify(key),
      }
    );
  }

  async load(key: K): Promise<V> {
    const keyString = JSON.stringify(key);
    
    // Check cache first
    const cached = this.cache.get(keyString);
    if (cached !== undefined) {
      return cached;
    }

    // Use batcher for uncached requests
    return this.batcher.request(keyString);
  }

  async loadMany(keys: K[]): Promise<V[]> {
    const promises = keys.map(key => this.load(key));
    return Promise.all(promises);
  }

  // Clear cache and pending requests
  clear(): void {
    this.cache.clear();
    this.batcher.clear();
  }

  // Prime the cache with a known value
  prime(key: K, value: V): void {
    const keyString = JSON.stringify(key);
    this.cache.set(keyString, value);
  }
}