import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function convertToPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}`;
}

export function capitalizeFirstLetters(str: string): string {
  if (!str) return "";
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

// Add `https://` if it doesn't exist with security validation
export function addProtocol(domain: string): string {
  if (!domain || typeof domain !== 'string') {
    throw new Error('Domain must be a non-empty string');
  }
  
  // Security: Sanitize input to prevent injection attacks
  const sanitizedDomain = domain.trim().replace(/[<>'"]/g, '');
  
  // Security: Validate domain format
  try {
    // Remove protocol if present for validation
    const withoutProtocol = sanitizedDomain.replace(/^https?:\/\//, '');
    
    // Extract domain part and path/query part
    const urlParts = withoutProtocol.split('/');
    const domainPart = urlParts[0];
    const pathPart = urlParts.length > 1 ? '/' + urlParts.slice(1).join('/') : '';
    
    // Basic domain validation - allow domain with optional port and paths
    // Domain must have at least one dot, valid TLD (2+ characters), and no consecutive dots
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])*(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])*)+(:[0-9]+)?$/.test(domainPart)) {
      throw new Error('Invalid domain format');
    }
    
    // Check for suspicious patterns in the entire URL
    if (withoutProtocol.includes('javascript:') || withoutProtocol.includes('data:') || withoutProtocol.includes('vbscript:')) {
      throw new Error('Potentially malicious URL detected');
    }
    
    // Reconstruct the full URL
    const fullUrl = domainPart + pathPart;
    
    if (!sanitizedDomain.includes("https://")) {
      return "https://" + fullUrl;
    }
    return sanitizedDomain;
  } catch (error) {
    throw new Error(`Invalid domain: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Deduplicate array of objects by a specific key field
export function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

// Security: Sanitize HTML content to prevent XSS
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  
  // Remove script tags and event handlers
  return html
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/data:text\/html/gi, '');
}

// Security: Validate email format
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

// Security: Sanitize user input for safe display
export function sanitizeUserInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>'"&]/g, (char) => {
      const entities: { [key: string]: string } = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return entities[char] || char;
    })
    .slice(0, 1000); // Limit input length
}
