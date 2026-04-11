import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono, Fira_Code } from "next/font/google";

import { getDictionary, hasLocale, type Locale } from "@/lib/dictionaries";
import {
  buildLanguageAlternates,
  getSiteUrl,
  LOCALES,
  LOCALE_TO_OPENGRAPH,
  type SiteLocale,
} from "@/lib/site-config";
import { buildMetaDescription, buildPageTitle } from "@/lib/seo";

import "../globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
});

const creator = { name: "Edwin Vakayil", url: "https://www.edwinvakayil.info/" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) {
    return {};
  }

  const locale = lang as SiteLocale;
  const dict = await getDictionary(locale as Locale);
  const base = getSiteUrl();
  const canonical = `${base}/${locale}`;
  const title = buildPageTitle(dict);
  const description = buildMetaDescription(dict);
  const languages = buildLanguageAlternates();
  const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();

  return {
    metadataBase: new URL(base),
    title: {
      default: title,
      template: `%s | ${dict.hero.product_name}`,
    },
    description,
    keywords: [
      "GitHub Actions",
      "CI/CD",
      "DevOps",
      "workflow generator",
      "cistack",
      "automation",
      "Next.js",
      "Docker",
      "Vercel",
      "AWS",
      "Firebase",
      "Dependabot",
      "pipeline",
    ],
    authors: [creator],
    creator: creator.name,
    publisher: creator.name,
    alternates: {
      canonical,
      languages,
    },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: dict.hero.product_name,
      title,
      description,
      locale: LOCALE_TO_OPENGRAPH[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => LOCALE_TO_OPENGRAPH[l]),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: "@edwinvakayil",
    },
    icons: {
      icon: [{ url: "/favicon.ico", sizes: "any" }],
      shortcut: "/favicon.ico",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    category: "technology",
    ...(googleVerification
      ? { verification: { google: googleVerification } }
      : {}),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export async function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <html
      lang={lang}
      className={`${dmSans.variable} ${geistMono.variable} ${firaCode.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://registry.npmjs.org" />
        <link rel="preconnect" href="https://api.npmjs.org" />
        <link rel="dns-prefetch" href="https://github.com" />
        <link rel="dns-prefetch" href="https://www.npmjs.com" />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
