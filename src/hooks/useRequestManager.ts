import { useCallback, useRef, useEffect } from 'react';
import { useAppState } from '@/contexts/AppStateContext';

// Request metadata for tracking and optimization
interface RequestMetadata {
  key: string;
  timestamp: number;
  component: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  retries: number;
  maxRetries: number;
  timeout: number;
  abortController: AbortController;
}

// Request statistics for monitoring
interface RequestStats {
  total: number;
  successful: number;
  failed: number;
  deduplicated: number;
  avgResponseTime: number;
  lastActivity: number;
}

// Request queue for batching and prioritization
interface RequestQueue {
  pending: Map<string, RequestMetadata>;
  batches: Map<string, string[]>; // batch key -> request keys
  priorities: Map<string, string[]>; // priority -> request keys
}

/**
 * Global request manager for deduplication, batching, and optimization
 * Prevents duplicate network requests across the entire application
 */
export function useRequestManager() {
  const { state, dispatch } = useAppState();
  const requestQueue = useRef<RequestQueue>({
    pending: new Map(),
    batches: new Map(),
    priorities: new Map(),
  });
  const statsRef = useRef<Map<string, RequestStats>>(new Map());
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Generate request key from parameters
  const generateRequestKey = useCallback((
    endpoint: string,
    params?: Record<string, any>,
    method: string = 'GET'
  ): string => {
    const paramString = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
    return `${method}:${endpoint}:${paramString}`;
  }, []);

  // Execute a request with deduplication
  const executeRequest = useCallback(async <T>(
    requestFn: () => Promise<T>,
    options: {
      key?: string;
      endpoint: string;
      params?: Record<string, any>;
      method?: string;
      component?: string;
      priority?: RequestMetadata['priority'];
      timeout?: number;
      maxRetries?: number;
      abortSignal?: AbortSignal;
    }
  ): Promise<T> => {
    const {
      endpoint,
      params,
      method = 'GET',
      component = 'unknown',
      priority = 'normal',
      timeout = 30000,
      maxRetries = 3,
      abortSignal,
    } = options;

    const requestKey = options.key || generateRequestKey(endpoint, params, method);
    const startTime = performance.now();

    // Check if request is already active (deduplication)
    if (state.requests.active.has(requestKey)) {
      console.log(`🔄 Request deduplicated: ${requestKey}`);
      updateStats(requestKey, { deduplicated: 1 });
      return state.requests.active.get(requestKey) as Promise<T>;
    }

    // Create abort controller
    const abortController = new AbortController();
    
    // Chain external abort signal if provided
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => abortController.abort());
    }

    // Create request metadata
    const metadata: RequestMetadata = {
      key: requestKey,
      timestamp: Date.now(),
      component,
      priority,
      retries: 0,
      maxRetries,
      timeout,
      abortController,
    };

    // Add to pending queue
    requestQueue.current.pending.set(requestKey, metadata);
    addToPriorityQueue(requestKey, priority);

    // Wrap request with timeout and retry logic
    const executeWithRetry = async (attempt: number = 0): Promise<T> => {
      try {
        // Set timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Request timeout: ${requestKey}`)), timeout);
        });

        // Execute request with timeout race
        const result = await Promise.race([
          requestFn(),
          timeoutPromise,
        ]);

        // Success - update stats and cleanup
        const responseTime = performance.now() - startTime;
        updateStats(requestKey, { successful: 1, responseTime });
        cleanup(requestKey);

        return result;

      } catch (error) {
        const isAborted = error instanceof Error && error.name === 'AbortError';
        
        if (!isAborted && attempt < maxRetries) {
          // Retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          console.log(`🔄 Retrying request ${requestKey} (attempt ${attempt + 1}) after ${delay}ms`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          metadata.retries = attempt + 1;
          
          return executeWithRetry(attempt + 1);
        } else {
          // Final failure
          updateStats(requestKey, { failed: 1 });
          cleanup(requestKey);
          throw error;
        }
      }
    };

    // Create and track the promise
    const promise = executeWithRetry();
    dispatch({ type: 'REQUEST_START', payload: { key: requestKey, promise } });

    // Cleanup when promise settles
    promise.finally(() => {
      dispatch({ type: 'REQUEST_END', payload: { key: requestKey } });
    });

    return promise;
  }, [state.requests.active, dispatch, generateRequestKey]);

  // Update request statistics
  const updateStats = useCallback((
    key: string,
    updates: {
      successful?: number;
      failed?: number;
      deduplicated?: number;
      responseTime?: number;
    }
  ) => {
    const current = statsRef.current.get(key) || {
      total: 0,
      successful: 0,
      failed: 0,
      deduplicated: 0,
      avgResponseTime: 0,
      lastActivity: Date.now(),
    };

    const updated: RequestStats = {
      total: current.total + 1,
      successful: current.successful + (updates.successful || 0),
      failed: current.failed + (updates.failed || 0),
      deduplicated: current.deduplicated + (updates.deduplicated || 0),
      avgResponseTime: updates.responseTime
        ? (current.avgResponseTime * current.total + updates.responseTime) / (current.total + 1)
        : current.avgResponseTime,
      lastActivity: Date.now(),
    };

    statsRef.current.set(key, updated);
  }, []);

  // Add request to priority queue
  const addToPriorityQueue = useCallback((key: string, priority: RequestMetadata['priority']) => {
    const queue = requestQueue.current;
    
    if (!queue.priorities.has(priority)) {
      queue.priorities.set(priority, []);
    }
    
    queue.priorities.get(priority)!.push(key);
    
    // Schedule batch processing for low priority requests
    if (priority === 'low' && !batchTimerRef.current) {
      batchTimerRef.current = setTimeout(() => {
        processBatches();
        batchTimerRef.current = null;
      }, 100); // 100ms batch window for low priority
    }
  }, []);

  // Process batched requests
  const processBatches = useCallback(() => {
    const queue = requestQueue.current;
    const lowPriorityRequests = queue.priorities.get('low') || [];
    
    if (lowPriorityRequests.length === 0) return;

    // Group similar requests for batching
    const batchGroups = new Map<string, string[]>();
    
    lowPriorityRequests.forEach(requestKey => {
      const metadata = queue.pending.get(requestKey);
      if (!metadata) return;
      
      // Group by component and endpoint pattern
      const batchKey = `${metadata.component}_batch`;
      if (!batchGroups.has(batchKey)) {
        batchGroups.set(batchKey, []);
      }
      batchGroups.get(batchKey)!.push(requestKey);
    });

    // Execute batches
    batchGroups.forEach((requests, batchKey) => {
      if (requests.length > 1) {
        console.log(`📦 Batching ${requests.length} requests: ${batchKey}`);
        // Here you would implement actual batch execution
        // For now, just clear the queue
        requests.forEach(key => {
          queue.pending.delete(key);
        });
      }
    });

    // Clear low priority queue
    queue.priorities.set('low', []);
  }, []);

  // Cleanup completed requests
  const cleanup = useCallback((key: string) => {
    const queue = requestQueue.current;
    const metadata = queue.pending.get(key);
    
    if (metadata) {
      // Cancel abort controller
      if (!metadata.abortController.signal.aborted) {
        metadata.abortController.abort();
      }
      
      // Remove from queues
      queue.pending.delete(key);
      queue.priorities.forEach((requests, priority) => {
        const index = requests.indexOf(key);
        if (index !== -1) {
          requests.splice(index, 1);
        }
      });
    }
  }, []);

  // Cancel all pending requests
  const cancelAllRequests = useCallback((pattern?: string) => {
    const queue = requestQueue.current;
    
    queue.pending.forEach((metadata, key) => {
      if (!pattern || key.includes(pattern)) {
        metadata.abortController.abort();
        queue.pending.delete(key);
      }
    });

    // Clear priority queues
    if (!pattern) {
      queue.priorities.clear();
    } else {
      queue.priorities.forEach((requests, priority) => {
        queue.priorities.set(
          priority,
          requests.filter(key => !key.includes(pattern))
        );
      });
    }
  }, []);

  // Get request statistics for monitoring
  const getRequestStats = useCallback((
    key?: string
  ): RequestStats | Map<string, RequestStats> => {
    if (key) {
      return statsRef.current.get(key) || {
        total: 0,
        successful: 0,
        failed: 0,
        deduplicated: 0,
        avgResponseTime: 0,
        lastActivity: 0,
      };
    }
    return new Map(statsRef.current);
  }, []);

  // Get overall system health
  const getSystemHealth = useCallback(() => {
    const allStats = Array.from(statsRef.current.values());
    
    if (allStats.length === 0) {
      return {
        totalRequests: 0,
        successRate: 100,
        deduplicationRate: 0,
        avgResponseTime: 0,
        activeRequests: state.requests.active.size,
        pendingRequests: requestQueue.current.pending.size,
      };
    }

    const totals = allStats.reduce((acc, stat) => ({
      total: acc.total + stat.total,
      successful: acc.successful + stat.successful,
      failed: acc.failed + stat.failed,
      deduplicated: acc.deduplicated + stat.deduplicated,
      responseTime: acc.responseTime + stat.avgResponseTime,
    }), { total: 0, successful: 0, failed: 0, deduplicated: 0, responseTime: 0 });

    return {
      totalRequests: totals.total,
      successRate: totals.total > 0 ? (totals.successful / totals.total) * 100 : 100,
      deduplicationRate: totals.total > 0 ? (totals.deduplicated / totals.total) * 100 : 0,
      avgResponseTime: allStats.length > 0 ? totals.responseTime / allStats.length : 0,
      activeRequests: state.requests.active.size,
      pendingRequests: requestQueue.current.pending.size,
    };
  }, [state.requests.active.size]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAllRequests();
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, [cancelAllRequests]);

  // Periodic cleanup of old statistics
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      
      statsRef.current.forEach((stat, key) => {
        if (stat.lastActivity < oneHourAgo) {
          statsRef.current.delete(key);
        }
      });
    }, 5 * 60 * 1000); // Cleanup every 5 minutes

    return () => clearInterval(cleanupInterval);
  }, []);

  return {
    // Core functionality
    executeRequest,
    cancelAllRequests,
    
    // Monitoring
    getRequestStats,
    getSystemHealth,
    
    // Utilities
    generateRequestKey,
    
    // Request status
    isActive: (key: string) => state.requests.active.has(key),
    getPendingCount: () => requestQueue.current.pending.size,
    getActiveCount: () => state.requests.active.size,
  };
}

// Convenience hook for making deduplicated API calls
export function useDedupedRequest() {
  const { executeRequest } = useRequestManager();

  return useCallback(<T>(
    requestFn: () => Promise<T>,
    endpoint: string,
    params?: Record<string, any>,
    options?: {
      priority?: RequestMetadata['priority'];
      timeout?: number;
      maxRetries?: number;
    }
  ) => {
    return executeRequest(requestFn, {
      endpoint,
      params,
      component: 'dedupe_hook',
      ...options,
    });
  }, [executeRequest]);
}