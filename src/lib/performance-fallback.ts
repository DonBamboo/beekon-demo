// Lightweight fallback for performance monitoring when main module fails to load

export interface PerformanceMetrics {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
  type: 'navigation' | 'resource' | 'measure' | 'custom';
  metadata?: Record<string, unknown>;
}

export interface VitalMetrics {
  FCP?: number;
  LCP?: number;
  FID?: number;
  CLS?: number;
  TTFB?: number;
  FMP?: number;
}

// Minimal performance monitor that doesn't break the app
export class FallbackPerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private vitals: VitalMetrics = {};

  recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    // Limit to prevent memory issues
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-50);
    }
  }

  measure<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try {
      const result = fn();
      const end = performance.now();
      this.recordMetric({
        name,
        duration: end - start,
        startTime: start,
        endTime: end,
        type: 'custom',
      });
      return result;
    } catch (error) {
      const end = performance.now();
      this.recordMetric({
        name: `${name}-error`,
        duration: end - start,
        startTime: start,
        endTime: end,
        type: 'custom',
        metadata: { error: true },
      });
      throw error;
    }
  }

  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const end = performance.now();
      this.recordMetric({
        name,
        duration: end - start,
        startTime: start,
        endTime: end,
        type: 'custom',
      });
      return result;
    } catch (error) {
      const end = performance.now();
      this.recordMetric({
        name: `${name}-error`,
        duration: end - start,
        startTime: start,
        endTime: end,
        type: 'custom',
        metadata: { error: true },
      });
      throw error;
    }
  }

  startTiming(name: string): void {
    try {
      performance.mark(`${name}-start`);
    } catch (error) {
      // Ignore errors in fallback mode
    }
  }

  endTiming(name: string): void {
    try {
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
    } catch (error) {
      // Ignore errors in fallback mode
    }
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  getVitals(): VitalMetrics {
    return { ...this.vitals };
  }

  getSummary() {
    const durations = this.metrics.map(m => m.duration);
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

  clearMetrics(): void {
    this.metrics = [];
  }

  disconnect(): void {
    // No-op in fallback mode
  }

  exportMetrics(): string {
    return JSON.stringify({
      metrics: this.metrics,
      vitals: this.vitals,
      summary: this.getSummary(),
      timestamp: new Date().toISOString(),
      fallback: true,
    }, null, 2);
  }
}

// Export fallback instance
export const fallbackPerformanceMonitor = new FallbackPerformanceMonitor();