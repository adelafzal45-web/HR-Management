// ============================================================================
// Country / dial-code / state reference data for the employee form.
//
// Deliberately a static table rather than an API call: it never changes between
// deploys, it is needed before the first paint of the address and contact
// sections, and a network round trip would leave those selects empty on a slow
// connection. Pakistan is first in the list and is the form's default, which is
// what the "auto country code" behaviour is built on.
//
// `states` is only populated for countries whose subdivisions the form offers as
// a dropdown. Anywhere else the caller falls back to a free-text field — an
// incomplete list would block a legitimate address, which is worse than typing.
// ============================================================================

export type Country = {
  /** ISO 3166-1 alpha-2, used as the stable key everywhere. */
  code: string;
  name: string;
  /** E.164 calling code, with the leading `+`. */
  dial: string;
  flag: string;
};

export const DEFAULT_COUNTRY_CODE = "PK";

export const COUNTRIES: Country[] = [
  { code: "PK", name: "Pakistan", dial: "+92", flag: "🇵🇰" },
  { code: "AE", name: "United Arab Emirates", dial: "+971", flag: "🇦🇪" },
  { code: "AF", name: "Afghanistan", dial: "+93", flag: "🇦🇫" },
  { code: "AR", name: "Argentina", dial: "+54", flag: "🇦🇷" },
  { code: "AT", name: "Austria", dial: "+43", flag: "🇦🇹" },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺" },
  { code: "BD", name: "Bangladesh", dial: "+880", flag: "🇧🇩" },
  { code: "BE", name: "Belgium", dial: "+32", flag: "🇧🇪" },
  { code: "BH", name: "Bahrain", dial: "+973", flag: "🇧🇭" },
  { code: "BR", name: "Brazil", dial: "+55", flag: "🇧🇷" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
  { code: "CH", name: "Switzerland", dial: "+41", flag: "🇨🇭" },
  { code: "CN", name: "China", dial: "+86", flag: "🇨🇳" },
  { code: "CZ", name: "Czechia", dial: "+420", flag: "🇨🇿" },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪" },
  { code: "DK", name: "Denmark", dial: "+45", flag: "🇩🇰" },
  { code: "EG", name: "Egypt", dial: "+20", flag: "🇪🇬" },
  { code: "ES", name: "Spain", dial: "+34", flag: "🇪🇸" },
  { code: "ET", name: "Ethiopia", dial: "+251", flag: "🇪🇹" },
  { code: "FI", name: "Finland", dial: "+358", flag: "🇫🇮" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { code: "GH", name: "Ghana", dial: "+233", flag: "🇬🇭" },
  { code: "GR", name: "Greece", dial: "+30", flag: "🇬🇷" },
  { code: "HK", name: "Hong Kong", dial: "+852", flag: "🇭🇰" },
  { code: "HU", name: "Hungary", dial: "+36", flag: "🇭🇺" },
  { code: "ID", name: "Indonesia", dial: "+62", flag: "🇮🇩" },
  { code: "IE", name: "Ireland", dial: "+353", flag: "🇮🇪" },
  { code: "IL", name: "Israel", dial: "+972", flag: "🇮🇱" },
  { code: "IN", name: "India", dial: "+91", flag: "🇮🇳" },
  { code: "IQ", name: "Iraq", dial: "+964", flag: "🇮🇶" },
  { code: "IR", name: "Iran", dial: "+98", flag: "🇮🇷" },
  { code: "IT", name: "Italy", dial: "+39", flag: "🇮🇹" },
  { code: "JO", name: "Jordan", dial: "+962", flag: "🇯🇴" },
  { code: "JP", name: "Japan", dial: "+81", flag: "🇯🇵" },
  { code: "KE", name: "Kenya", dial: "+254", flag: "🇰🇪" },
  { code: "KR", name: "South Korea", dial: "+82", flag: "🇰🇷" },
  { code: "KW", name: "Kuwait", dial: "+965", flag: "🇰🇼" },
  { code: "LK", name: "Sri Lanka", dial: "+94", flag: "🇱🇰" },
  { code: "MA", name: "Morocco", dial: "+212", flag: "🇲🇦" },
  { code: "MV", name: "Maldives", dial: "+960", flag: "🇲🇻" },
  { code: "MX", name: "Mexico", dial: "+52", flag: "🇲🇽" },
  { code: "MY", name: "Malaysia", dial: "+60", flag: "🇲🇾" },
  { code: "NG", name: "Nigeria", dial: "+234", flag: "🇳🇬" },
  { code: "NL", name: "Netherlands", dial: "+31", flag: "🇳🇱" },
  { code: "NO", name: "Norway", dial: "+47", flag: "🇳🇴" },
  { code: "NP", name: "Nepal", dial: "+977", flag: "🇳🇵" },
  { code: "NZ", name: "New Zealand", dial: "+64", flag: "🇳🇿" },
  { code: "OM", name: "Oman", dial: "+968", flag: "🇴🇲" },
  { code: "PH", name: "Philippines", dial: "+63", flag: "🇵🇭" },
  { code: "PL", name: "Poland", dial: "+48", flag: "🇵🇱" },
  { code: "PT", name: "Portugal", dial: "+351", flag: "🇵🇹" },
  { code: "QA", name: "Qatar", dial: "+974", flag: "🇶🇦" },
  { code: "RO", name: "Romania", dial: "+40", flag: "🇷🇴" },
  { code: "RU", name: "Russia", dial: "+7", flag: "🇷🇺" },
  { code: "SA", name: "Saudi Arabia", dial: "+966", flag: "🇸🇦" },
  { code: "SE", name: "Sweden", dial: "+46", flag: "🇸🇪" },
  { code: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬" },
  { code: "TH", name: "Thailand", dial: "+66", flag: "🇹🇭" },
  { code: "TR", name: "Türkiye", dial: "+90", flag: "🇹🇷" },
  { code: "TZ", name: "Tanzania", dial: "+255", flag: "🇹🇿" },
  { code: "UA", name: "Ukraine", dial: "+380", flag: "🇺🇦" },
  { code: "UG", name: "Uganda", dial: "+256", flag: "🇺🇬" },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
  { code: "UZ", name: "Uzbekistan", dial: "+998", flag: "🇺🇿" },
  { code: "VN", name: "Vietnam", dial: "+84", flag: "🇻🇳" },
  { code: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦" },
];

/**
 * Subdivisions offered as a dropdown, keyed by ISO code.
 *
 * Pakistan uses the four provinces plus the two territories and the two
 * administered areas, which is the set that appears on a CNIC address.
 */
export const STATES_BY_COUNTRY: Record<string, string[]> = {
  PK: [
    "Punjab",
    "Sindh",
    "Khyber Pakhtunkhwa",
    "Balochistan",
    "Gilgit-Baltistan",
    "Azad Jammu & Kashmir",
    "Islamabad Capital Territory",
  ],
  AE: [
    "Abu Dhabi",
    "Ajman",
    "Dubai",
    "Fujairah",
    "Ras Al Khaimah",
    "Sharjah",
    "Umm Al Quwain",
  ],
  SA: [
    "Riyadh",
    "Makkah",
    "Madinah",
    "Eastern Province",
    "Asir",
    "Tabuk",
    "Qassim",
    "Hail",
    "Jazan",
    "Najran",
    "Al Bahah",
    "Al Jouf",
    "Northern Borders",
  ],
  IN: [
    "Andhra Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Delhi",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jammu & Kashmir",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Tamil Nadu",
    "Telangana",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
  ],
  GB: ["England", "Scotland", "Wales", "Northern Ireland"],
  CA: [
    "Alberta",
    "British Columbia",
    "Manitoba",
    "New Brunswick",
    "Newfoundland and Labrador",
    "Nova Scotia",
    "Ontario",
    "Prince Edward Island",
    "Quebec",
    "Saskatchewan",
  ],
  AU: [
    "Australian Capital Territory",
    "New South Wales",
    "Northern Territory",
    "Queensland",
    "South Australia",
    "Tasmania",
    "Victoria",
    "Western Australia",
  ],
  US: [
    "Alabama",
    "Alaska",
    "Arizona",
    "Arkansas",
    "California",
    "Colorado",
    "Connecticut",
    "Delaware",
    "Florida",
    "Georgia",
    "Hawaii",
    "Idaho",
    "Illinois",
    "Indiana",
    "Iowa",
    "Kansas",
    "Kentucky",
    "Louisiana",
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Montana",
    "Nebraska",
    "Nevada",
    "New Hampshire",
    "New Jersey",
    "New Mexico",
    "New York",
    "North Carolina",
    "North Dakota",
    "Ohio",
    "Oklahoma",
    "Oregon",
    "Pennsylvania",
    "Rhode Island",
    "South Carolina",
    "South Dakota",
    "Tennessee",
    "Texas",
    "Utah",
    "Vermont",
    "Virginia",
    "Washington",
    "West Virginia",
    "Wisconsin",
    "Wyoming",
  ],
};

/** Countries sorted for display: the default first, then alphabetically. */
export const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.name, label: c.name }));

export function countryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code.toUpperCase());
}

