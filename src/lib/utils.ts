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

// Add `https://` if it doesn't exists
export function addProtocol(domain: string): string {
  if (!domain.includes("https://")) return "https://" + domain;
  return domain;
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
