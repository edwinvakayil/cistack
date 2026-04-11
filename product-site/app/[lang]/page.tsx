import { notFound } from "next/navigation";

import HomeClient from "@/components/HomeClient";
import { getDictionary, hasLocale, type Locale } from "@/lib/dictionaries";
import { getSiteUrl, LOCALE_TO_HREFLANG, type SiteLocale } from "@/lib/site-config";

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const dict = await getDictionary(lang as Locale);
  const siteUrl = getSiteUrl();
  const inLanguage = LOCALE_TO_HREFLANG[lang as SiteLocale];

  return (
    <HomeClient
      dict={dict}
      lang={lang as Locale}
      siteUrl={siteUrl}
      inLanguage={inLanguage}
    />
  );
}
