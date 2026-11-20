/**
 * Languages supported for book generation.
 * `fontFamily` is the CSS font stack used by the editor and PDF export;
 * the fonts are Noto families (installed in the worker image and loaded on the web).
 */
export type TextDirection = "ltr" | "rtl";

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  dir: TextDirection;
  fontFamily: string;
}

const LATIN = `"Noto Serif", Georgia, serif`;

export const LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr", fontFamily: LATIN },
  { code: "zh", name: "Chinese (Simplified)", nativeName: "简体中文", dir: "ltr", fontFamily: `"Noto Serif SC", "Noto Serif", serif` },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", dir: "ltr", fontFamily: `"Noto Serif Devanagari", "Noto Serif", serif` },
  { code: "es", name: "Spanish", nativeName: "Español", dir: "ltr", fontFamily: LATIN },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl", fontFamily: `"Noto Naskh Arabic", "Noto Serif", serif` },
  { code: "fr", name: "French", nativeName: "Français", dir: "ltr", fontFamily: LATIN },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", dir: "ltr", fontFamily: `"Noto Serif Bengali", "Noto Serif", serif` },
  { code: "pt", name: "Portuguese", nativeName: "Português", dir: "ltr", fontFamily: LATIN },
  { code: "ru", name: "Russian", nativeName: "Русский", dir: "ltr", fontFamily: LATIN },
  { code: "ur", name: "Urdu", nativeName: "اردو", dir: "rtl", fontFamily: `"Noto Nastaliq Urdu", "Noto Naskh Arabic", serif` },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", dir: "ltr", fontFamily: LATIN },
  { code: "de", name: "German", nativeName: "Deutsch", dir: "ltr", fontFamily: LATIN },
  { code: "ja", name: "Japanese", nativeName: "日本語", dir: "ltr", fontFamily: `"Noto Serif JP", "Noto Serif", serif` },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", dir: "ltr", fontFamily: LATIN },
  { code: "ko", name: "Korean", nativeName: "한국어", dir: "ltr", fontFamily: `"Noto Serif KR", "Noto Serif", serif` },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", dir: "ltr", fontFamily: LATIN },
  { code: "it", name: "Italian", nativeName: "Italiano", dir: "ltr", fontFamily: LATIN },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", dir: "ltr", fontFamily: `"Noto Serif Tamil", "Noto Serif", serif` },
  { code: "fa", name: "Persian", nativeName: "فارسی", dir: "rtl", fontFamily: `"Noto Naskh Arabic", "Noto Serif", serif` },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili", dir: "ltr", fontFamily: LATIN },
] as const satisfies readonly Language[];

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];

export function getLanguage(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
