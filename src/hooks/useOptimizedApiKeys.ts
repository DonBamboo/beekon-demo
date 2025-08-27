import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/hooks/appStateHooks';
import { ApiKey, apiKeyService } from '@/services/apiKeyService';

export function useOptimizedApiKeys() {
  const { user } = useAuth();
  const { getFromCache, setCache } = useAppState();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [primaryApiKey, setPrimaryApiKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FIXED: Stabilize cache key to prevent infinite loops
  const apiKeysCacheKey = useMemo(() => `api_keys_${user?.id}`, [user?.id]);
  
  // FIXED: Memoize cached API keys to prevent recreation on every render
  const cachedApiKeys = useMemo(() => {
    if (!user?.id) return null;
    return getFromCache<ApiKey[]>(apiKeysCacheKey);
  }, [user?.id, apiKeysCacheKey, getFromCache]);
  
  // FIXED: Synchronous cache detection - use stable cached value instead of calling getFromCache
  const hasSyncCache = useCallback(() => {
    return !!cachedApiKeys;
  }, [cachedApiKeys]);

  const loadApiKeys = useCallback(async (forceRefresh = false) => {
    if (!user?.id) {
      setApiKeys([]);
      setPrimaryApiKey('');
      setError(null);
      return;
    }

    // Use cached data for instant rendering
    if (!forceRefresh && cachedApiKeys) {
      setApiKeys(cachedApiKeys);
      if (cachedApiKeys.length > 0) {
        setPrimaryApiKey(cachedApiKeys[0]?.key_prefix + '...');
      }
      setIsLoading(false);
      return;
    }

    // Show loading only if no cached data
    if (!cachedApiKeys) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const userApiKeys = await apiKeyService.getApiKeys(user.id);
      setApiKeys(userApiKeys);
      if (userApiKeys.length > 0) {
        setPrimaryApiKey(userApiKeys[0]?.key_prefix + '...');
      } else {
        setPrimaryApiKey('');
      }
      
      // Cache API keys for 10 minutes
      setCache(apiKeysCacheKey, userApiKeys, 10 * 60 * 1000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load API keys.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, cachedApiKeys, setCache, apiKeysCacheKey]); // Dependencies are now stable

  // Load API keys when user changes
  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  // Refresh API keys (called when modal closes after changes)
  const refreshApiKeys = useCallback(() => {
    loadApiKeys(true);
  }, [loadApiKeys]);

  return {
    apiKeys,
    primaryApiKey,
    isLoading: isLoading && !hasSyncCache(), // Only show loading if no cache
    error,
    loadApiKeys,
    refreshApiKeys,
    hasCachedData: !!cachedApiKeys,
    hasSyncCache,
  };
}