/**
 * Country data and utilities for website country assignment
 */

export interface Country {
  code: string; // ISO 3166-1 alpha-3 code (e.g., "USA")
  name: string; // Full country name
  flag: string; // Unicode flag emoji
  region: string; // Geographic region
  popular?: boolean; // Mark popular countries for top of list
}

// Comprehensive country list with popular countries marked
export const COUNTRIES: Country[] = [
  // Popular countries (shown first in dropdowns)
  { code: "USA", name: "United States", flag: "🇺🇸", region: "North America", popular: true },
  { code: "GBR", name: "United Kingdom", flag: "🇬🇧", region: "Europe", popular: true },
  { code: "CAN", name: "Canada", flag: "🇨🇦", region: "North America", popular: true },
  { code: "AUS", name: "Australia", flag: "🇦🇺", region: "Oceania", popular: true },
  { code: "DEU", name: "Germany", flag: "🇩🇪", region: "Europe", popular: true },
  { code: "FRA", name: "France", flag: "🇫🇷", region: "Europe", popular: true },
  { code: "JPN", name: "Japan", flag: "🇯🇵", region: "Asia", popular: true },
  { code: "IND", name: "India", flag: "🇮🇳", region: "Asia", popular: true },
  { code: "CHN", name: "China", flag: "🇨🇳", region: "Asia", popular: true },
  { code: "BRA", name: "Brazil", flag: "🇧🇷", region: "South America", popular: true },

  // All other countries (alphabetical)
  { code: "AFG", name: "Afghanistan", flag: "🇦🇫", region: "Asia" },
  { code: "ALB", name: "Albania", flag: "🇦🇱", region: "Europe" },
  { code: "DZA", name: "Algeria", flag: "🇩🇿", region: "Africa" },
  { code: "AND", name: "Andorra", flag: "🇦🇩", region: "Europe" },
  { code: "AGO", name: "Angola", flag: "🇦🇴", region: "Africa" },
  { code: "ARG", name: "Argentina", flag: "🇦🇷", region: "South America" },
  { code: "ARM", name: "Armenia", flag: "🇦🇲", region: "Asia" },
  { code: "AUT", name: "Austria", flag: "🇦🇹", region: "Europe" },
  { code: "AZE", name: "Azerbaijan", flag: "🇦🇿", region: "Asia" },
  { code: "BHR", name: "Bahrain", flag: "🇧🇭", region: "Asia" },
  { code: "BGD", name: "Bangladesh", flag: "🇧🇩", region: "Asia" },
  { code: "BLR", name: "Belarus", flag: "🇧🇾", region: "Europe" },
  { code: "BEL", name: "Belgium", flag: "🇧🇪", region: "Europe" },
  { code: "BTN", name: "Bhutan", flag: "🇧🇹", region: "Asia" },
  { code: "BOL", name: "Bolivia", flag: "🇧🇴", region: "South America" },
  { code: "BIH", name: "Bosnia and Herzegovina", flag: "🇧🇦", region: "Europe" },
  { code: "BWA", name: "Botswana", flag: "🇧🇼", region: "Africa" },
  { code: "BGR", name: "Bulgaria", flag: "🇧🇬", region: "Europe" },
  { code: "KHM", name: "Cambodia", flag: "🇰🇭", region: "Asia" },
  { code: "CHL", name: "Chile", flag: "🇨🇱", region: "South America" },
  { code: "COL", name: "Colombia", flag: "🇨🇴", region: "South America" },
  { code: "HRV", name: "Croatia", flag: "🇭🇷", region: "Europe" },
  { code: "CYP", name: "Cyprus", flag: "🇨🇾", region: "Europe" },
  { code: "CZE", name: "Czech Republic", flag: "🇨🇿", region: "Europe" },
  { code: "DNK", name: "Denmark", flag: "🇩🇰", region: "Europe" },
  { code: "ECU", name: "Ecuador", flag: "🇪🇨", region: "South America" },
  { code: "EGY", name: "Egypt", flag: "🇪🇬", region: "Africa" },
  { code: "EST", name: "Estonia", flag: "🇪🇪", region: "Europe" },
  { code: "ETH", name: "Ethiopia", flag: "🇪🇹", region: "Africa" },
  { code: "FIN", name: "Finland", flag: "🇫🇮", region: "Europe" },
  { code: "GEO", name: "Georgia", flag: "🇬🇪", region: "Asia" },
  { code: "GHA", name: "Ghana", flag: "🇬🇭", region: "Africa" },
  { code: "GRC", name: "Greece", flag: "🇬🇷", region: "Europe" },
  { code: "HUN", name: "Hungary", flag: "🇭🇺", region: "Europe" },
  { code: "ISL", name: "Iceland", flag: "🇮🇸", region: "Europe" },
  { code: "IDN", name: "Indonesia", flag: "🇮🇩", region: "Asia" },
  { code: "IRN", name: "Iran", flag: "🇮🇷", region: "Asia" },
  { code: "IRQ", name: "Iraq", flag: "🇮🇶", region: "Asia" },
  { code: "IRL", name: "Ireland", flag: "🇮🇪", region: "Europe" },
  { code: "ISR", name: "Israel", flag: "🇮🇱", region: "Asia" },
  { code: "ITA", name: "Italy", flag: "🇮🇹", region: "Europe" },
  { code: "JAM", name: "Jamaica", flag: "🇯🇲", region: "North America" },
  { code: "JOR", name: "Jordan", flag: "🇯🇴", region: "Asia" },
  { code: "KAZ", name: "Kazakhstan", flag: "🇰🇿", region: "Asia" },
  { code: "KEN", name: "Kenya", flag: "🇰🇪", region: "Africa" },
  { code: "KOR", name: "South Korea", flag: "🇰🇷", region: "Asia" },
  { code: "KWT", name: "Kuwait", flag: "🇰🇼", region: "Asia" },
  { code: "LVA", name: "Latvia", flag: "🇱🇻", region: "Europe" },
  { code: "LBN", name: "Lebanon", flag: "🇱🇧", region: "Asia" },
  { code: "LTU", name: "Lithuania", flag: "🇱🇹", region: "Europe" },
  { code: "LUX", name: "Luxembourg", flag: "🇱🇺", region: "Europe" },
  { code: "MYS", name: "Malaysia", flag: "🇲🇾", region: "Asia" },
  { code: "MDV", name: "Maldives", flag: "🇲🇻", region: "Asia" },
  { code: "MLT", name: "Malta", flag: "🇲🇹", region: "Europe" },
  { code: "MEX", name: "Mexico", flag: "🇲🇽", region: "North America" },
  { code: "MDA", name: "Moldova", flag: "🇲🇩", region: "Europe" },
  { code: "MNG", name: "Mongolia", flag: "🇲🇳", region: "Asia" },
  { code: "MNE", name: "Montenegro", flag: "🇲🇪", region: "Europe" },
  { code: "MAR", name: "Morocco", flag: "🇲🇦", region: "Africa" },
  { code: "NPL", name: "Nepal", flag: "🇳🇵", region: "Asia" },
  { code: "NLD", name: "Netherlands", flag: "🇳🇱", region: "Europe" },
  { code: "NZL", name: "New Zealand", flag: "🇳🇿", region: "Oceania" },
  { code: "NGA", name: "Nigeria", flag: "🇳🇬", region: "Africa" },
  { code: "MKD", name: "North Macedonia", flag: "🇲🇰", region: "Europe" },
  { code: "NOR", name: "Norway", flag: "🇳🇴", region: "Europe" },
  { code: "OMN", name: "Oman", flag: "🇴🇲", region: "Asia" },
  { code: "PAK", name: "Pakistan", flag: "🇵🇰", region: "Asia" },
  { code: "PER", name: "Peru", flag: "🇵🇪", region: "South America" },
  { code: "PHL", name: "Philippines", flag: "🇵🇭", region: "Asia" },
  { code: "POL", name: "Poland", flag: "🇵🇱", region: "Europe" },
  { code: "PRT", name: "Portugal", flag: "🇵🇹", region: "Europe" },
  { code: "QAT", name: "Qatar", flag: "🇶🇦", region: "Asia" },
  { code: "ROU", name: "Romania", flag: "🇷🇴", region: "Europe" },
  { code: "RUS", name: "Russia", flag: "🇷🇺", region: "Europe" },
  { code: "SAU", name: "Saudi Arabia", flag: "🇸🇦", region: "Asia" },
  { code: "SRB", name: "Serbia", flag: "🇷🇸", region: "Europe" },
  { code: "SGP", name: "Singapore", flag: "🇸🇬", region: "Asia" },
  { code: "SVK", name: "Slovakia", flag: "🇸🇰", region: "Europe" },
  { code: "SVN", name: "Slovenia", flag: "🇸🇮", region: "Europe" },
  { code: "ZAF", name: "South Africa", flag: "🇿🇦", region: "Africa" },
  { code: "ESP", name: "Spain", flag: "🇪🇸", region: "Europe" },
  { code: "LKA", name: "Sri Lanka", flag: "🇱🇰", region: "Asia" },
  { code: "SWE", name: "Sweden", flag: "🇸🇪", region: "Europe" },
  { code: "CHE", name: "Switzerland", flag: "🇨🇭", region: "Europe" },
  { code: "TWN", name: "Taiwan", flag: "🇹🇼", region: "Asia" },
  { code: "THA", name: "Thailand", flag: "🇹🇭", region: "Asia" },
  { code: "TUR", name: "Turkey", flag: "🇹🇷", region: "Asia" },
  { code: "UKR", name: "Ukraine", flag: "🇺🇦", region: "Europe" },
  { code: "ARE", name: "United Arab Emirates", flag: "🇦🇪", region: "Asia" },
  { code: "URY", name: "Uruguay", flag: "🇺🇾", region: "South America" },
  { code: "VEN", name: "Venezuela", flag: "🇻🇪", region: "South America" },
  { code: "VNM", name: "Vietnam", flag: "🇻🇳", region: "Asia" },
  { code: "ZWE", name: "Zimbabwe", flag: "🇿🇼", region: "Africa" },
];

// Helper functions
export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find((country) => country.code === code);
}

export function getCountryByName(name: string): Country | undefined {
  return COUNTRIES.find((country) => 
    country.name.toLowerCase() === name.toLowerCase()
  );
}

export function searchCountries(query: string): Country[] {
  if (!query) return getPopularCountries();
  
  const searchTerm = query.toLowerCase();
  return COUNTRIES.filter((country) =>
    country.name.toLowerCase().includes(searchTerm) ||
    country.code.toLowerCase().includes(searchTerm)
  );
}

export function getPopularCountries(): Country[] {
  return COUNTRIES.filter((country) => country.popular);
}

export function getAllCountries(): Country[] {
  return COUNTRIES;
}

export function getCountriesByRegion(region: string): Country[] {
  return COUNTRIES.filter((country) => country.region === region);
}

export function getUniqueRegions(): string[] {
  const regions = new Set(COUNTRIES.map((country) => country.region));
  return Array.from(regions).sort();
}

export function formatCountryOption(country: Country): string {
  return `${country.flag} ${country.name}`;
}

export function isValidCountryCode(code: string): boolean {
  return COUNTRIES.some((country) => country.code === code);
}