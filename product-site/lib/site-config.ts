/** Locales supported by the site (keep in sync with middleware and dictionaries). */
export const LOCALES = ["en", "fr", "es", "pt", "br", "de", "cn"] as const;

export type SiteLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: SiteLocale = "en";

/** BCP 47 tags for hreflang. */
export const LOCALE_TO_HREFLANG: Record<SiteLocale, string> = {
  en: "en",
  fr: "fr",
  es: "es",
  pt: "pt",
  br: "pt-BR",
  de: "de",
  cn: "zh-Hans",
};

/** Open Graph locale strings. */
export const LOCALE_TO_OPENGRAPH: Record<SiteLocale, string> = {
  en: "en_US",
  fr: "fr_FR",
  es: "es_ES",
  pt: "pt_PT",
  br: "pt_BR",
  de: "de_DE",
  cn: "zh_CN",
};

/** Canonical site origin (no trailing slash). */
export const SITE_URL = "https://cistack.edwinvakayil.info";

export function getSiteUrl(): string {
  return SITE_URL;
}

export function buildLanguageAlternates(): Record<string, string> {
  const base = getSiteUrl();
  const map: Record<string, string> = {};
  for (const locale of LOCALES) {
    map[LOCALE_TO_HREFLANG[locale]] = `${base}/${locale}`;
  }
  map["x-default"] = `${base}/${DEFAULT_LOCALE}`;
  return map;
}
