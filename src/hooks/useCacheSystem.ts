import { useCallback, useEffect, useRef } from 'react';
import { useAppState } from '@/hooks/appStateHooks';
import { persistentStorage } from '@/lib/storage';

// Cache levels and their configurations
export interface CacheLevel {
  name: string;
  storage: 'memory' | 'session' | 'local';
  maxAge: number; // in milliseconds
  maxSize?: number; // maximum number of entries
  priority: number; // higher number = higher priority
}

export const CACHE_LEVELS: Record<string, CacheLevel> = {
  L1_MEMORY: {
    name: 'L1 Memory Cache',
    storage: 'memory',
    maxAge: 5 * 60 * 1000, // 5 minutes
    maxSize: 100,
    priority: 1,
  },
  L2_SESSION: {
    name: 'L2 Session Cache',
    storage: 'session',
    maxAge: 30 * 60 * 1000, // 30 minutes  
    maxSize: 500,
    priority: 2,
  },
  L3_LOCAL: {
    name: 'L3 Local Cache',
    storage: 'local',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    maxSize: 200,
    priority: 3,
  },
} as const;

// Cache invalidation strategies
export type InvalidationStrategy = 
  | 'time' // Expire after maxAge
  | 'dependency' // Invalidate based on dependency changes
  | 'manual' // Only invalidate when explicitly called
  | 'hybrid'; // Combine time and dependency

export interface CacheConfig {
  level: keyof typeof CACHE_LEVELS;
  strategy: InvalidationStrategy;
  dependencies?: string[];
  tags?: string[]; // For bulk invalidation
  serialize?: (data: unknown) => string;
  deserialize?: (data: string) => unknown;
}

// Cache statistics for monitoring
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  totalRequests: number;
  averageResponseTime: number;
}

