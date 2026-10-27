/**
 * Phone country codes for the Project Builder: every Arab country first
 * (Lebanon is the default), then the countries where most of our diaspora
 * clients live. Searchable by Arabic name, English name or code.
 */
export interface Country {
  code: string;
  dial: string;
  nameAr: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: "LB", dial: "961", nameAr: "لبنان", name: "Lebanon" },
  { code: "SY", dial: "963", nameAr: "سوريا", name: "Syria" },
  { code: "JO", dial: "962", nameAr: "الأردن", name: "Jordan" },
  { code: "PS", dial: "970", nameAr: "فلسطين", name: "Palestine" },
  { code: "IQ", dial: "964", nameAr: "العراق", name: "Iraq" },
  { code: "SA", dial: "966", nameAr: "السعودية", name: "Saudi Arabia" },
  { code: "AE", dial: "971", nameAr: "الإمارات", name: "United Arab Emirates" },
  { code: "QA", dial: "974", nameAr: "قطر", name: "Qatar" },
  { code: "KW", dial: "965", nameAr: "الكويت", name: "Kuwait" },
  { code: "BH", dial: "973", nameAr: "البحرين", name: "Bahrain" },
  { code: "OM", dial: "968", nameAr: "عُمان", name: "Oman" },
  { code: "YE", dial: "967", nameAr: "اليمن", name: "Yemen" },
  { code: "EG", dial: "20", nameAr: "مصر", name: "Egypt" },
  { code: "LY", dial: "218", nameAr: "ليبيا", name: "Libya" },
  { code: "TN", dial: "216", nameAr: "تونس", name: "Tunisia" },
  { code: "DZ", dial: "213", nameAr: "الجزائر", name: "Algeria" },
  { code: "MA", dial: "212", nameAr: "المغرب", name: "Morocco" },
  { code: "SD", dial: "249", nameAr: "السودان", name: "Sudan" },
  { code: "MR", dial: "222", nameAr: "موريتانيا", name: "Mauritania" },
  { code: "SO", dial: "252", nameAr: "الصومال", name: "Somalia" },
  { code: "DJ", dial: "253", nameAr: "جيبوتي", name: "Djibouti" },
  { code: "KM", dial: "269", nameAr: "جزر القمر", name: "Comoros" },
  { code: "TR", dial: "90", nameAr: "تركيا", name: "Turkey" },
  { code: "CY", dial: "357", nameAr: "قبرص", name: "Cyprus" },
  { code: "FR", dial: "33", nameAr: "فرنسا", name: "France" },
  { code: "DE", dial: "49", nameAr: "ألمانيا", name: "Germany" },
  { code: "GB", dial: "44", nameAr: "بريطانيا", name: "United Kingdom" },
  { code: "BE", dial: "32", nameAr: "بلجيكا", name: "Belgium" },
  { code: "NL", dial: "31", nameAr: "هولندا", name: "Netherlands" },
  { code: "SE", dial: "46", nameAr: "السويد", name: "Sweden" },
  { code: "CH", dial: "41", nameAr: "سويسرا", name: "Switzerland" },
  { code: "IT", dial: "39", nameAr: "إيطاليا", name: "Italy" },
  { code: "ES", dial: "34", nameAr: "إسبانيا", name: "Spain" },
  { code: "GR", dial: "30", nameAr: "اليونان", name: "Greece" },
  { code: "US", dial: "1", nameAr: "الولايات المتحدة", name: "United States" },
  { code: "CA", dial: "1", nameAr: "كندا", name: "Canada" },
  { code: "BR", dial: "55", nameAr: "البرازيل", name: "Brazil" },
  { code: "AU", dial: "61", nameAr: "أستراليا", name: "Australia" },
  { code: "NG", dial: "234", nameAr: "نيجيريا", name: "Nigeria" },
  { code: "CI", dial: "225", nameAr: "ساحل العاج", name: "Côte d'Ivoire" },
  { code: "SN", dial: "221", nameAr: "السنغال", name: "Senegal" },
  { code: "GH", dial: "233", nameAr: "غانا", name: "Ghana" },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

export const COUNTRY_MAP = Object.fromEntries(COUNTRIES.map((c) => [c.code, c])) as Record<string, Country>;

/** "+961 3 123 456" → { country: LB, national: "3123456" } (longest matching code wins). */
export function splitPhone(phone: string | null | undefined): { country: Country; national: string } {
  const value = String(phone ?? "").trim();
  const digits = value.replace(/[^0-9]/g, "");
  if (value.startsWith("+") || value.startsWith("00")) {
    const international = value.startsWith("00") ? digits.slice(2) : digits;
    const match = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((c) => international.startsWith(c.dial));
    if (match) return { country: match, national: international.slice(match.dial.length) };
  }
  return { country: DEFAULT_COUNTRY, national: digits };
}

/** The national number without leading zeros, joined with the country code: "+961 3123456". */
export function joinPhone(country: Country, national: string): string {
  const digits = national.replace(/[^0-9]/g, "").replace(/^0+/, "");
  return digits ? `+${country.dial} ${digits}` : "";
}
