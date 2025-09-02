/**
 * CountryService - Service layer for country data management
 * 
 * Provides caching, validation, and data access for country information
 * used in website country assignment functionality.
 */

import {
  Country,
  getAllCountries,
  getPopularCountries,
  getCountryByCode,
  getCountryByName,
  searchCountries,
  isValidCountryCode,
  getUniqueRegions,
  getCountriesByRegion,
} from "@/lib/countries";

export interface CountryServiceError {
  code: string;
  message: string;
  details?: unknown;
}

export interface CountrySearchOptions {
  limit?: number;
  region?: string;
  popularFirst?: boolean;
}

export interface CountryValidationResult {
  isValid: boolean;
  country?: Country;
  error?: CountryServiceError;
}

export class CountryService {
  private static instance: CountryService;
  private cache: Map<string, Country[] | string[]> = new Map();
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  public static getInstance(): CountryService {
    if (!CountryService.instance) {
      CountryService.instance = new CountryService();
    }
    return CountryService.instance;
  }

  /**
   * Get all countries with optional caching
   */
  getAllCountries(): Country[] {
    const cacheKey = "all_countries";
    
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey) as Country[] || [];
    }

    const countries = getAllCountries();
    this.updateCache(cacheKey, countries);
    return countries;
  }

  /**
   * Get popular countries (shown first in dropdowns)
   */
  getPopularCountries(): Country[] {
    const cacheKey = "popular_countries";
    
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey) as Country[] || [];
    }

    const countries = getPopularCountries();
    this.updateCache(cacheKey, countries);
    return countries;
  }

  /**
   * Search countries by query string
   */
  searchCountries(query: string, options: CountrySearchOptions = {}): Country[] {
    const { limit = 50, region, popularFirst = true } = options;
    
    if (!query?.trim()) {
      return popularFirst ? this.getPopularCountries() : this.getAllCountries();
    }

    const cacheKey = `search_${query.toLowerCase()}_${region || 'all'}_${popularFirst}`;
    
    if (this.isCacheValid(cacheKey)) {
      const cached = this.cache.get(cacheKey) as Country[] || [];
      return cached.slice(0, limit);
    }

    let results = searchCountries(query);
    
    // Filter by region if specified
    if (region) {
      results = results.filter(country => country.region === region);
    }

    // Sort: popular countries first, then alphabetical
    if (popularFirst) {
      results.sort((a, b) => {
        if (a.popular && !b.popular) return -1;
        if (!a.popular && b.popular) return 1;
        return a.name.localeCompare(b.name);
      });
    } else {
      results.sort((a, b) => a.name.localeCompare(b.name));
    }

    this.updateCache(cacheKey, results);
    return results.slice(0, limit);
  }

  /**
   * Get country by ISO code
   */
  getCountryByCode(code: string): Country | null {
    if (!code?.trim()) return null;
    
    const country = getCountryByCode(code.toUpperCase());
    return country || null;
  }

  /**
   * Get country by name
   */
  getCountryByName(name: string): Country | null {
    if (!name?.trim()) return null;
    
    const country = getCountryByName(name);
    return country || null;
  }

  /**
   * Validate country code and return validation result
   */
  validateCountryCode(code: string): CountryValidationResult {
    if (!code?.trim()) {
      return {
        isValid: false,
        error: {
          code: "EMPTY_CODE",
          message: "Country code cannot be empty",
        },
      };
    }

    const trimmedCode = code.trim().toUpperCase();
    
    if (trimmedCode.length !== 3) {
      return {
        isValid: false,
        error: {
          code: "INVALID_LENGTH",
          message: "Country code must be exactly 3 characters (ISO 3166-1 alpha-3)",
          details: { provided: trimmedCode, length: trimmedCode.length },
        },
      };
    }

    if (!isValidCountryCode(trimmedCode)) {
      return {
        isValid: false,
        error: {
          code: "INVALID_CODE",
          message: `"${trimmedCode}" is not a valid ISO 3166-1 alpha-3 country code`,
          details: { provided: trimmedCode },
        },
      };
    }

    const country = getCountryByCode(trimmedCode);
    return {
      isValid: true,
      country: country || undefined,
    };
  }

  /**
   * Get all available regions
   */
  getRegions(): string[] {
    const cacheKey = "regions";
    
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey) as string[] || [];
    }

    const regions = getUniqueRegions();
    this.cache.set(cacheKey, regions);
    return regions;
  }

  /**
   * Get countries by region
   */
  getCountriesByRegion(region: string): Country[] {
    if (!region?.trim()) return [];
    
    const cacheKey = `region_${region.toLowerCase()}`;
    
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey) as Country[] || [];
    }

    const countries = getCountriesByRegion(region);
    this.updateCache(cacheKey, countries);
    return countries;
  }

  /**
   * Get country statistics
   */
  getStatistics(): {
    totalCountries: number;
    popularCountries: number;
    regions: number;
    countriesByRegion: Record<string, number>;
  } {
    const all = this.getAllCountries();
    const popular = this.getPopularCountries();
    const regions = this.getRegions();
    
    const countriesByRegion: Record<string, number> = {};
    regions.forEach(region => {
      countriesByRegion[region] = this.getCountriesByRegion(region).length;
    });

    return {
      totalCountries: all.length,
      popularCountries: popular.length,
      regions: regions.length,
      countriesByRegion,
    };
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    this.lastCacheUpdate = 0;
  }

  /**
   * Preload popular countries for better performance
   */
  async preloadPopularCountries(): Promise<void> {
    // Since we're using static data, this just ensures the cache is populated
    this.getPopularCountries();
  }

  // Private helper methods
  private isCacheValid(key: string): boolean {
    if (!this.cache.has(key)) return false;
    
    const now = Date.now();
    return (now - this.lastCacheUpdate) < this.CACHE_TTL;
  }

  private updateCache(key: string, data: Country[] | string[]): void {
    this.cache.set(key, data);
    this.lastCacheUpdate = Date.now();
  }
}

// Export singleton instance
export const countryService = CountryService.getInstance();