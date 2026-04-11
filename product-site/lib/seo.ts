import type { Dictionary } from "@/lib/dictionary-types";

/** Target ~155 chars for meta description. */
export function truncateMetaDescription(text: string, max = 155): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  const cut = normalized.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

/** Target ~58 chars for HTML title (search engines show ~50–60). */
export function buildPageTitle(dict: Dictionary): string {
  const raw = `${dict.hero.product_name} — ${dict.hero.tagline}`;
  if (raw.length <= 58) {
    return raw;
  }
  const cut = raw.slice(0, 57);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

export function buildMetaDescription(dict: Dictionary): string {
  return truncateMetaDescription(`${dict.hero.tagline} ${dict.hero.intro}`);
}
