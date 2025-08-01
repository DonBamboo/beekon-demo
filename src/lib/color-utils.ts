/**
 * Color utility functions for consistent, accessible chart coloring
 */

// Available chart color indices (2-10, since chart-1 is reserved for primary/Your Brand)
const AVAILABLE_CHART_COLORS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

// Color metadata for accessibility and legend purposes
export const CHART_COLOR_INFO = {
  2: { name: 'Blue', hex: '#0080ff', accessible: true },
  3: { name: 'Green', hex: '#00b359', accessible: true },
  4: { name: 'Orange', hex: '#ff8000', accessible: true },
  5: { name: 'Purple', hex: '#9900cc', accessible: true },
  6: { name: 'Red', hex: '#ff0000', accessible: true },
  7: { name: 'Teal', hex: '#00b3b3', accessible: true },
  8: { name: 'Violet', hex: '#8000ff', accessible: true },
  9: { name: 'Amber', hex: '#cc7a00', accessible: true },
  10: { name: 'Pink', hex: '#e6005c', accessible: true },
} as const;

// Cache for stable competitor color assignments
const competitorColorCache = new Map<string, number>();

/**
 * Simple hash function for consistent color assignment based on string
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get a consistent color index for a competitor
 * @param competitorId - Unique identifier for the competitor
 * @param competitorName - Display name (used as fallback for hashing)
 * @param fallbackIndex - Index to use if no ID/name available
 * @returns Chart color index (2-10)
 */
export function getCompetitorColorIndex(
  competitorId?: string, 
  competitorName?: string, 
  fallbackIndex: number = 0
): number {
  // Use competitorId as primary key for consistency
  const key = competitorId || competitorName || `fallback-${fallbackIndex}`;
  
  // Check cache first for stable assignment
  if (competitorColorCache.has(key)) {
    return competitorColorCache.get(key)!;
  }
  
  // Generate consistent color index based on key
  let colorIndex: number;
  
  if (competitorId || competitorName) {
    // Hash-based assignment for stable colors across sessions
    const hash = simpleHash(key);
    colorIndex = AVAILABLE_CHART_COLORS[hash % AVAILABLE_CHART_COLORS.length];
  } else {
    // Fallback to index-based assignment
    colorIndex = AVAILABLE_CHART_COLORS[fallbackIndex % AVAILABLE_CHART_COLORS.length];
  }
  
  // Cache the assignment
  competitorColorCache.set(key, colorIndex);
  
  return colorIndex;
}

/**
 * Get CSS color value for a competitor
 * @param competitorId - Unique identifier for the competitor
 * @param competitorName - Display name (used as fallback for hashing)
 * @param fallbackIndex - Index to use if no ID/name available
 * @returns CSS hsl() color value
 */
export function getCompetitorColor(
  competitorId?: string, 
  competitorName?: string, 
  fallbackIndex: number = 0
): string {
  const colorIndex = getCompetitorColorIndex(competitorId, competitorName, fallbackIndex);
  return `hsl(var(--chart-${colorIndex}))`;
}

/**
 * Get color for "Your Brand" (always uses primary)
 * @returns CSS primary color value
 */
export function getYourBrandColor(): string {
  return "hsl(var(--primary))";
}

/**
 * Get color information for legends and accessibility
 * @param colorIndex - Chart color index
 * @returns Color metadata object
 */
export function getColorInfo(colorIndex: number) {
  return CHART_COLOR_INFO[colorIndex as keyof typeof CHART_COLOR_INFO] || {
    name: `Color ${colorIndex}`,
    hex: '#666666',
    accessible: false
  };
}

/**
 * Generate color assignments for a list of competitors
 * @param competitors - Array of competitor objects with id and/or name
 * @returns Array of color assignments with metadata
 */
export function generateCompetitorColorScheme<T extends { id?: string; name?: string }>(
  competitors: T[]
): Array<T & { colorIndex: number; color: string; colorName: string }> {
  return competitors.map((competitor, index) => {
    const colorIndex = getCompetitorColorIndex(competitor.id, competitor.name, index);
    const color = `hsl(var(--chart-${colorIndex}))`;
    const colorInfo = getColorInfo(colorIndex);
    
    return {
      ...competitor,
      colorIndex,
      color,
      colorName: colorInfo.name,
    };
  });
}

/**
 * Clear the color cache (useful for testing or reset scenarios)
 */
export function clearCompetitorColorCache(): void {
  competitorColorCache.clear();
}

/**
 * Get total number of available colors for competitors
 */
export function getMaxCompetitorColors(): number {
  return AVAILABLE_CHART_COLORS.length;
}

/**
 * Check if we have enough colors for the given number of competitors
 * @param competitorCount - Number of competitors
 * @returns Boolean indicating if we have sufficient distinct colors
 */
export function hasSufficientColors(competitorCount: number): boolean {
  return competitorCount <= AVAILABLE_CHART_COLORS.length;
}