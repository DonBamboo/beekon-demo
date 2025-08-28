// Website status types
export type WebsiteStatus = "pending" | "crawling" | "completed" | "failed";

// Utility constants for website status handling
export const RECONCILIATION_INTERVAL = 30000; // 30 seconds
export const EVENT_DISPATCH_DEBOUNCE = 100; // 100ms

// Helper function for finding website by ID
export function findWebsiteById<T extends { id: string }>(websites: T[], websiteId: string): T | undefined {
  return websites.find((w) => w.id === websiteId);
}