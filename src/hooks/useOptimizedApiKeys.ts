import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import { ApiKey, apiKeyService } from '@/services/apiKeyService';

export function useOptimizedApiKeys() {
  const { user } = useAuth();
  const { getFromCache, setCache } = useAppState();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [primaryApiKey, setPrimaryApiKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache key for API keys
  const apiKeysCacheKey = `api_keys_${user?.id}`;
  
  // Check if we have cached API keys
  const cachedApiKeys = getFromCache<ApiKey[]>(apiKeysCacheKey);
  
  // Synchronous cache detection for immediate skeleton bypass
  const hasSyncCache = useCallback(() => {
    if (!user?.id) return false;
    const cached = getFromCache<ApiKey[]>(apiKeysCacheKey);
    return !!cached;
  }, [user?.id, apiKeysCacheKey, getFromCache]);

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
  }, [user?.id, cachedApiKeys, getFromCache, setCache, apiKeysCacheKey]);

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