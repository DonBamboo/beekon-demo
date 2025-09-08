/**
 * Color utility functions for consistent, accessible chart coloring
 */

// Available chart color indices (2-25, since chart-1 is reserved for primary/Your Brand)
const AVAILABLE_CHART_COLORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];

// Color metadata for accessibility and legend purposes
export const CHART_COLOR_INFO = {
  // Primary Colors (2-10) - High contrast, distinct
  2: { name: 'Blue', hex: '#0080ff', accessible: true },
  3: { name: 'Green', hex: '#00b359', accessible: true },
  4: { name: 'Orange', hex: '#ff8000', accessible: true },
  5: { name: 'Purple', hex: '#9900cc', accessible: true },
  6: { name: 'Red', hex: '#ff0000', accessible: true },
  7: { name: 'Teal', hex: '#00b3b3', accessible: true },
  8: { name: 'Violet', hex: '#8000ff', accessible: true },
  9: { name: 'Amber', hex: '#cc7a00', accessible: true },
  10: { name: 'Pink', hex: '#e6005c', accessible: true },
  
  // Extended Colors (11-20) - Additional distinct colors
  11: { name: 'Cyan', hex: '#0099e6', accessible: true },
  12: { name: 'Lime', hex: '#57d900', accessible: true },
  13: { name: 'Rose', hex: '#e60073', accessible: true },
  14: { name: 'Indigo', hex: '#6666ff', accessible: true },
  15: { name: 'Yellow', hex: '#ffcc00', accessible: true },
  16: { name: 'Emerald', hex: '#00cc66', accessible: true },
  17: { name: 'Fuchsia', hex: '#d900cc', accessible: true },
  18: { name: 'Sky', hex: '#0099cc', accessible: true },
  19: { name: 'Orange Red', hex: '#ff6600', accessible: true },
  20: { name: 'Blue Violet', hex: '#9966ff', accessible: true },
  
  // Tertiary Colors (21-25) - Subtle variations
  21: { name: 'Muted Teal', hex: '#4d9999', accessible: true },
  22: { name: 'Burnt Orange', hex: '#cc5500', accessible: true },
  23: { name: 'Medium Purple', hex: '#9966cc', accessible: true },
  24: { name: 'Olive Green', hex: '#739926', accessible: true },
  25: { name: 'Coral Pink', hex: '#e6739f', accessible: true },
} as const;

// Cache for stable competitor color assignments
const competitorColorCache = new Map<string, number>();

// Global competitor registry for consistent ordering across all charts
const globalCompetitorRegistry = new Map<string, number>();
let globalCompetitorCounter = 0;

// Fixed color slot assignment system for predictable competitor colors
const FIXED_COLOR_SLOTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
const fixedColorSlotRegistry = new Map<string, number>(); // competitorKey -> colorSlot
const usedColorSlots = new Set<number>(); // Track which slots are in use
let nextAvailableSlot = 0; // Index into FIXED_COLOR_SLOTS array

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
 * Generate a standardized competitor key for consistent color assignment
 * @param competitorData - Object containing competitor identification data
 * @returns Standardized key for color assignment
 */
export function generateCompetitorKey(competitorData: {
  id?: string;
  competitorId?: string; 
  name?: string;
  competitor_name?: string;
  competitor_domain?: string;
}): string {
  // Priority order: competitorId > id > competitor_name > name > competitor_domain
  const identifier = competitorData.competitorId || 
                    competitorData.id || 
                    competitorData.competitor_name || 
                    competitorData.name || 
                    competitorData.competitor_domain;
                    
  if (!identifier) {
    throw new Error('Competitor data must contain at least one identifier');
  }
  
  return identifier;
}

/**
 * Register competitors in the global registry to ensure consistent ordering across all charts
 * @param competitors - Array of competitor objects
 */
