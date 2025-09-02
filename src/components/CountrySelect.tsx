/**
 * CountrySelect Component
 * 
 * A searchable dropdown component for selecting countries with flags,
 * optimized for website country assignment functionality.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Country,
  getPopularCountries,
  getAllCountries,
  getCountryByCode,
  searchCountries,
} from "@/lib/countries";

interface CountrySelectProps {
  value?: string; // ISO 3166-1 alpha-3 country code
  onChange: (country: Country | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showPopularFirst?: boolean;
  searchPlaceholder?: string;
}

export function CountrySelect({
  value,
  onChange,
  placeholder = "Select country...",
  disabled = false,
  className,
  showPopularFirst = true,
  searchPlaceholder = "Search countries...",
}: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Get the selected country object
  const selectedCountry = value ? getCountryByCode(value) : null;

  // Get countries to display
  const getDisplayCountries = useCallback(() => {
    if (searchQuery) {
      return searchCountries(searchQuery);
    }
    
    if (showPopularFirst) {
      const popular = getPopularCountries();
      const all = getAllCountries().filter(country => !country.popular);
      return { popular, all };
    }
    
    return { all: getAllCountries() };
  }, [searchQuery, showPopularFirst]);

  // Handle country selection
  const handleSelect = useCallback((country: Country) => {
    onChange(country);
    setOpen(false);
    setSearchQuery("");
  }, [onChange]);

  // Handle clear selection
  const handleClear = useCallback(() => {
    onChange(null);
    setOpen(false);
    setSearchQuery("");
  }, [onChange]);

  // Clear search when popover closes and manage focus
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    } else {
      // Focus the scroll area when popover opens to ensure wheel events work
      setTimeout(() => {
        if (scrollAreaRef.current) {
          scrollAreaRef.current.focus();
        }
      }, 100);
    }
  }, [open]);

  const countries = getDisplayCountries();
  const hasPopularCountries = 'popular' in countries && countries.popular && countries.popular.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between !hover:scale-100 !active:scale-100",
            !selectedCountry && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <span className="flex items-center gap-2 truncate">
            {selectedCountry ? (
              <>
                <span className="text-lg" role="img" aria-label={selectedCountry.name}>
                  {selectedCountry.flag}
                </span>
                <span className="truncate">{selectedCountry.name}</span>
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-[--radix-popover-trigger-width] p-0 animate-none data-[state=open]:animate-none data-[state=closed]:animate-none" 
        align="start"
      >
        <Command>
          <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder={searchPlaceholder}
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
          </div>
          
          <ScrollArea 
            ref={scrollAreaRef}
            className="h-[300px] w-full"
          >
            <CommandList className="max-h-none">
              <CommandEmpty>No countries found.</CommandEmpty>
            
            {/* Clear selection option */}
            {selectedCountry && (
              <>
                <CommandGroup>
                  <CommandItem
                    onSelect={handleClear}
                    className="text-muted-foreground hover:bg-transparent data-[selected=true]:bg-transparent transition-none focus:outline-2 focus:outline-blue-500 focus:outline-offset-1"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center">×</span>
                      <span>Clear selection</span>
                    </span>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* Popular countries (shown first when not searching) */}
            {hasPopularCountries && !searchQuery && (
              <>
                <CommandGroup heading="Popular">
                  {countries.popular?.map((country) => (
                    <CommandItem
                      key={country.code}
                      value={`${country.name} ${country.code}`}
                      onSelect={() => handleSelect(country)}
                      className="flex items-center justify-between hover:bg-transparent data-[selected=true]:bg-transparent transition-none focus:outline-2 focus:outline-blue-500 focus:outline-offset-1"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-lg" role="img" aria-label={country.name}>
                          {country.flag}
                        </span>
                        <span>{country.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {country.code}
                        </span>
                      </span>
                      <Check
                        className={cn(
                          "h-4 w-4",
                          value === country.code ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
                
                {countries.all.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="All Countries">
                      {countries.all.map((country) => (
                        <CommandItem
                          key={country.code}
                          value={`${country.name} ${country.code}`}
                          onSelect={() => handleSelect(country)}
                          className="flex items-center justify-between hover:bg-transparent data-[selected=true]:bg-transparent transition-none focus:outline-2 focus:outline-blue-500 focus:outline-offset-1"
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-lg" role="img" aria-label={country.name}>
                              {country.flag}
                            </span>
                            <span>{country.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {country.code}
                            </span>
                          </span>
                          <Check
                            className={cn(
                              "h-4 w-4",
                              value === country.code ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </>
            )}

            {/* All countries (when searching or showPopularFirst is false) */}
            {('all' in countries && !hasPopularCountries) && (
              <CommandGroup>
                {countries.all.map((country) => (
                  <CommandItem
                    key={country.code}
                    value={`${country.name} ${country.code}`}
                    onSelect={() => handleSelect(country)}
                    className="flex items-center justify-between hover:bg-transparent data-[selected=true]:bg-transparent transition-none focus:outline-2 focus:outline-blue-500 focus:outline-offset-1"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-lg" role="img" aria-label={country.name}>
                        {country.flag}
                      </span>
                      <span>{country.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {country.code}
                      </span>
                    </span>
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value === country.code ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Search results */}
            {searchQuery && Array.isArray(countries) && (
              <CommandGroup>
                {countries.map((country) => (
                  <CommandItem
                    key={country.code}
                    value={`${country.name} ${country.code}`}
                    onSelect={() => handleSelect(country)}
                    className="flex items-center justify-between hover:bg-transparent data-[selected=true]:bg-transparent transition-none focus:outline-2 focus:outline-blue-500 focus:outline-offset-1"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-lg" role="img" aria-label={country.name}>
                        {country.flag}
                      </span>
                      <span>{country.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {country.code}
                      </span>
                    </span>
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value === country.code ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            </CommandList>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Compact version for inline display
interface CountryDisplayProps {
  countryCode?: string;
  showFlag?: boolean;
  showName?: boolean;
  showCode?: boolean;
  className?: string;
}

export function CountryDisplay({
  countryCode,
  showFlag = true,
  showName = true,
  showCode = false,
  className,
}: CountryDisplayProps) {
  if (!countryCode) return null;
  
  const country = getCountryByCode(countryCode);
  if (!country) return null;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {showFlag && (
        <span className="text-sm" role="img" aria-label={country.name}>
          {country.flag}
        </span>
      )}
      {showName && <span className="text-sm">{country.name}</span>}
      {showCode && <span className="text-xs text-muted-foreground">({country.code})</span>}
    </span>
  );
}