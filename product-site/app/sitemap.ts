import type { MetadataRoute } from "next";

import {
  buildLanguageAlternates,
  DEFAULT_LOCALE,
  getSiteUrl,
  LOCALES,
} from "@/lib/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const lastModified = new Date();
  const languages = buildLanguageAlternates();

  return LOCALES.map((locale) => ({
    url: `${base}/${locale}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: locale === DEFAULT_LOCALE ? 1 : 0.9,
    alternates: { languages },
  }));
}
