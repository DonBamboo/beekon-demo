/**
 * Security utilities for input validation, sanitization, and protection
 */

// Rate limiting storage (in-memory for client-side basic protection)
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();

/**
 * Basic client-side rate limiting
 * @param key - Unique identifier (e.g., user ID, IP, action type)
 * @param limit - Maximum attempts allowed
 * @param windowMs - Time window in milliseconds
 * @returns true if within limit, false if exceeded
 */
export function checkRateLimit(key: string, limit: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record) {
    rateLimitMap.set(key, { count: 1, lastReset: now });
    return true;
  }

  // Reset if window has passed
  if (now - record.lastReset >= windowMs) {
    rateLimitMap.set(key, { count: 1, lastReset: now });
    return true;
  }

  // Check if within limit
  if (record.count >= limit) {
    return false;
  }

  // Increment count
  record.count++;
  return true;
}

/**
 * Validate API endpoint format
 */
export function validateApiEndpoint(endpoint: string): boolean {
  if (!endpoint || typeof endpoint !== 'string') return false;
  
  // Allow only alphanumeric, hyphens, underscores, and forward slashes
  const validPattern = /^[a-zA-Z0-9\-_/]+$/;
  return validPattern.test(endpoint) && endpoint.length <= 200;
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') return false;
  
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(uuid);
}

/**
 * Validate integer within range
 */
export function isValidInteger(value: unknown, min?: number, max?: number): boolean {
  if (typeof value !== 'number' || !Number.isInteger(value)) return false;
  
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  
  return true;
}

/**
 * Validate string length and content
 */
export function isValidString(
  value: unknown, 
  minLength?: number, 
  maxLength?: number, 
  allowedCharsPattern?: RegExp
): boolean {
  if (typeof value !== 'string') return false;
  
  if (minLength !== undefined && value.length < minLength) return false;
  if (maxLength !== undefined && value.length > maxLength) return false;
  
  if (allowedCharsPattern && !allowedCharsPattern.test(value)) return false;
  
  return true;
}

/**
 * Sanitize file name to prevent directory traversal
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') return '';
  
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid file name characters
    .replace(/\.\./g, '_') // Prevent directory traversal
    .replace(/^\.+/, '') // Remove leading dots
    .slice(0, 255); // Limit length
}

/**
 * Validate JSON structure safely
 */
export function isValidJSON(jsonString: string): boolean {
  if (!jsonString || typeof jsonString !== 'string') return false;
  
  try {
    const parsed = JSON.parse(jsonString);
    return parsed !== null && typeof parsed === 'object';
  } catch {
    return false;
  }
}

/**
 * Create a Content Security Policy nonce
 */
export function generateCSPNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode.apply(null, Array.from(array)));
}

/**
 * Check for potentially malicious patterns in user input
 */
export function containsMaliciousPatterns(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  
  const maliciousPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi,
    /data:text\/html/gi,
    /\\x[0-9a-f]{2}/gi, // Hex-encoded characters
    /%[0-9a-f]{2}/gi, // URL-encoded characters that might be suspicious
  ];
  
  return maliciousPatterns.some(pattern => pattern.test(input));
}

/**
 * Secure random token generation
 */
export function generateSecureToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate environment variable names (for client-side env var checking)
 */
export function isValidEnvVarName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  
  // Environment variables should start with VITE_ for Vite exposure
  const envPattern = /^VITE_[A-Z_][A-Z0-9_]*$/;
  return envPattern.test(name);
}