export function registerCompetitorsGlobally<T extends {
  id?: string;
  competitorId?: string;
  name?: string;
  competitor_name?: string;
  competitor_domain?: string;
}>(competitors: T[]): void {
  // Sort competitors by their generated key to ensure consistent ordering
  const sortedCompetitors = competitors
    .map(comp => ({ competitor: comp, key: generateCompetitorKey(comp) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  
  // Register each competitor in the global registry if not already present
  sortedCompetitors.forEach(({ key }) => {
    if (!globalCompetitorRegistry.has(key)) {
      globalCompetitorRegistry.set(key, globalCompetitorCounter);
      globalCompetitorCounter++;
    }
  });
}

/**
 * Get the global stable index for a competitor
 * @param competitorData - Object containing competitor identification data
 * @returns Global stable index for the competitor
 */
export function getGlobalStableIndex(competitorData: {
  id?: string;
  competitorId?: string;
  name?: string;
  competitor_name?: string;
  competitor_domain?: string;
}): number {
  const key = generateCompetitorKey(competitorData);
  const index = globalCompetitorRegistry.get(key);
  
  if (index === undefined) {
    // If competitor is not registered, register it now
    globalCompetitorRegistry.set(key, globalCompetitorCounter);
    const newIndex = globalCompetitorCounter;
    globalCompetitorCounter++;
    return newIndex;
  }
  
  return index;
}

/**
 * Create a stable competitor index mapping for consistent color assignments
 * @param competitors - Array of competitor objects
 * @returns Map of competitor keys to stable indices
 * @deprecated Use registerCompetitorsGlobally and getGlobalStableIndex instead
 */
export function createStableCompetitorIndexMap<T extends {
  id?: string;
  competitorId?: string;
  name?: string;
  competitor_name?: string;
  competitor_domain?: string;
}>(competitors: T[]): Map<string, number> {
  const indexMap = new Map<string, number>();
  let counter = 0;
  
  // Sort competitors by their generated key to ensure consistent ordering
  const sortedCompetitors = competitors
    .map(comp => ({ competitor: comp, key: generateCompetitorKey(comp) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  
  sortedCompetitors.forEach(({ key }) => {
    if (!indexMap.has(key)) {
      indexMap.set(key, counter);
      counter++;
    }
  });
  
  return indexMap;
}

/**
 * Get a consistent color index for a competitor using standardized key generation
 * @param competitorData - Object containing competitor identification data
 * @param stableIndex - Optional stable index from createStableCompetitorIndexMap
 * @returns Chart color index (2-25)
 */
export function getCompetitorColorIndexStandardized(
  competitorData: {
    id?: string;
    competitorId?: string;
    name?: string;
    competitor_name?: string;
    competitor_domain?: string;
  },
  stableIndex?: number
): number {
  const key = generateCompetitorKey(competitorData);
  
  // Check cache first for stable assignment
  if (competitorColorCache.has(key)) {
    return competitorColorCache.get(key)!;
  }
  
  // Generate consistent color index based on key
  let colorIndex: number;
  
  if (stableIndex !== undefined) {
    // Use provided stable index for consistent ordering across charts
    colorIndex = AVAILABLE_CHART_COLORS[stableIndex % AVAILABLE_CHART_COLORS.length] ?? 0;
  } else {
    // Hash-based assignment for stable colors across sessions
    const hash = simpleHash(key);
    colorIndex = AVAILABLE_CHART_COLORS[hash % AVAILABLE_CHART_COLORS.length] ?? 0;
  }
  
  // Cache the assignment
  competitorColorCache.set(key, colorIndex);
  
  return colorIndex;
}

/**
 * Get a consistent color index for a competitor
 * @param competitorId - Unique identifier for the competitor
 * @param competitorName - Display name (used as fallback for hashing)
 * @param fallbackIndex - Index to use if no ID/name available
 * @returns Chart color index (2-25)
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
    colorIndex = AVAILABLE_CHART_COLORS[hash % AVAILABLE_CHART_COLORS.length] ?? 0;
  } else {
    // Fallback to index-based assignment
    colorIndex = AVAILABLE_CHART_COLORS[fallbackIndex % AVAILABLE_CHART_COLORS.length] ?? 0;
  }
  
  // Cache the assignment
  competitorColorCache.set(key, colorIndex);
  
  return colorIndex;
}

/**
 * Get CSS color value for a competitor using standardized key generation
 * @param competitorData - Object containing competitor identification data
 * @param stableIndex - Optional stable index from createStableCompetitorIndexMap
 * @returns CSS hsl() color value
 */
export function getCompetitorColorStandardized(
  competitorData: {
    id?: string;
    competitorId?: string;
    name?: string;
    competitor_name?: string;
    competitor_domain?: string;
  },
  stableIndex?: number
): string {
  const colorIndex = getCompetitorColorIndexStandardized(competitorData, stableIndex);
  return `hsl(var(--chart-${colorIndex}))`;
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
export function getColorInfo(colorIndex: number): {
  name: string;
  hex: string;
  accessible: boolean;
} {
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
 * Clear the global competitor registry (useful for testing or reset scenarios)
 */
export function clearGlobalCompetitorRegistry(): void {
  globalCompetitorRegistry.clear();
  globalCompetitorCounter = 0;
}

/**
 * Load competitor color assignments from localStorage
 */
function loadFixedColorAssignments(): void {
  try {
    const stored = localStorage.getItem('beekon-competitor-colors');
    if (stored) {
      const data = JSON.parse(stored) as { assignments: Array<[string, number]>; nextSlot: number };
      
      // Restore assignments
      fixedColorSlotRegistry.clear();
      usedColorSlots.clear();
      
      data.assignments.forEach(([key, colorSlot]) => {
        fixedColorSlotRegistry.set(key, colorSlot);
        usedColorSlots.add(colorSlot);
      });
      
      nextAvailableSlot = data.nextSlot;
    }
  } catch (error) {
    // If loading fails, start fresh
    console.warn('Failed to load competitor color assignments:', error);
  }
}

/**
 * Save competitor color assignments to localStorage
 */
function saveFixedColorAssignments(): void {
  try {
    const data = {
      assignments: Array.from(fixedColorSlotRegistry.entries()),
      nextSlot: nextAvailableSlot
    };
    localStorage.setItem('beekon-competitor-colors', JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save competitor color assignments:', error);
  }
}

/**
 * Get the next available fixed color slot for a competitor
 * @returns Color slot number (2-25) or null if all slots are used
 */
function getNextAvailableColorSlot(): number | null {
  // Find first unused slot
  for (let i = 0; i < FIXED_COLOR_SLOTS.length; i++) {
    const slot = FIXED_COLOR_SLOTS[i];
    if (!usedColorSlots.has(slot)) {
      return slot;
    }
  }
  return null; // All slots are used
}

/**
 * Assign a fixed color slot to a competitor
 * @param competitorKey - Standardized competitor key
 * @returns Assigned color slot number
 */
function assignFixedColorSlot(competitorKey: string): number {
  // Check if already assigned
  if (fixedColorSlotRegistry.has(competitorKey)) {
    return fixedColorSlotRegistry.get(competitorKey)!;
  }
  
  // Get next available slot
  const colorSlot = getNextAvailableColorSlot();
  if (colorSlot === null) {
    // All slots used, cycle back to first slot (fallback)
    console.warn('All competitor color slots are used. Cycling back to first slot.');
    const fallbackSlot = FIXED_COLOR_SLOTS[0];
    fixedColorSlotRegistry.set(competitorKey, fallbackSlot);
    return fallbackSlot;
  }
  
  // Assign the slot
  fixedColorSlotRegistry.set(competitorKey, colorSlot);
  usedColorSlots.add(colorSlot);
  
  // Save to persistence
  saveFixedColorAssignments();
  
  return colorSlot;
}

/**
 * Get fixed color slot for a competitor (assigns one if not exists)
 * @param competitorData - Object containing competitor identification data
 * @returns Fixed color slot number (2-25)
 */
export function getCompetitorFixedColorSlot(competitorData: {
  id?: string;
  competitorId?: string;
  name?: string;
  competitor_name?: string;
  competitor_domain?: string;
}): number {
  // Generate standardized competitor key
  const key = generateCompetitorKey(competitorData);
  
  // Load assignments if not already loaded
  if (fixedColorSlotRegistry.size === 0 && nextAvailableSlot === 0) {
    loadFixedColorAssignments();
  }
  
  // Get or assign fixed color slot
  return assignFixedColorSlot(key);
}

/**
 * Clear all fixed color assignments (useful for reset scenarios)
 */
export function clearFixedColorAssignments(): void {
  fixedColorSlotRegistry.clear();
  usedColorSlots.clear();
  nextAvailableSlot = 0;
  
  try {
    localStorage.removeItem('beekon-competitor-colors');
  } catch (error) {
    console.warn('Failed to clear competitor color assignments from storage:', error);
  }
}

/**
 * Get all current fixed color assignments (useful for debugging/admin)
 */
export function getFixedColorAssignments(): Array<{ key: string; colorSlot: number; colorName: string }> {
  return Array.from(fixedColorSlotRegistry.entries()).map(([key, colorSlot]) => ({
    key,
    colorSlot,
    colorName: getColorInfo(colorSlot).name
  }));
}

/**
 * Get CSS color value for a competitor using fixed color slots
 * @param competitorData - Object containing competitor identification data  
 * @returns CSS hsl() color value
 */
export function getCompetitorFixedColor(competitorData: {
  id?: string;
  competitorId?: string;
  name?: string;
  competitor_name?: string;
  competitor_domain?: string;
}): string {
  const colorSlot = getCompetitorFixedColorSlot(competitorData);
  return `hsl(var(--chart-${colorSlot}))`;
}

/**
 * Get color info for a competitor using fixed color slots
 * @param competitorData - Object containing competitor identification data
 * @returns Color information including name and hex value
 */
export function getCompetitorFixedColorInfo(competitorData: {
  id?: string;
  competitorId?: string;
  name?: string;
  competitor_name?: string;
  competitor_domain?: string;
}): { name: string; hex: string; colorSlot: number } {
  const colorSlot = getCompetitorFixedColorSlot(competitorData);
  const colorInfo = getColorInfo(colorSlot);
  return {
    name: colorInfo.name,
    hex: colorInfo.hex,
    colorSlot
  };
}

/**
 * Register competitors in fixed color slot system (replaces global registry for components)
 * @param competitors - Array of competitor objects
 */
export function registerCompetitorsInFixedSlots<T extends {
  id?: string;
  competitorId?: string;
  name?: string;
  competitor_name?: string;
  competitor_domain?: string;
}>(competitors: T[]): void {
  // Simply iterate through competitors to assign them fixed slots
  // The assignment happens automatically when getCompetitorFixedColorSlot is called
  competitors.forEach(competitor => {
    getCompetitorFixedColorSlot(competitor);
  });
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

/**
 * Get all currently assigned color mappings
 * @returns Map of competitor keys to color indices
 */
export function getCurrentColorAssignments(): Map<string, number> {
  return new Map(competitorColorCache);
}

/**
 * Debug utility: Get color assignment statistics
 * @returns Object with color usage statistics
 */
export function getColorAssignmentStats(): {
  totalAssignments: number;
  uniqueColorsUsed: number;
  availableColors: number;
  duplicateAssignments: Array<{ colorIndex: number; competitors: string[] }>;
  assignments: Array<{ key: string; colorIndex: number; colorName: string }>;
} {
  const assignments = Array.from(competitorColorCache.entries()).map(([key, colorIndex]) => ({
    key,
    colorIndex,
    colorName: getColorInfo(colorIndex).name,
  }));

  const colorUsage = new Map<number, string[]>();
  assignments.forEach(({ key, colorIndex }) => {
    if (!colorUsage.has(colorIndex)) {
      colorUsage.set(colorIndex, []);
    }
    colorUsage.get(colorIndex)!.push(key);
  });

  const duplicateAssignments = Array.from(colorUsage.entries())
    .filter(([, competitors]) => competitors.length > 1)
    .map(([colorIndex, competitors]) => ({ colorIndex, competitors }));

  return {
    totalAssignments: assignments.length,
    uniqueColorsUsed: colorUsage.size,
    availableColors: AVAILABLE_CHART_COLORS.length,
    duplicateAssignments,
    assignments,
  };
}

/**
 * Force reassign colors to eliminate duplicates
 * This should be used carefully as it will change existing color assignments
 * @param competitorKeys - Array of competitor keys to reassign colors for
 * @returns Map of old to new color assignments
 */
export function reassignColorsToEliminateDuplicates(competitorKeys: string[]): Map<string, { old: number; new: number }> {
  const changes = new Map<string, { old: number; new: number }>();
  const usedColors = new Set<number>();
  
  // Clear existing assignments for the provided keys
  competitorKeys.forEach(key => {
    if (competitorColorCache.has(key)) {
      competitorColorCache.delete(key);
    }
  });
  
  // Reassign colors sequentially to avoid conflicts
  competitorKeys.forEach((key, index) => {
    const oldColor = competitorColorCache.get(key);
    let newColorIndex = AVAILABLE_CHART_COLORS[index % AVAILABLE_CHART_COLORS.length] ?? 0;
    
    // Find next available color if this one is taken
    while (usedColors.has(newColorIndex) && usedColors.size < AVAILABLE_CHART_COLORS.length) {
      newColorIndex = AVAILABLE_CHART_COLORS[(AVAILABLE_CHART_COLORS.indexOf(newColorIndex ?? 0) + 1) % AVAILABLE_CHART_COLORS.length] ?? 0;
    }
    
    usedColors.add(newColorIndex ?? 0);
    competitorColorCache.set(key, newColorIndex ?? 0);
    
    if (oldColor !== undefined) {
      changes.set(key, { old: oldColor, new: newColorIndex });
    }
  });
  
  return changes;
}

/**
 * Validate that a competitor has a unique color assignment
 * @param competitorKey - The competitor key to check
 * @returns Object with validation results
 */
export function validateCompetitorColorAssignment(competitorKey: string): {
  isValid: boolean;
  colorIndex?: number;
  colorName?: string;
  conflicts?: string[];
} {
  if (!competitorColorCache.has(competitorKey)) {
    return { isValid: false };
  }
  
  const colorIndex = competitorColorCache.get(competitorKey)!;
  const colorName = getColorInfo(colorIndex).name;
  
  // Find other competitors using the same color
  const conflicts = Array.from(competitorColorCache.entries())
    .filter(([key, index]) => key !== competitorKey && index === colorIndex)
    .map(([key]) => key);
  
  return {
    isValid: conflicts.length === 0,
    colorIndex,
    colorName,
    conflicts: conflicts.length > 0 ? conflicts : undefined,
  };
}

/**
 * Validate all color assignments and detect conflicts
 * @returns Comprehensive validation report
 */
export function validateAllColorAssignments(): {
  isValid: boolean;
  totalCompetitors: number;
  uniqueColorsUsed: number;
  conflicts: Array<{
    colorIndex: number;
    colorName: string;
    competitors: string[];
    conflictCount: number;
  }>;
  warnings: string[];
  recommendations: string[];
} {
  const stats = getColorAssignmentStats();
  const warnings: string[] = [];
  const recommendations: string[] = [];
  
  // Check for color conflicts
  const conflicts = stats.duplicateAssignments.map(({ colorIndex, competitors }) => ({
    colorIndex,
    colorName: getColorInfo(colorIndex).name,
    competitors,
    conflictCount: competitors.length,
  }));
  
  // Generate warnings and recommendations
  if (conflicts.length > 0) {
    warnings.push(`${conflicts.length} color conflicts detected affecting ${conflicts.reduce((sum, c) => sum + c.conflictCount, 0)} competitors`);
    recommendations.push('Use reassignColorsToEliminateDuplicates() to fix conflicts');
  }
  
  if (stats.totalAssignments > AVAILABLE_CHART_COLORS.length) {
    warnings.push(`More competitors (${stats.totalAssignments}) than available colors (${AVAILABLE_CHART_COLORS.length})`);
    recommendations.push('Consider implementing pattern fallbacks for color exhaustion');
  }
  
  if (stats.uniqueColorsUsed < Math.min(stats.totalAssignments, AVAILABLE_CHART_COLORS.length)) {
    warnings.push('Not all available colors are being utilized efficiently');
    recommendations.push('Color assignment algorithm could be optimized for better distribution');
  }
  
  return {
    isValid: conflicts.length === 0,
    totalCompetitors: stats.totalAssignments,
    uniqueColorsUsed: stats.uniqueColorsUsed,
    conflicts,
    warnings,
    recommendations,
  };
}

/**
 * Debug logging utility for color assignments
 * @param context - Context string for logging
 */
export function debugLogColorAssignments(_: string = 'Color Assignment Debug'): void {
  const validation = validateAllColorAssignments();
  
  // Color validation diagnostics completed
  
  if (validation.conflicts.length > 0) {
    // Color conflicts detected
  }
  
  if (validation.warnings.length > 0) {
    // Color validation warnings found
  }
  
  if (validation.recommendations.length > 0) {
    // Color recommendations available
  }
  
  
  // End color validation logging group
}

/**
 * Auto-detect and fix color conflicts
 * @param options - Configuration options for conflict resolution  
 * @returns Results of the conflict resolution
 */
export function autoFixColorConflicts(options: {
  logResults?: boolean;
  preferStableColors?: boolean;
} = {}): {
  conflictsFound: number;
  conflictsFixed: number;
  changes: Map<string, { old: number; new: number }>;
  remainingConflicts: number;
} {
  const { logResults = false } = options;
  
  if (logResults) {
    debugLogColorAssignments('Before Auto-Fix');
  }
  
  const initialValidation = validateAllColorAssignments();
  const conflictsFound = initialValidation.conflicts.length;
  
  if (conflictsFound === 0) {
    if (logResults) {
      // No color conflicts detected
    }
    return {
      conflictsFound: 0,
      conflictsFixed: 0,
      changes: new Map(),
      remainingConflicts: 0,
    };
  }
  
  // Get all competitor keys that need reassignment
  const allCompetitorKeys = Array.from(competitorColorCache.keys());
  
  // Reassign colors to eliminate duplicates
  const changes = reassignColorsToEliminateDuplicates(allCompetitorKeys);
  
  // Validate results
  const finalValidation = validateAllColorAssignments();
  const conflictsFixed = conflictsFound - finalValidation.conflicts.length;
  
  if (logResults) {
    debugLogColorAssignments('After Auto-Fix');
    // Fixed color conflicts
  }
  
  return {
    conflictsFound,
    conflictsFixed,
    changes,
    remainingConflicts: finalValidation.conflicts.length,
  };
}

// Pattern fallback system for when colors are exhausted
export const PATTERN_FALLBACKS = [
  'solid',         // Default - no pattern
  'diagonal',      // Diagonal stripes
  'horizontal',    // Horizontal stripes  
  'vertical',      // Vertical stripes
  'dots',          // Dotted pattern
  'cross-hatch',   // Cross-hatched pattern
  'diamond',       // Diamond pattern
  'grid',          // Grid pattern
] as const;

export type PatternType = typeof PATTERN_FALLBACKS[number];

/**
 * Enhanced competitor color assignment with pattern fallbacks
 * @param competitorId - Unique identifier for the competitor
 * @param competitorName - Display name (used as fallback for hashing)
 * @param fallbackIndex - Index to use if no ID/name available
 * @returns Enhanced color assignment with pattern information
 */
export function getCompetitorColorWithPattern(
  competitorId?: string, 
  competitorName?: string, 
  fallbackIndex: number = 0
): {
  color: string;
  colorIndex: number;
  pattern: PatternType;
  patternIndex: number;
  needsPattern: boolean;
  displayName: string;
} {
  const colorIndex = getCompetitorColorIndex(competitorId, competitorName, fallbackIndex);
  const color = `hsl(var(--chart-${colorIndex}))`;
  
  // Determine if pattern is needed based on position beyond available colors
  const totalCompetitors = competitorColorCache.size;
  const needsPattern = totalCompetitors > AVAILABLE_CHART_COLORS.length;
  
  // Calculate pattern index - cycle through patterns when colors are exhausted
  const patternCycle = Math.floor(fallbackIndex / AVAILABLE_CHART_COLORS.length);
  const patternIndex = patternCycle % PATTERN_FALLBACKS.length;
  const pattern = PATTERN_FALLBACKS[patternIndex] ?? 'solid';
  
  // Create display name with pattern indicator if needed
  const baseName = competitorName || `Competitor ${fallbackIndex + 1}`;
  const displayName = needsPattern && pattern !== 'solid' 
    ? `${baseName} (${pattern})`
    : baseName;
  
  return {
    color,
    colorIndex,
    pattern,
    patternIndex,
    needsPattern,
    displayName,
  };
}

/**
 * Generate SVG pattern definitions for chart usage
 * @param colorIndex - Chart color index
 * @param pattern - Pattern type
 * @returns SVG pattern definition string
 */
export function generateSVGPattern(colorIndex: number, pattern: PatternType): string {
  const color = `hsl(var(--chart-${colorIndex}))`;
  const patternId = `pattern-${colorIndex}-${pattern}`;
  
  switch (pattern) {
    case 'diagonal':
      return `
        <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
          <rect width="8" height="8" fill="${color}" opacity="0.3"/>
          <path d="M0,8 L8,0" stroke="${color}" stroke-width="2"/>
        </pattern>
      `;
    case 'horizontal':
      return `
        <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
          <rect width="8" height="8" fill="${color}" opacity="0.3"/>
          <line x1="0" y1="4" x2="8" y2="4" stroke="${color}" stroke-width="2"/>
        </pattern>
      `;
    case 'vertical':
      return `
        <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
          <rect width="8" height="8" fill="${color}" opacity="0.3"/>
          <line x1="4" y1="0" x2="4" y2="8" stroke="${color}" stroke-width="2"/>
        </pattern>
      `;
    case 'dots':
      return `
        <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
          <rect width="8" height="8" fill="${color}" opacity="0.3"/>
          <circle cx="4" cy="4" r="1.5" fill="${color}"/>
        </pattern>
      `;
    case 'cross-hatch':
      return `
        <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
          <rect width="8" height="8" fill="${color}" opacity="0.3"/>
          <path d="M0,8 L8,0 M0,0 L8,8" stroke="${color}" stroke-width="1"/>
        </pattern>
      `;
    case 'diamond':
      return `
        <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
          <rect width="8" height="8" fill="${color}" opacity="0.3"/>
          <path d="M4,0 L8,4 L4,8 L0,4 Z" stroke="${color}" stroke-width="1" fill="none"/>
        </pattern>
      `;
    case 'grid':
      return `
        <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
          <rect width="8" height="8" fill="${color}" opacity="0.3"/>
          <path d="M0,0 L0,8 M0,0 L8,0" stroke="${color}" stroke-width="1"/>
        </pattern>
      `;
    case 'solid':
    default:
      return ''; // No pattern needed for solid colors
  }
}

/**
 * Get CSS/SVG fill value with pattern support
 * @param competitorId - Unique identifier for the competitor
 * @param competitorName - Display name
 * @param fallbackIndex - Fallback index
 * @returns CSS fill value (color or pattern reference)
 */
export function getCompetitorFill(
  competitorId?: string, 
  competitorName?: string, 
  fallbackIndex: number = 0
): string {
  const colorAssignment = getCompetitorColorWithPattern(competitorId, competitorName, fallbackIndex);
  
  if (colorAssignment.needsPattern && colorAssignment.pattern !== 'solid') {
    return `url(#pattern-${colorAssignment.colorIndex}-${colorAssignment.pattern})`;
  }
  
  return colorAssignment.color;
}

/**
 * Generate all required SVG pattern definitions for current competitors
 * @returns SVG defs string containing all pattern definitions
 */
export function generateAllRequiredPatterns(): string {
  const assignments = Array.from(competitorColorCache.entries());
  const patterns: string[] = [];
  
  assignments.forEach(([key, colorIndex], index) => {
    const patternAssignment = getCompetitorColorWithPattern(undefined, key, index);
    if (patternAssignment.needsPattern && patternAssignment.pattern !== 'solid') {
      patterns.push(generateSVGPattern(colorIndex, patternAssignment.pattern));
    }
  });
  
  if (patterns.length === 0) return '';
  
  return `<defs>${patterns.join('')}</defs>`;
}