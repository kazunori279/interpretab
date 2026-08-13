/**
 * Language, model and voice tables.
 *
 * Ported from `app/translator_agent/agent.py` in
 * https://github.com/kazunori279/adk-live-translator, where the same tables were
 * served to the web app over `/api/languages`. With no server left to ask, they
 * are bundled — which also means the side panel can fill its dropdowns before
 * the first frame instead of after a round trip.
 */

/** Agent mode: one-way translation with a known source language. */
export const MODEL = "gemini-3.1-flash-live-preview";

/** Simultaneous translation: continuous, auto-detected source, no turns. */
export const SIMUL_MODEL = "gemini-3.5-live-translate-preview";

export const POPULAR_LANGUAGES = ["en", "ja", "zh", "es", "fr", "de", "pt", "ko", "hi", "ar"];

/** Source and target languages for the agent model (the microphone direction). */
export const LANGUAGES = {
  af: "Afrikaans",
  ak: "Akan",
  sq: "Albanian (Shqip)",
  am: "Amharic (አማርኛ)",
  ar: "Arabic (العربية)",
  hy: "Armenian (Հայերեն)",
  as: "Assamese (অসমীয়া)",
  az: "Azerbaijani (Azərbaycan)",
  eu: "Basque (Euskara)",
  be: "Belarusian (Беларуская)",
  bn: "Bengali (বাংলা)",
  bs: "Bosnian (Bosanski)",
  bg: "Bulgarian (Български)",
  my: "Burmese (မြန်မာ)",
  ca: "Catalan (Català)",
  ceb: "Cebuano",
  zh: "Chinese (中文)",
  hr: "Croatian (Hrvatski)",
  cs: "Czech (Čeština)",
  da: "Danish (Dansk)",
  nl: "Dutch (Nederlands)",
  en: "English",
  et: "Estonian (Eesti)",
  fo: "Faroese (Føroyskt)",
  fil: "Filipino",
  fi: "Finnish (Suomi)",
  fr: "French (Français)",
  gl: "Galician (Galego)",
  ka: "Georgian (ქართული)",
  de: "German (Deutsch)",
  el: "Greek (Ελληνικά)",
  gu: "Gujarati (ગુજરાતી)",
  ha: "Hausa",
  iw: "Hebrew (עברית)",
  hi: "Hindi (हिन्दी)",
  hu: "Hungarian (Magyar)",
  is: "Icelandic (Íslenska)",
  id: "Indonesian (Bahasa Indonesia)",
  ga: "Irish (Gaeilge)",
  it: "Italian (Italiano)",
  ja: "Japanese (日本語)",
  kn: "Kannada (ಕನ್ನಡ)",
  kk: "Kazakh (Қазақ)",
  km: "Khmer (ខ្មែរ)",
  rw: "Kinyarwanda",
  ko: "Korean (한국어)",
  ku: "Kurdish (Kurdî)",
  ky: "Kyrgyz (Кыргызча)",
  lo: "Lao (ລາວ)",
  lv: "Latvian (Latviešu)",
  lt: "Lithuanian (Lietuvių)",
  mk: "Macedonian (Македонски)",
  ms: "Malay (Bahasa Melayu)",
  ml: "Malayalam (മലയാളം)",
  mt: "Maltese (Malti)",
  mi: "Maori (Māori)",
  mr: "Marathi (मराठी)",
  mn: "Mongolian (Монгол)",
  ne: "Nepali (नेपाली)",
  no: "Norwegian (Norsk)",
  or: "Odia (ଓଡ଼ିଆ)",
  om: "Oromo",
  ps: "Pashto (پښتو)",
  fa: "Persian (فارسی)",
  pl: "Polish (Polski)",
  pt: "Portuguese (Português)",
  pa: "Punjabi (ਪੰਜਾਬੀ)",
  qu: "Quechua",
  ro: "Romanian (Română)",
  rm: "Romansh (Rumantsch)",
  ru: "Russian (Русский)",
  sr: "Serbian (Српски)",
  sd: "Sindhi (سنڌي)",
  si: "Sinhala (සිංහල)",
  sk: "Slovak (Slovenčina)",
  sl: "Slovenian (Slovenščina)",
  so: "Somali",
  st: "Southern Sotho (Sesotho)",
  es: "Spanish (Español)",
  sw: "Swahili (Kiswahili)",
  sv: "Swedish (Svenska)",
  tg: "Tajik (Тоҷикӣ)",
  ta: "Tamil (தமிழ்)",
  te: "Telugu (తెలుగు)",
  th: "Thai (ไทย)",
  tn: "Tswana (Setswana)",
  tr: "Turkish (Türkçe)",
  tk: "Turkmen (Türkmen)",
  uk: "Ukrainian (Українська)",
  ur: "Urdu (اردو)",
  uz: "Uzbek (Oʻzbek)",
  vi: "Vietnamese (Tiếng Việt)",
  cy: "Welsh (Cymraeg)",
  fy: "Western Frisian (Frysk)",
  wo: "Wolof",
  yo: "Yoruba (Yorùbá)",
  zu: "Zulu (isiZulu)",
};

