import { notFound } from "next/navigation";
import { getDictionary, hasLocale, Locale } from "@/lib/dictionaries";
import HomeClient from "@/components/HomeClient";

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

  return <HomeClient dict={dict} lang={lang as Locale} />;
}
