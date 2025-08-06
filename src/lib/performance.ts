// Performance monitoring utilities
import React from "react";

// Extended performance interface for memory usage
interface PerformanceExtended extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

// Layout Shift entry type
interface LayoutShift extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
}

// Event timing entry type  
interface PerformanceEventTiming extends PerformanceEntry {
  processingStart: number;
}

export interface PerformanceMetrics {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
  type: "navigation" | "resource" | "measure" | "custom";
  metadata?: Record<string, unknown>;
}

export interface VitalMetrics {
  FCP?: number; // First Contentful Paint
  LCP?: number; // Largest Contentful Paint
  FID?: number; // First Input Delay
  CLS?: number; // Cumulative Layout Shift
  TTFB?: number; // Time to First Byte
  FMP?: number; // First Meaningful Paint
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private observers: Map<string, PerformanceObserver> = new Map();
  private vitals: VitalMetrics = {};

  constructor() {
    this.initializeObservers();
    this.collectVitals();
  }

  // Initialize performance observers
  private initializeObservers(): void {
    if (typeof window === "undefined") return;

    // Resource loading observer
    if ("PerformanceObserver" in window) {
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.recordMetric({
              name: entry.name,
              duration: entry.duration,
              startTime: entry.startTime,
              endTime: entry.startTime + entry.duration,
              type: "resource",
              metadata: {
                initiatorType: (entry as PerformanceResourceTiming)
                  .initiatorType,
                transferSize: (entry as PerformanceResourceTiming).transferSize,
                encodedBodySize: (entry as PerformanceResourceTiming)
                  .encodedBodySize,
                decodedBodySize: (entry as PerformanceResourceTiming)
                  .decodedBodySize,
              },
            });
          }
        });

        resourceObserver.observe({ entryTypes: ["resource"] });
        this.observers.set("resource", resourceObserver);
      } catch (error) {
        console.warn("Resource observer not supported:", error);
      }

      // Navigation observer
      try {
        const navigationObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const navEntry = entry as PerformanceNavigationTiming;
            this.recordMetric({
              name: "navigation",
              duration: entry.duration,
              startTime: entry.startTime,
              endTime: entry.startTime + entry.duration,
              type: "navigation",
              metadata: {
                domContentLoadedEventStart: navEntry.domContentLoadedEventStart,
                domContentLoadedEventEnd: navEntry.domContentLoadedEventEnd,
                loadEventStart: navEntry.loadEventStart,
                loadEventEnd: navEntry.loadEventEnd,
                redirectCount: navEntry.redirectCount,
                type: navEntry.type,
              },
            });
          }
        });

        navigationObserver.observe({ entryTypes: ["navigation"] });
        this.observers.set("navigation", navigationObserver);
      } catch (error) {
        console.warn("Navigation observer not supported:", error);
      }

      // Measure observer
      try {
        const measureObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.recordMetric({
              name: entry.name,
              duration: entry.duration,
              startTime: entry.startTime,
              endTime: entry.startTime + entry.duration,
              type: "measure",
            });
          }
        });

        measureObserver.observe({ entryTypes: ["measure"] });
        this.observers.set("measure", measureObserver);
      } catch (error) {
        console.warn("Measure observer not supported:", error);
      }
    }
  }

  // Collect Core Web Vitals
  private collectVitals(): void {
    if (typeof window === "undefined") return;

    // First Contentful Paint
    const fcpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          this.vitals.FCP = entry.startTime;
        }
      }
    });

    try {
      fcpObserver.observe({ entryTypes: ["paint"] });
    } catch (error) {
      console.warn("Paint observer not supported:", error);
    }

    // Largest Contentful Paint
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        this.vitals.LCP = lastEntry.startTime;
      }
    });

    try {
      lcpObserver.observe({ entryTypes: ["largest-contentful-paint"] });
    } catch (error) {
      console.warn("LCP observer not supported:", error);
    }

    // First Input Delay
    const fidObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.vitals.FID = (entry as PerformanceEventTiming).processingStart - entry.startTime;
      }
    });

    try {
      fidObserver.observe({ entryTypes: ["first-input"] });
    } catch (error) {
      console.warn("FID observer not supported:", error);
    }

    // Cumulative Layout Shift
    const clsObserver = new PerformanceObserver((list) => {
      let clsValue = 0;
      for (const entry of list.getEntries()) {
        if (!(entry as LayoutShift).hadRecentInput) {
          clsValue += (entry as LayoutShift).value;
        }
      }
      this.vitals.CLS = clsValue;
    });

    try {
      clsObserver.observe({ entryTypes: ["layout-shift"] });
    } catch (error) {
      console.warn("CLS observer not supported:", error);
    }

    // Time to First Byte
    const navTiming = performance.getEntriesByType(
      "navigation"
    )[0] as PerformanceNavigationTiming;
    if (navTiming) {
      this.vitals.TTFB = navTiming.responseStart - navTiming.requestStart;
    }
  }

  // Record a performance metric
  recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);

    // Limit metrics array size to prevent memory issues
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-500);
    }
  }

  // Measure a function execution time
  measure<T>(name: string, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const end = performance.now();

    this.recordMetric({
      name,
      duration: end - start,
      startTime: start,
      endTime: end,
      type: "custom",
    });

    return result;
  }

  // Measure async function execution time
  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();

    this.recordMetric({
      name,
      duration: end - start,
      startTime: start,
      endTime: end,
      type: "custom",
    });

    return result;
  }

  // Start a timing measurement
  startTiming(name: string): void {
    performance.mark(`${name}-start`);
  }

  // End a timing measurement
  endTiming(name: string): void {
    performance.mark(`${name}-end`);
    performance.measure(name, `${name}-start`, `${name}-end`);
  }

  // Get all recorded metrics
  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  // Get metrics by type
  getMetricsByType(type: PerformanceMetrics["type"]): PerformanceMetrics[] {
    return this.metrics.filter((metric) => metric.type === type);
  }

  // Get metrics by name
  getMetricsByName(name: string): PerformanceMetrics[] {
    return this.metrics.filter((metric) => metric.name === name);
  }

  // Get vital metrics
  getVitals(): VitalMetrics {
    return { ...this.vitals };
  }

  // Get performance summary
  getSummary(): {
    totalMetrics: number;
    avgDuration: number;
    maxDuration: number;
    minDuration: number;
    vitals: VitalMetrics;
  } {
    const durations = this.metrics.map((m) => m.duration);
    const total = durations.length;
    const avg = total > 0 ? durations.reduce((a, b) => a + b, 0) / total : 0;
    const max = total > 0 ? Math.max(...durations) : 0;
    const min = total > 0 ? Math.min(...durations) : 0;

    return {
      totalMetrics: total,
      avgDuration: avg,
      maxDuration: max,
      minDuration: min,
      vitals: this.getVitals(),
    };
  }

  // Clear all metrics
  clearMetrics(): void {
    this.metrics = [];
  }

  // Disconnect all observers
  disconnect(): void {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
  }

  // Export metrics as JSON
  exportMetrics(): string {
    return JSON.stringify(
      {
        metrics: this.metrics,
        vitals: this.vitals,
        summary: this.getSummary(),
        timestamp: new Date().toISOString(),
      },
      null,
      2
    );
  }

  // Send metrics to analytics service
  async sendMetrics(endpoint: string, apiKey?: string): Promise<void> {
    const data = {
      metrics: this.metrics.slice(-100), // Send last 100 metrics
      vitals: this.vitals,
      summary: this.getSummary(),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    try {
      await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
        },
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error("Failed to send metrics:", error);
    }
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// React hook for performance monitoring
export function usePerformanceMonitor() {
  const [metrics, setMetrics] = React.useState<PerformanceMetrics[]>([]);
  const [vitals, setVitals] = React.useState<VitalMetrics>({});

  React.useEffect(() => {
    const updateMetrics = () => {
      setMetrics(performanceMonitor.getMetrics());
      setVitals(performanceMonitor.getVitals());
    };

    // Update metrics every 5 seconds
    const interval = setInterval(updateMetrics, 5000);

    // Initial update
    updateMetrics();

    return () => clearInterval(interval);
  }, []);

  const measure = React.useCallback(<T>(name: string, fn: () => T): T => {
    return performanceMonitor.measure(name, fn);
  }, []);

  const measureAsync = React.useCallback(
    <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      return performanceMonitor.measureAsync(name, fn);
    },
    []
  );

  const startTiming = React.useCallback((name: string) => {
    performanceMonitor.startTiming(name);
  }, []);

  const endTiming = React.useCallback((name: string) => {
    performanceMonitor.endTiming(name);
  }, []);

  return {
    metrics,
    vitals,
    measure,
    measureAsync,
    startTiming,
    endTiming,
    getSummary: () => performanceMonitor.getSummary(),
    clearMetrics: () => performanceMonitor.clearMetrics(),
    exportMetrics: () => performanceMonitor.exportMetrics(),
  };
}