/** Targets for the simultaneous model, whose codes are BCP-47. */
export const SIMUL_LANGUAGES = {
  af: "Afrikaans",
  ak: "Akan",
  sq: "Albanian (Shqip)",
  am: "Amharic (አማርኛ)",
  ar: "Arabic (العربية)",
  hy: "Armenian (Հայերեն)",
  az: "Azerbaijani (Azərbaycan)",
  eu: "Basque (Euskara)",
  be: "Belarusian (Беларуская)",
  bn: "Bengali (বাংলা)",
  bg: "Bulgarian (Български)",
  my: "Burmese (မြန်မာ)",
  ca: "Catalan (Català)",
  "zh-Hans": "Chinese Simplified (简体中文)",
  "zh-Hant": "Chinese Traditional (繁體中文)",
  hr: "Croatian (Hrvatski)",
  cs: "Czech (Čeština)",
  da: "Danish (Dansk)",
  nl: "Dutch (Nederlands)",
  en: "English",
  et: "Estonian (Eesti)",
  fil: "Filipino",
  fi: "Finnish (Suomi)",
  fr: "French (Français)",
  gl: "Galician (Galego)",
  ka: "Georgian (ქართული)",
  de: "German (Deutsch)",
  el: "Greek (Ελληνικά)",
  gu: "Gujarati (ગુજરાતી)",
  ha: "Hausa",
  he: "Hebrew (עברית)",
  hi: "Hindi (हिन्दी)",
  hu: "Hungarian (Magyar)",
  is: "Icelandic (Íslenska)",
  id: "Indonesian (Bahasa Indonesia)",
  it: "Italian (Italiano)",
  ja: "Japanese (日本語)",
  jv: "Javanese (Basa Jawa)",
  kn: "Kannada (ಕನ್ನಡ)",
  kk: "Kazakh (Қазақ)",
  km: "Khmer (ខ្មែរ)",
  rw: "Kinyarwanda",
  ko: "Korean (한국어)",
  lo: "Lao (ລາວ)",
  lv: "Latvian (Latviešu)",
  lt: "Lithuanian (Lietuvių)",
  mk: "Macedonian (Македонски)",
  ms: "Malay (Bahasa Melayu)",
  ml: "Malayalam (മലയാളം)",
  mr: "Marathi (मराठी)",
  mn: "Mongolian (Монгол)",
  ne: "Nepali (नेपाली)",
  no: "Norwegian (Norsk)",
  fa: "Persian (فارسی)",
  pl: "Polish (Polski)",
  "pt-BR": "Portuguese - Brazil (Português)",
  "pt-PT": "Portuguese - Portugal (Português)",
  pa: "Punjabi (ਪੰਜਾਬੀ)",
  ro: "Romanian (Română)",
  ru: "Russian (Русский)",
  sr: "Serbian (Српски)",
  sd: "Sindhi (سنڌي)",
  si: "Sinhala (සිංහල)",
  sk: "Slovak (Slovenčina)",
  sl: "Slovenian (Slovenščina)",
  es: "Spanish (Español)",
  su: "Sundanese (Basa Sunda)",
  sw: "Swahili (Kiswahili)",
  sv: "Swedish (Svenska)",
  ta: "Tamil (தமிழ்)",
  te: "Telugu (తెలుగు)",
  th: "Thai (ไทย)",
  tr: "Turkish (Türkçe)",
  uk: "Ukrainian (Українська)",
  ur: "Urdu (اردو)",
  uz: "Uzbek (Oʻzbek)",
  vi: "Vietnamese (Tiếng Việt)",
  zu: "Zulu (isiZulu)",
};

export const SIMUL_POPULAR_LANGUAGES = [
  "en",
  "ja",
  "zh-Hans",
  "es",
  "fr",
  "de",
  "pt-BR",
  "ko",
  "hi",
  "ar",
];

const SIMUL_CODE_MAP = { iw: "he", zh: "zh-Hans", pt: "pt-BR" };

/** Map an agent-model language code to the simultaneous model's BCP-47 code. */
export function simulLanguageCode(code) {
  return SIMUL_CODE_MAP[code] || code;
}

/**
 * The 30 prebuilt voices the Live API exposes, with Google's tone descriptor for
 * each. Both models accept any of them.
 *
 * This is a whitelist, not UI decoration: an unknown voice name fails the
 * connection with `1007 No matching speaker voice found`, and the reconnect loop
 * in `session-loop.js` would retry that forever.
 */
export const VOICES = {
  Zephyr: "Bright",
  Puck: "Upbeat",
  Charon: "Informative",
  Kore: "Firm",
  Fenrir: "Excitable",
  Leda: "Youthful",
  Orus: "Firm",
  Aoede: "Breezy",
  Callirrhoe: "Easy-going",
  Autonoe: "Bright",
  Enceladus: "Breathy",
  Iapetus: "Clear",
  Umbriel: "Easy-going",
  Algieba: "Smooth",
  Despina: "Smooth",
  Erinome: "Clear",
  Algenib: "Gravelly",
  Rasalgethi: "Informative",
  Laomedeia: "Upbeat",
  Achernar: "Soft",
  Alnilam: "Firm",
  Schedar: "Even",
  Gacrux: "Mature",
  Pulcherrima: "Forward",
  Achird: "Friendly",
  Zubenelgenubi: "Casual",
  Vindemiatrix: "Gentle",
  Sadachbia: "Lively",
  Sadaltager: "Knowledgeable",
  Sulafat: "Warm",
};

/** The Live API's own default when no speechConfig is supplied. */
export const DEFAULT_VOICE = "Puck";

/**
 * Return *name* if it is a known voice, else DEFAULT_VOICE.
 *
 * Matched case-insensitively so a differently-cased value left in storage still
 * resolves to the canonical spelling the API expects.
 */
export function resolveVoice(name) {
  if (!name) return DEFAULT_VOICE;
  const wanted = String(name).trim().toLowerCase();
  for (const voice of Object.keys(VOICES)) {
    if (voice.toLowerCase() === wanted) return voice;
  }
  return DEFAULT_VOICE;
}
