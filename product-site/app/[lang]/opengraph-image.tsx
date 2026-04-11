import { notFound } from "next/navigation";

import { createCistackOgImage, OG_SIZE } from "@/lib/create-og-image";
import { getDictionary, hasLocale, type Locale } from "@/lib/dictionaries";

export const alt = "cistack";

export const size = OG_SIZE;

export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!hasLocale(lang)) {
    notFound();
  }
  const dict = await getDictionary(lang as Locale);
  return createCistackOgImage(dict);
}
