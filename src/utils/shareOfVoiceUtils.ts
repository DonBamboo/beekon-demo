/**
 * Shared utilities for Share of Voice calculations
 * Ensures consistency between time series charts and pie charts
 */

export interface ShareOfVoiceItem {
  competitorId: string;
  competitorName: string;
  shareOfVoice: number;
  totalMentions: number;
  totalAnalyses: number;
}

export interface TimeSeriesCompetitor {
  competitorId: string;
  name: string;
  shareOfVoice: number;
  mentionCount: number;
  averageRank: number;
  sentimentScore: number;
}

/**
 * Normalize share of voice values to ensure they total exactly 100%
 * Uses proportional scaling to maintain relative relationships
 */
export function normalizeShareOfVoice<T extends { shareOfVoice: number }>(
  items: T[]
): T[] {
  // Calculate the total of all raw share of voice values
  const rawTotal = items.reduce((sum, item) => sum + item.shareOfVoice, 0);

  // If total is 0, return all zeros
  if (rawTotal === 0) {
    return items.map((item) => ({
      ...item,
      shareOfVoice: 0,
    }));
  }

  // If total is already very close to 100, return as-is
  if (Math.abs(rawTotal - 100) < 0.01) {
    return items;
  }

  // Apply proportional scaling to make total = 100%
  const normalizationFactor = 100 / rawTotal;

  const normalizedItems = items.map((item) => {
    const normalizedShareOfVoice = item.shareOfVoice * normalizationFactor;

    return {
      ...item,
      shareOfVoice: Math.round(normalizedShareOfVoice * 100) / 100, // Round to 2 decimal places
    };
  });

  // Verify the total (optional validation)
  const finalTotal = normalizedItems.reduce(
    (sum, item) => sum + item.shareOfVoice,
    0
  );

  if (process.env.NODE_ENV === "development") {
    console.log("🎯 Share of Voice normalization:", {
      originalTotal: rawTotal.toFixed(2) + "%",
      finalTotal: finalTotal.toFixed(2) + "%",
      itemCount: items.length,
      accuracy: Math.abs(finalTotal - 100) < 0.1 ? "✅ Accurate" : "⚠️ Slight variance",
    });
  }

  return normalizedItems;
}

/**
 * Calculate share of voice from mention data
 * Uses positive mentions as the basis for share calculation
 */
export function calculateShareOfVoice(
  positiveMentions: number,
  totalPositiveMentionsAcrossAllBrands: number
): number {
  if (totalPositiveMentionsAcrossAllBrands === 0) {
    return 0;
  }

  return (positiveMentions / totalPositiveMentionsAcrossAllBrands) * 100;
}

/**
 * Calculate time series share of voice for a specific date
 * Ensures all competitors for that date sum to 100%
 */
export function calculateTimeSeriesShareOfVoice(
  competitors: TimeSeriesCompetitor[]
): TimeSeriesCompetitor[] {
  // Calculate total positive mentions for this date across all brands
  const totalPositiveMentions = competitors.reduce(
    (sum, comp) => sum + comp.mentionCount,
    0
  );

  // Calculate raw share of voice for each competitor
  const competitorsWithRawShare = competitors.map((comp) => ({
    ...comp,
    shareOfVoice: calculateShareOfVoice(comp.mentionCount, totalPositiveMentions),
  }));

  // Apply normalization to ensure total = 100%
  return normalizeShareOfVoice(competitorsWithRawShare);
}

/**
 * Validate that share of voice data totals to 100% (with small tolerance)
 */
export function validateShareOfVoiceTotal(
  items: { shareOfVoice: number }[],
  tolerance: number = 0.1
): { isValid: boolean; total: number; variance: number } {
  const total = items.reduce((sum, item) => sum + item.shareOfVoice, 0);
  const variance = Math.abs(total - 100);
  const isValid = variance <= tolerance;

  return {
    isValid,
    total: Math.round(total * 100) / 100,
    variance: Math.round(variance * 100) / 100,
  };
}