// Enhanced cache hook with multi-level support
export function useCacheSystem() {
  const { getFromCache, setCache, clearCache } = useAppState();
  const statsRef = useRef<Map<string, CacheStats>>(new Map());
  
  // Update cache statistics
  const updateCacheStats = useCallback((key: string, hit: boolean, responseTime: number): void => {
    const currentStats = statsRef.current.get(key) || {
      hits: 0,
      misses: 0,
      hitRate: 0,
      size: 0,
      totalRequests: 0,
      averageResponseTime: 0,
    };

    const newStats: CacheStats = {
      hits: hit ? currentStats.hits + 1 : currentStats.hits,
      misses: hit ? currentStats.misses : currentStats.misses + 1,
      hitRate: ((hit ? currentStats.hits + 1 : currentStats.hits) / (currentStats.totalRequests + 1)) * 100,
      size: currentStats.size,
      totalRequests: currentStats.totalRequests + 1,
      averageResponseTime: ((currentStats.averageResponseTime * currentStats.totalRequests) + responseTime) / (currentStats.totalRequests + 1),
    };

    statsRef.current.set(key, newStats);
  }, []);

  // Invalidate cache entries by tags
  const invalidateByTags = useCallback((tags: string[]): void => {
    // This would need to be implemented in the AppStateContext
    // to track cache entries by tags and invalidate them
    tags.forEach(tag => {
      clearCache(`tag:${tag}`);
    });
  }, [clearCache]);
  
  // Get from multi-level cache with fallback
  const getMultiLevel = useCallback(async <T,>(
    key: string,
    config: CacheConfig
  ): Promise<T | null> => {
    const startTime = performance.now();
    let result: T | null = null;

    // L1: Memory cache (fastest)
    result = getFromCache<T>(key);
    if (result !== null) {
      return result;
    }

    // L2: Session storage (medium speed)
    if (result === null && (config.level === 'L2_SESSION' || config.level === 'L3_LOCAL')) {
      const sessionData = persistentStorage.getCachedData(`session_${key}`);
      if (sessionData) {
        result = config.deserialize ? (config.deserialize(String(sessionData)) as T) : (sessionData as T);
        
        // Promote to L1 for faster future access
        if (result !== null) {
          const l1Cache = CACHE_LEVELS['L1_MEMORY'];
          if (l1Cache) {
            setCache(key, result, l1Cache.maxAge, {
              level: 'L1_MEMORY',
              promotedFrom: 'L2_SESSION',
            });
          }
          return result;
        }
      }
    }

    // L3: Local storage (slowest but persistent)
    if (result === null && config.level === 'L3_LOCAL') {
      const localData = persistentStorage.getCachedData(`local_${key}`);
      if (localData) {
        result = config.deserialize ? (config.deserialize(String(localData)) as T) : (localData as T);
        
        // Promote to higher levels for faster future access
        if (result !== null) {
          const l1Cache = CACHE_LEVELS['L1_MEMORY'];
          const l2Cache = CACHE_LEVELS['L2_SESSION'];
          if (l1Cache) {
            setCache(key, result, l1Cache.maxAge);
          }
          if (l2Cache) {
            persistentStorage.cacheData(`session_${key}`, 
              config.serialize ? config.serialize(result) : String(result),
              l2Cache.maxAge
            );
          }
        }
      }
    }

    // Update statistics
    const responseTime = performance.now() - startTime;
    updateCacheStats(key, result !== null, responseTime);

    return result;
  }, [getFromCache, setCache, updateCacheStats]);

  // Set data in multi-level cache with automatic level selection
  const setMultiLevel = useCallback(<T,>(
    key: string,
    data: T,
    config: CacheConfig
  ): void => {
    const level = CACHE_LEVELS[config.level];
    
    // Always set in L1 for immediate access
    const l1Cache = CACHE_LEVELS['L1_MEMORY'];
    setCache(key, data, l1Cache?.maxAge || 300000, {
      level: 'L1_MEMORY',
      dependencies: config.dependencies,
      tags: config.tags,
      strategy: config.strategy,
    });

    // Set in appropriate levels based on config
    if (config.level === 'L2_SESSION' || config.level === 'L3_LOCAL') {
      if (level) {
        persistentStorage.cacheData(`session_${key}`,
          config.serialize ? config.serialize(data) : String(data),
          level.maxAge
        );
      }
    }

    if (config.level === 'L3_LOCAL') {
      if (level) {
        persistentStorage.cacheData(`local_${key}`,
          config.serialize ? config.serialize(data) : String(data),
          level.maxAge
        );
      }
    }
  }, [setCache]);

  // Intelligent cache invalidation
  const invalidateIntelligent = useCallback((
    pattern: string | string[],
    strategy: 'cascade' | 'selective' | 'tag-based' = 'cascade'
  ): void => {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    
    patterns.forEach(pat => {
      if (strategy === 'cascade') {
        // Invalidate across all cache levels
        clearCache(pat);
        persistentStorage.clearLocal(pat);
        persistentStorage.clearSession(pat);
      } else if (strategy === 'selective') {
        // Only invalidate memory cache, keep persistent caches
        clearCache(pat);
      } else if (strategy === 'tag-based') {
        // Invalidate based on cache tags
        invalidateByTags([pat]);
      }
    });
  }, [clearCache, invalidateByTags]);


  // Get cache statistics for monitoring
  const getCacheStats = useCallback((key?: string): CacheStats | Map<string, CacheStats> => {
    if (key) {
      return statsRef.current.get(key) || {
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0,
        totalRequests: 0,
        averageResponseTime: 0,
      };
    }
    return new Map(statsRef.current);
  }, []);

  // Cache warm-up for predictive loading
  const warmUpCache = useCallback(async (
    entries: Array<{ key: string; loader: () => Promise<unknown>; config: CacheConfig }>
  ): Promise<void> => {
    const warmupPromises = entries.map(async ({ key, loader, config }) => {
      try {
        // Check if data already exists
        const existing = await getMultiLevel(key, config);
        if (existing === null) {
          // Load and cache data
          const data = await loader();
          setMultiLevel(key, data, config);
        }
      } catch (error) {
        // Cache warm-up failed for key - handled silently
      }
    });

    await Promise.allSettled(warmupPromises);
  }, [getMultiLevel, setMultiLevel]);

  // Automatic cache cleanup based on usage patterns
  const cleanupCache = useCallback((): void => {
    const stats = getCacheStats() as Map<string, CacheStats>;
    
    // Identify low-usage cache entries for cleanup
    const lowUsageKeys: string[] = [];
    stats.forEach((stat, key) => {
      // Remove entries with very low hit rates and old access times
      if (stat.hitRate < 10 && stat.totalRequests > 5) {
        lowUsageKeys.push(key);
      }
    });

    // Clean up low-usage entries
    lowUsageKeys.forEach(key => {
      clearCache(key);
      // Remove from session storage (assuming it exists)
      sessionStorage.removeItem(`session_${key}`);
      statsRef.current.delete(key);
    });

    // Cache cleanup completed - removed low-usage entries
  }, [getCacheStats, clearCache]);

  // Periodic cleanup
  useEffect(() => {
    const cleanupInterval = setInterval(cleanupCache, 10 * 60 * 1000); // Every 10 minutes
    return () => clearInterval(cleanupInterval);
  }, [cleanupCache]);

  return {
    // Core cache operations
    get: getMultiLevel,
    set: setMultiLevel,
    invalidate: invalidateIntelligent,
    invalidateByTags,

    // Cache management
    warmUp: warmUpCache,
    cleanup: cleanupCache,
    
    // Statistics and monitoring
    getStats: getCacheStats,
    
    // Predefined configurations for common use cases
    configs: {
      // Fast, temporary data (UI state, form data)
      FAST: { level: 'L1_MEMORY' as const, strategy: 'time' as const },
      
      // Medium persistence (user preferences, filter states) 
      MEDIUM: { level: 'L2_SESSION' as const, strategy: 'hybrid' as const },
      
      // Long persistence (user settings, cached API responses)
      PERSISTENT: { level: 'L3_LOCAL' as const, strategy: 'dependency' as const },
      
      // Website-specific data with dependency tracking
      WEBSITE_SCOPED: { 
        level: 'L2_SESSION' as const, 
        strategy: 'dependency' as const,
        dependencies: ['website_change'],
        tags: ['website_data'],
      },
      
      // Global shared data (topics, LLM providers)
      SHARED_DATA: {
        level: 'L3_LOCAL' as const,
        strategy: 'hybrid' as const, 
        tags: ['shared_data'],
      },
    },
  };
}