import { useCallback, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useAppState } from "@/hooks/appStateHooks";
import { useRequestManager } from "./useRequestManager";
import { batchAPI } from "@/services/batchService";
import { persistentStorage } from "@/lib/storage";

// Navigation pattern analysis
interface NavigationPattern {
  from: string;
  to: string;
  frequency: number;
  avgTimeSpent: number;
  lastSeen: number;
  userAction: "click" | "back" | "forward" | "direct";
}

// Prefetch strategy configuration
interface PrefetchConfig {
  enabled: boolean;
  aggressiveness: "conservative" | "moderate" | "aggressive";
  minProbability: number; // Minimum probability threshold to trigger prefetch
  maxConcurrent: number; // Maximum concurrent prefetch requests
  timingStrategy: "immediate" | "idle" | "hover" | "predictive";
}

// Prefetch target with metadata
interface PrefetchTarget {
  page: string;
  websiteId?: string;
  probability: number;
  data: unknown;
  lastPrefetch: number;
  priority: "low" | "medium" | "high";
}

// Default prefetch configuration
const DEFAULT_CONFIG: PrefetchConfig = {
  enabled: true,
  aggressiveness: "moderate",
  minProbability: 0.3, // 30% minimum probability
  maxConcurrent: 3,
  timingStrategy: "predictive",
};

/**
 * Smart prefetching hook that learns user navigation patterns
 * and preloads data for anticipated page transitions
 */