// HOC for measuring component render time
export function withPerformanceMonitoring<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string
) {
  const name =
    componentName || Component.displayName || Component.name || "Component";

  return React.memo(
    React.forwardRef<HTMLElement, P>((props, ref) => {
      const renderStart = React.useRef<number>(0);

      // Measure render time
      renderStart.current = performance.now();

      React.useLayoutEffect(() => {
        const renderEnd = performance.now();
        performanceMonitor.recordMetric({
          name: `${name}-render`,
          duration: renderEnd - renderStart.current,
          startTime: renderStart.current,
          endTime: renderEnd,
          type: "custom",
          metadata: { type: "component-render" },
        });
      });

      return React.createElement(Component, { ...props, ref });
    })
  );
}

// Utility to measure API call performance
export function measureApiCall<T>(
  name: string,
  promise: Promise<T>
): Promise<T> {
  return performanceMonitor.measureAsync(name, () => promise);
}

// Memory usage monitoring
export function getMemoryUsage(): {
  used: number;
  total: number;
  percentage: number;
} | null {
  const memory = (performance as PerformanceExtended).memory;
  if (!memory) return null;

  return {
    used: memory.usedJSHeapSize,
    total: memory.totalJSHeapSize,
    percentage: Math.round(
      (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100
    ),
  };
}

// FPS monitoring
export function startFPSMonitoring(
  callback: (fps: number) => void
): () => void {
  let fps = 0;
  let lastTime = performance.now();
  let frameCount = 0;
  let animationId: number;

  function tick() {
    const now = performance.now();
    frameCount++;

    if (now - lastTime >= 1000) {
      fps = Math.round((frameCount * 1000) / (now - lastTime));
      callback(fps);
      frameCount = 0;
      lastTime = now;
    }

    animationId = requestAnimationFrame(tick);
  }

  tick();

  return () => {
    cancelAnimationFrame(animationId);
  };
}
