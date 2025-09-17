/**
 * Chart Data Validation Utilities
 * Provides comprehensive validation for chart data to prevent NaN, Infinity, and other invalid values
 * from reaching Recharts components and causing DecimalError exceptions.
 */

/**
 * Safely validates and sanitizes a numeric value for chart usage
 * @param value - The value to validate
 * @param fallback - Fallback value if validation fails (default: 0)
 * @returns A valid finite number safe for use in charts
 */
export function sanitizeChartNumber(value: unknown, fallback: number = 0): number {
  // Convert to number if it's not already
  const numValue = typeof value === 'number' ? value : Number(value);

  // Check if it's a valid, finite number
  if (typeof numValue === 'number' && !isNaN(numValue) && isFinite(numValue)) {
    return numValue;
  }

  // Log warning for debugging (can be removed in production)
  if (process.env.NODE_ENV !== 'production' && value !== undefined && value !== null) {
    console.warn('⚠️ Chart data sanitization: Invalid numeric value detected', { value, fallback });
  }

  return fallback;
}

/**
 * Sanitizes chart data object by validating all numeric properties
 * @param data - Chart data object
 * @param numericKeys - Array of keys that should contain numeric values
 * @returns Sanitized data object safe for chart consumption
 */
export function sanitizeChartDataObject<T extends Record<string, unknown>>(
  data: T,
  numericKeys: (keyof T)[]
): T {
  const sanitized = { ...data };

  numericKeys.forEach(key => {
    if (key in sanitized) {
      sanitized[key] = sanitizeChartNumber(sanitized[key]) as T[keyof T];
    }
  });

  return sanitized;
}

/**
 * Sanitizes an array of chart data objects
 * @param dataArray - Array of chart data objects
 * @param numericKeys - Array of keys that should contain numeric values
 * @returns Sanitized array safe for chart consumption
 */
export function sanitizeChartDataArray<T extends Record<string, unknown>>(
  dataArray: T[],
  numericKeys: (keyof T)[]
): T[] {
  return dataArray.map(item => sanitizeChartDataObject(item, numericKeys));
}

/**
 * Validates chart data for common issues that cause Recharts errors
 * @param data - Chart data to validate
 * @param dataKeys - Keys that should contain numeric chart data
 * @returns Validation result with sanitized data
 */
export function validateAndSanitizeChartData<T extends Record<string, unknown>>(
  data: T[],
  dataKeys: (keyof T)[]
): {
  data: T[];
  hasIssues: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  let hasIssues = false;

  // Check for empty data - but don't treat empty arrays as issues
  if (!Array.isArray(data)) {
    issues.push('Chart data is not an array');
    return { data: [], hasIssues: true, issues };
  }

  // Empty arrays are valid - return early without issues
  if (data.length === 0) {
    return { data: [], hasIssues: false, issues: [] };
  }

  // Sanitize each data point
  const sanitizedData = data.map((item, index) => {
    const sanitized = { ...item };

    dataKeys.forEach(key => {
      const originalValue = sanitized[key];
      const sanitizedValue = sanitizeChartNumber(originalValue);

      if (originalValue !== sanitizedValue) {
        hasIssues = true;
        issues.push(`Invalid value at index ${index}, key "${String(key)}": ${originalValue} → ${sanitizedValue}`);
      }

      sanitized[key] = sanitizedValue as T[keyof T];
    });

    return sanitized;
  });

  return {
    data: sanitizedData,
    hasIssues,
    issues
  };
}

/**
 * Specific sanitization for competitor performance data
 * Common data structure used across multiple chart components
 */
export function sanitizeCompetitorData(data: Array<{
  score?: number;
  yourBrandScore?: number;
  shareOfVoice?: number;
  averageRank?: number;
  mentionCount?: number;
  sentimentScore?: number;
  visibility?: number;
  [key: string]: unknown;
}>): typeof data {
  const numericKeys = [
    'score', 'yourBrandScore', 'shareOfVoice', 'averageRank',
    'mentionCount', 'sentimentScore', 'visibility'
  ];

  return sanitizeChartDataArray(data, numericKeys);
}

/**
 * Sanitizes sentiment score calculation specifically
 * Handles the common pattern: (score + 1) * 50
 */
export function sanitizeSentimentScore(rawScore: unknown): number {
  const baseScore = sanitizeChartNumber(rawScore, 0);

  // Apply sentiment transformation safely
  const transformedScore = (baseScore + 1) * 50;

  // Ensure result is valid and within reasonable bounds (0-100)
  return sanitizeChartNumber(Math.max(0, Math.min(100, transformedScore)), 50);
}