export function countryByName(name: string): Country | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return COUNTRIES.find((c) => c.name.toLowerCase() === needle);
}

/** Subdivision list for a country *name*, empty when the form should use text. */
export function statesForCountryName(name: string): string[] {
  const country = countryByName(name);
  return country ? (STATES_BY_COUNTRY[country.code] ?? []) : [];
}

/**
 * Several countries share a dial code (+1 is US and Canada, +7 is Russia and
 * Kazakhstan). Parsing a stored number can only recover the code, so the flag
 * shown for an ambiguous one is a fixed choice rather than a guess that changes
 * between renders.
 */
const DIAL_PREFERENCE: Record<string, string> = { "+1": "US", "+7": "RU" };

/** The country a dial code should display as, longest match wins. */
export function countryForDial(dial: string): Country | undefined {
  const preferred = DIAL_PREFERENCE[dial];
  if (preferred) return countryByCode(preferred);
  return COUNTRIES.find((c) => c.dial === dial);
}

export type ParsedPhone = { dial: string; national: string };

/**
 * Splits a stored phone into dial code + national number.
 *
 * Matches the longest known dial code so `+92…` never parses as `+9…`. A value
 * with no recognisable code keeps its digits in `national` and takes the
 * default dial, which is what makes an existing local-format record editable
 * instead of unparseable.
 */
export function splitPhone(value: string, fallbackDial: string): ParsedPhone {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return { dial: fallbackDial, national: "" };

  if (trimmed.startsWith("+")) {
    const dials = Array.from(new Set(COUNTRIES.map((c) => c.dial))).sort(
      (a, b) => b.length - a.length,
    );
    const match = dials.find((d) => trimmed.startsWith(d));
    if (match) {
      return { dial: match, national: trimmed.slice(match.length).trim() };
    }
  }
  return { dial: fallbackDial, national: trimmed };
}

/** Recombines the two halves; an empty national number yields an empty string. */
export function joinPhone(dial: string, national: string): string {
  const digits = national.trim();
  return digits ? `${dial} ${digits}` : "";
}


