/**
 * Utility functions for competitor data analysis and validation
 */

/**
 * Check if data contains only "Your Brand" (no real competitors)
 * @param competitors - Array of competitor objects with name property
 * @returns true if only "Your Brand" exists or no competitors at all
 */
export function hasOnlyYourBrand(
  competitors: Array<{ name: string }>
): boolean {
  if (!competitors || competitors.length === 0) return true;

  const nonBrandCompetitors = competitors.filter(
    (c) => c.name !== "Your Brand"
  );
  return nonBrandCompetitors.length === 0;
}

/**
 * Check if time series data has real competitors (excluding "Your Brand")
 * @param data - Time series data array with nested competitors
 * @returns true if at least one data point has competitors other than "Your Brand"
 */
export function hasCompetitorsInTimeSeries(
  data: Array<{ competitors: Array<{ name: string }> }>
): boolean {
  if (!data || data.length === 0) return false;

  return data.some((point) => {
    const nonBrandCompetitors =
      point.competitors?.filter((c) => c.name !== "Your Brand") || [];
    return nonBrandCompetitors.length > 0;
  });
}

/**
 * Filter out "Your Brand" from competitor list
 * @param competitors - Array of competitor objects with name property
 * @returns Array of competitors excluding "Your Brand"
 */
export function filterOutYourBrand<T extends { name: string }>(
  competitors: T[]
): T[] {
  if (!competitors || competitors.length === 0) return [];
  return competitors.filter((c) => c.name !== "Your Brand");
}

/**
 * Count real competitors (excluding "Your Brand")
 * @param competitors - Array of competitor objects with name property
 * @returns Number of competitors excluding "Your Brand"
 */
export function countRealCompetitors(
  competitors: Array<{ name: string }>
): number {
  if (!competitors || competitors.length === 0) return 0;
  return competitors.filter((c) => c.name !== "Your Brand").length;
}
