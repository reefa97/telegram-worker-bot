import { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';

interface AddressAutocompleteProps {
    value: string;
    onChange: (address: string, lat?: number, lon?: number) => void;
    placeholder?: string;
    className?: string;
}

interface NominatimResult {
    place_id: number;
    licence: string;
    osm_type: string;
    osm_id: number;
    boundingbox: string[];
    lat: string;
    lon: string;
    display_name: string;
    class: string;
    type: string;
    importance: number;
}

export default function AddressAutocomplete({ value, onChange, placeholder = "Введите адрес...", className = "" }: AddressAutocompleteProps) {
    const [query, setQuery] = useState(value);
    const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Update internal state when prop changes (e.g. editing existing object)
    useEffect(() => {
        setQuery(value);
    }, [value]);

    useEffect(() => {
        // Handle clicks outside to close suggestions
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setQuery(newVal);
        onChange(newVal); // Update parent immediately with text

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        if (newVal.length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        setLoading(true);
        debounceTimerRef.current = setTimeout(async () => {
            try {
                // Limit to Poland (countrycodes=pl) to be relevant for this app context, 
                // but we can remove it if global search is needed.
                // Added addressdetails=1 to get more info if needed.
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newVal)}&addressdetails=1&limit=5`
                );

                if (response.ok) {
                    const data: NominatimResult[] = await response.json();
                    setSuggestions(data);
                    setShowSuggestions(true);
                }
            } catch (error) {
                console.error("Error fetching address suggestions:", error);
            } finally {
                setLoading(false);
            }
        }, 500); // 500ms debounce
    };

    const handleSelect = (result: NominatimResult) => {
        setQuery(result.display_name);
        onChange(result.display_name, parseFloat(result.lat), parseFloat(result.lon));
        setShowSuggestions(false);
    };

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={handleInput}
                    onFocus={() => {
                        if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    className="input pl-9 w-full"
                    placeholder={placeholder}
                    required
                />
                <div className="absolute left-3 top-2.5 text-gray-400">
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Search className="w-4 h-4" />
                    )}
                </div>
            </div>

            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg max-h-60 overflow-y-auto animate-fadeIn">
                    {suggestions.map((item) => (
                        <button
                            key={item.place_id}
                            type="button"
                            onClick={() => handleSelect(item)}
                            className="w-full text-left p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-start gap-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                        >
                            <MapPin className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                            <span className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
                                {item.display_name}
                            </span>
                        </button>
                    ))}
                    <div className="p-2 text-[10px] text-zinc-400 text-right bg-zinc-50 dark:bg-zinc-950/50">
                        Powered by OpenStreetMap
                    </div>
                </div>
            )}
        </div>
    );
}
