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