export function usePrefetching(config: Partial<PrefetchConfig> = {}) {
  const location = useLocation();
  const { state } = useAppState();
  const { executeRequest, getSystemHealth } = useRequestManager();

  const finalConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );
  const patternsRef = useRef<Map<string, NavigationPattern>>(new Map());
  const prefetchCacheRef = useRef<Map<string, PrefetchTarget>>(new Map());
  const activePrefetches = useRef<Map<string, Promise<unknown>>>(new Map());
  const idleCallbackRef = useRef<number | null>(null);

  const currentPage = location.pathname;
  const selectedWebsiteId = state.workspace.selectedWebsiteId;

  // Helper function to determine priority based on probability
  const getPrefetchPriority = (
    probability: number
  ): PrefetchTarget["priority"] => {
    if (probability >= 0.7) return "high";
    if (probability >= 0.4) return "medium";
    return "low";
  };

  // Get default predictions when no historical data exists
  const getDefaultPredictions = useCallback((): PrefetchTarget[] => {
    const commonPatterns: Array<{
      from: string;
      to: string;
      probability: number;
    }> = [
      { from: "/dashboard", to: "/analysis", probability: 0.6 },
      { from: "/dashboard", to: "/competitors", probability: 0.4 },
      { from: "/analysis", to: "/competitors", probability: 0.5 },
      { from: "/analysis", to: "/dashboard", probability: 0.3 },
      { from: "/competitors", to: "/analysis", probability: 0.5 },
      { from: "/competitors", to: "/dashboard", probability: 0.3 },
    ];

    return commonPatterns
      .filter(
        (pattern) =>
          pattern.from === currentPage &&
          pattern.probability >= finalConfig.minProbability
      )
      .map((pattern) => ({
        page: pattern.to,
        websiteId: selectedWebsiteId || undefined,
        probability: pattern.probability,
        data: null,
        lastPrefetch: 0,
        priority: getPrefetchPriority(pattern.probability),
      }));
  }, [currentPage, finalConfig.minProbability, selectedWebsiteId]);

  // Load navigation patterns from storage
  const loadNavigationPatterns = useCallback(() => {
    const navState = persistentStorage.loadNavigationState();
    const history = navState?.history || [];

    // Analyze navigation patterns
    const patterns = new Map<string, NavigationPattern>();

    history.forEach((nav: Record<string, unknown>) => {
      const key = `${nav.from}->${nav.to}`;
      const existing = patterns.get(key);

      if (existing) {
        existing.frequency += 1;
        existing.lastSeen = Math.max(
          existing.lastSeen,
          nav.timestamp as unknown as number
        );
      } else {
        patterns.set(key, {
          from: nav.from as unknown as string,
          to: nav.to as unknown as string,
          frequency: 1,
          avgTimeSpent: 0, // Would need to calculate from session data
          lastSeen: nav.timestamp as unknown as number,
          userAction:
            (nav.userAction as unknown as
              | "click"
              | "back"
              | "forward"
              | "direct") || "direct",
        });
      }
    });

    patternsRef.current = patterns;
  }, []);

  // Analyze current page to predict next navigation
  const predictNextPages = useCallback((): PrefetchTarget[] => {
    if (!finalConfig.enabled) return [];

    const predictions: PrefetchTarget[] = [];
    const patterns = Array.from(patternsRef.current.values());
    const fromCurrentPage = patterns.filter((p) => p.from === currentPage);

    if (fromCurrentPage.length === 0) {
      // No historical data, use default predictions
      return getDefaultPredictions();
    }

    // Calculate total navigations from current page
    const totalFromCurrent = fromCurrentPage.reduce(
      (sum, p) => sum + p.frequency,
      0
    );

    fromCurrentPage.forEach((pattern) => {
      const probability = pattern.frequency / totalFromCurrent;

      if (probability >= finalConfig.minProbability) {
        // Adjust probability based on recency
        const daysSinceLastSeen =
          (Date.now() - pattern.lastSeen) / (1000 * 60 * 60 * 24);
        const recencyMultiplier = Math.max(0.1, 1 - daysSinceLastSeen / 30); // Decay over 30 days
        const adjustedProbability = probability * recencyMultiplier;

        if (adjustedProbability >= finalConfig.minProbability) {
          predictions.push({
            page: pattern.to,
            websiteId: selectedWebsiteId || undefined,
            probability: adjustedProbability,
            data: null,
            lastPrefetch: 0,
            priority: getPrefetchPriority(adjustedProbability),
          });
        }
      }
    });

    return predictions
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3);
  }, [currentPage, finalConfig, selectedWebsiteId, getDefaultPredictions]);

  // Execute prefetch for a specific target
  const executePrefetch = useCallback(
    async (target: PrefetchTarget): Promise<void> => {
      const prefetchKey = `${target.page}_${target.websiteId || "global"}`;

      // Skip if already prefetching or recently prefetched
      if (activePrefetches.current.has(prefetchKey)) return;

      const timeSinceLastPrefetch = Date.now() - target.lastPrefetch;
      const minRefreshTime = 5 * 60 * 1000; // 5 minutes minimum between prefetches

      if (timeSinceLastPrefetch < minRefreshTime) return;

      console.log(
        `🚀 Prefetching data for ${target.page} (probability: ${(
          target.probability * 100
        ).toFixed(1)}%)`
      );

      try {
        let prefetchPromise: Promise<unknown>;

        // Select appropriate prefetch strategy based on page
        switch (target.page) {
          case "/analysis":
            if (!target.websiteId) return;
            prefetchPromise = batchAPI.loadAnalysisPage(target.websiteId);
            break;

          case "/competitors":
            if (!target.websiteId) return;
            prefetchPromise = batchAPI.loadCompetitorsPage(target.websiteId);
            break;

          case "/dashboard": {
            const websiteIds = state.workspace.websites.map((w) => w.id);
            if (websiteIds.length === 0) return;
            prefetchPromise = batchAPI.loadDashboardPage(websiteIds);
            break;
          }

          default:
            return; // No prefetch strategy for this page
        }

        // Track active prefetch
        activePrefetches.current.set(prefetchKey, prefetchPromise);

        // Execute prefetch with lower priority
        const result = await executeRequest(() => prefetchPromise, {
          endpoint: `prefetch_${target.page}`,
          params: { websiteId: target.websiteId },
          component: "prefetch",
          priority: "low",
          timeout: 15000, // Shorter timeout for prefetch
        });

        // Cache prefetched data
        target.data = result;
        target.lastPrefetch = Date.now();
        prefetchCacheRef.current.set(prefetchKey, target);

        console.log(`✅ Prefetch completed for ${target.page}`);
      } catch (error) {
        console.warn(`❌ Prefetch failed for ${target.page}:`, error);
      } finally {
        activePrefetches.current.delete(prefetchKey);
      }
    },
    [executeRequest, state.workspace.websites]
  );

  // Execute prefetches based on timing strategy
  const schedulePrefetches = useCallback(
    (targets: PrefetchTarget[]) => {
      if (!finalConfig.enabled || targets.length === 0) return;

      const systemHealth = getSystemHealth();

      // Reduce aggressiveness if system is under load
      const maxConcurrent =
        systemHealth.activeRequests > 5
          ? Math.max(1, finalConfig.maxConcurrent - 2)
          : finalConfig.maxConcurrent;

      // Limit concurrent prefetches
      const availableSlots = maxConcurrent - activePrefetches.current.size;
      const targetsToPrefetch = targets.slice(0, Math.max(0, availableSlots));

      switch (finalConfig.timingStrategy) {
        case "immediate":
          targetsToPrefetch.forEach(executePrefetch);
          break;

        case "idle":
          if (idleCallbackRef.current) {
            cancelIdleCallback(idleCallbackRef.current);
          }

          idleCallbackRef.current = requestIdleCallback(
            () => {
              targetsToPrefetch.forEach(executePrefetch);
            },
            { timeout: 5000 }
          );
          break;

        case "predictive": {
          // Immediate for high priority, idle for others
          const highPriority = targetsToPrefetch.filter(
            (t) => t.priority === "high"
          );
          const others = targetsToPrefetch.filter((t) => t.priority !== "high");

          highPriority.forEach(executePrefetch);

          if (others.length > 0) {
            if (idleCallbackRef.current) {
              cancelIdleCallback(idleCallbackRef.current);
            }

            idleCallbackRef.current = requestIdleCallback(
              () => {
                others.forEach(executePrefetch);
              },
              { timeout: 3000 }
            );
          }
          break;
        }
      }
    },
    [finalConfig, executePrefetch, getSystemHealth]
  );

  // Get prefetched data if available
  const getPrefetchedData = useCallback(
    (page: string, websiteId?: string): unknown => {
      const key = `${page}_${websiteId || "global"}`;
      const cached = prefetchCacheRef.current.get(key);

      if (cached && cached.data) {
        // Check if data is still fresh (5 minutes)
        const age = Date.now() - cached.lastPrefetch;
        if (age < 5 * 60 * 1000) {
          console.log(`⚡ Using prefetched data for ${page}`);
          return cached.data;
        }
      }

      return null;
    },
    []
  );

  // Track user interaction for pattern learning
  const trackInteraction = useCallback(
    (action: "click" | "hover" | "focus", targetPage: string) => {
      if (action === "hover") {
        // Opportunistic prefetch on hover for high-confidence predictions
        const key = `${targetPage}_${selectedWebsiteId || "global"}`;
        const target = prefetchCacheRef.current.get(key);

        if (
          target &&
          target.probability > 0.6 &&
          !activePrefetches.current.has(key)
        ) {
          executePrefetch(target);
        }
      }
    },
    [selectedWebsiteId, executePrefetch]
  );

  // Main effect - analyze patterns and schedule prefetches
  useEffect(() => {
    loadNavigationPatterns();
    const predictions = predictNextPages();

    if (predictions.length > 0) {
      // Slight delay to avoid interfering with current page load
      const prefetchDelay =
        finalConfig.aggressiveness === "aggressive"
          ? 100
          : finalConfig.aggressiveness === "moderate"
          ? 500
          : 1000;

      setTimeout(() => {
        schedulePrefetches(predictions);
      }, prefetchDelay);
    }
  }, [
    currentPage,
    selectedWebsiteId,
    loadNavigationPatterns,
    predictNextPages,
    schedulePrefetches,
    finalConfig,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    const currentPrefetches = activePrefetches.current;
    return () => {
      if (idleCallbackRef.current) {
        cancelIdleCallback(idleCallbackRef.current);
      }

      // Cancel active prefetches
      currentPrefetches.clear();
    };
  }, []);

  // Periodic cleanup of old prefetch data
  useEffect(() => {
    const cleanup = setInterval(() => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      prefetchCacheRef.current.forEach((target, key) => {
        if (target.lastPrefetch < oneHourAgo) {
          prefetchCacheRef.current.delete(key);
        }
      });
    }, 10 * 60 * 1000); // Cleanup every 10 minutes

    return () => clearInterval(cleanup);
  }, []);

  return {
    // Get prefetched data
    getPrefetchedData,

    // Manual triggers
    trackInteraction,

    // Prefetch management
    forcePrefetch: (page: string, websiteId?: string) => {
      const target: PrefetchTarget = {
        page,
        websiteId,
        probability: 1.0,
        data: null,
        lastPrefetch: 0,
        priority: "high",
      };
      executePrefetch(target);
    },

    // Statistics
    getActivePrefetches: () => activePrefetches.current.size,
    getCachedPrefetches: () => prefetchCacheRef.current.size,
    getNavigationPatterns: () => Array.from(patternsRef.current.values()),

    // Configuration
    config: finalConfig,

    // Predictions for debugging
    getCurrentPredictions: predictNextPages,
  };
}

// Hook for components to indicate prefetch opportunities
export function usePrefetchTriggers() {
  const { trackInteraction } = usePrefetching();

  const onLinkHover = useCallback(
    (targetPage: string) => {
      trackInteraction("hover", targetPage);
    },
    [trackInteraction]
  );

  const onLinkClick = useCallback(
    (targetPage: string) => {
      trackInteraction("click", targetPage);
    },
    [trackInteraction]
  );

  return {
    onLinkHover,
    onLinkClick,
  };
}
