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

/**
 * Validates that an array contains the expected "Your Brand" entry
 * @param data - Array of chart data items
 * @param brandKey - Key that should identify the brand (default: "name")
 * @param brandValue - Expected brand value (default: "Your Brand")
 * @returns Validation result with detailed information
 */
export function validateBrandDataPresence<T extends Record<string, unknown>>(
  data: T[],
  brandKey: keyof T = 'name',
  brandValue: unknown = 'Your Brand'
): {
  hasBrandData: boolean;
  brandItem?: T;
  issues: string[];
  dataStructure: {
    totalItems: number;
    itemsWithBrandKey: number;
    uniqueValues: unknown[];
  };
} {
  const issues: string[] = [];

  if (!Array.isArray(data)) {
    issues.push('Data is not an array');
    return {
      hasBrandData: false,
      issues,
      dataStructure: { totalItems: 0, itemsWithBrandKey: 0, uniqueValues: [] }
    };
  }

  const itemsWithBrandKey = data.filter(item => brandKey in item);
  const uniqueValues = [...new Set(data.map(item => item[brandKey]))];
  const brandItem = data.find(item => item[brandKey] === brandValue);

  if (!brandItem) {
    issues.push(`No item found with ${String(brandKey)} = "${brandValue}"`);
  }

  if (itemsWithBrandKey.length !== data.length) {
    issues.push(`${data.length - itemsWithBrandKey.length} items missing ${String(brandKey)} property`);
  }

  return {
    hasBrandData: !!brandItem,
    brandItem,
    issues,
    dataStructure: {
      totalItems: data.length,
      itemsWithBrandKey: itemsWithBrandKey.length,
      uniqueValues
    }
  };
}

/**
 * Validates that chart data doesn't contain obvious data quality issues
 * @param data - Chart data to validate
 * @param numericKeys - Keys that should contain numeric values
 * @returns Comprehensive validation report
 */
export function validateChartDataQuality<T extends Record<string, unknown>>(
  data: T[],
  numericKeys: (keyof T)[]
): {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  statistics: {
    totalItems: number;
    validItems: number;
    numericFieldStats: Record<string, {
      validCount: number;
      invalidCount: number;
      range: { min: number; max: number } | null;
      hasNegatives: boolean;
      hasZeros: number;
    }>;
  };
} {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(data)) {
    return {
      isValid: false,
      issues: ['Data is not an array'],
      warnings: [],
      statistics: {
        totalItems: 0,
        validItems: 0,
        numericFieldStats: {}
      }
    };
  }

  const numericFieldStats: Record<string, {
    validCount: number;
    invalidCount: number;
    range: { min: number; max: number } | null;
    hasNegatives: boolean;
    hasZeros: number;
  }> = {};
  let validItems = 0;

  // Analyze each numeric field
  numericKeys.forEach(key => {
    const values = data.map(item => item[key]).filter(val =>
      typeof val === 'number' && !isNaN(val) && isFinite(val)
    ) as number[];

    const invalidCount = data.length - values.length;
    const hasNegatives = values.some(val => val < 0);
    const hasZeros = values.filter(val => val === 0).length;

    let range: { min: number; max: number } | null = null;
    if (values.length > 0) {
      range = {
        min: Math.min(...values),
        max: Math.max(...values)
      };
    }

    numericFieldStats[String(key)] = {
      validCount: values.length,
      invalidCount,
      range,
      hasNegatives,
      hasZeros
    };

    if (invalidCount > 0) {
      issues.push(`${invalidCount} items have invalid ${String(key)} values`);
    }

    // Add warnings for unusual patterns
    if (hasNegatives && String(key).includes('share')) {
      warnings.push(`Negative values found in ${String(key)} (unusual for share metrics)`);
    }

    if (hasZeros / values.length > 0.5) {
      warnings.push(`More than 50% of ${String(key)} values are zero`);
    }
  });

  // Count items that have all required numeric fields valid
  validItems = data.filter(item =>
    numericKeys.every(key => {
      const val = item[key];
      return typeof val === 'number' && !isNaN(val) && isFinite(val);
    })
  ).length;

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    statistics: {
      totalItems: data.length,
      validItems,
      numericFieldStats
    }
  };
}

/**
 * Validates percentage-based data to ensure totals are reasonable
 * @param data - Array of items with percentage values
 * @param percentageKey - Key containing percentage values
 * @param tolerance - Acceptable deviation from 100% (default: 5%)
 * @returns Validation result for percentage totals
 */
export function validatePercentageTotal<T extends Record<string, unknown>>(
  data: T[],
  percentageKey: keyof T,
  tolerance: number = 5
): {
  isValid: boolean;
  total: number;
  deviation: number;
  issues: string[];
  breakdown: Array<{ item: T; value: number; isValid: boolean }>;
} {
  const issues: string[] = [];
  const breakdown: Array<{ item: T; value: number; isValid: boolean }> = [];

  if (!Array.isArray(data) || data.length === 0) {
    return {
      isValid: false,
      total: 0,
      deviation: 0,
      issues: ['No data provided'],
      breakdown: []
    };
  }

  let total = 0;

  data.forEach(item => {
    const value = sanitizeChartNumber(item[percentageKey], 0);
    const isValid = value >= 0 && value <= 100;

    breakdown.push({ item, value, isValid });

    if (!isValid) {
      issues.push(`Invalid percentage value: ${value} (should be 0-100)`);
    }

    total += value;
  });

  const deviation = Math.abs(total - 100);

  if (deviation > tolerance) {
    issues.push(`Total percentage ${total.toFixed(1)}% deviates from 100% by ${deviation.toFixed(1)}%`);
  }

  return {
    isValid: issues.length === 0,
    total,
    deviation,
    issues,
    breakdown
  };
}

/**
 * Enhanced validation specifically for ShareOfVoice chart data
 * @param data - ShareOfVoice chart data
 * @returns Comprehensive validation report
 */
export function validateShareOfVoiceData(
  data: Array<{
    name?: unknown;
    value?: unknown;
    shareOfVoice?: unknown;
    totalMentions?: unknown;
    [key: string]: unknown;
  }>
): {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  hasBrandData: boolean;
  dataQuality: ReturnType<typeof validateChartDataQuality>;
  percentageValidation: ReturnType<typeof validatePercentageTotal>;
} {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Check for brand data presence
  const brandValidation = validateBrandDataPresence(data, 'name', 'Your Brand');
  if (!brandValidation.hasBrandData) {
    issues.push('Your Brand data is missing from ShareOfVoice data');
  }

  // Validate overall data quality
  const dataQuality = validateChartDataQuality(data, ['value', 'shareOfVoice', 'totalMentions']);

  // Validate percentage totals (using 'value' field which should contain the chart percentages)
  const percentageValidation = validatePercentageTotal(data, 'value', 10); // Allow 10% tolerance for ShareOfVoice

  // Check for data consistency between value and shareOfVoice fields
  data.forEach((item, index) => {
    const value = sanitizeChartNumber(item.value);
    const shareOfVoice = sanitizeChartNumber(item.shareOfVoice);

    if (Math.abs(value - shareOfVoice) > 1) { // Allow 1% difference for rounding
      warnings.push(`Item ${index} (${item.name}): value (${value}) differs from shareOfVoice (${shareOfVoice})`);
    }
  });

  return {
    isValid: issues.length === 0 && dataQuality.isValid && percentageValidation.isValid,
    issues: [...issues, ...dataQuality.issues, ...percentageValidation.issues],
    warnings: [...warnings, ...dataQuality.warnings],
    hasBrandData: brandValidation.hasBrandData,
    dataQuality,
    percentageValidation
  };
}