import type { Metadata } from "next";
import { DM_Sans, Geist_Mono, Fira_Code } from "next/font/google";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://cistack.edwinvakayil.info"),
  title: {
    default: "cistack | Automated GitHub Actions for Your Stack",
    template: "%s | cistack"
  },
  description: "cistack deep-scans your repository to generate production-ready GitHub Actions workflows instantly. Supports 30+ frameworks and 12+ platforms with security-first defaults.",
  keywords: ["github actions", "automation", "ci/cd", "devops", "workflow generator", "nextjs", "docker", "vercel", "aws", "firebase", "automated testing", "pipeline automation", "github workflow", "devops tools"],
  authors: [{ name: "Edwin Vakayil", url: "https://www.edwinvakayil.info/" }],
  creator: "Edwin Vakayil",
  publisher: "Edwin Vakayil",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "cistack | Automated GitHub Actions for Your Stack",
    description: "Deep-scans your codebase to generate production-grade CI/CD pipelines in seconds. Support for 30+ frameworks.",
    url: "https://cistack.edwinvakayil.info",
    siteName: "cistack",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "cistack - Automated GitHub Actions",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "cistack | Professional Workflow Automation",
    description: "Generate hardened GitHub Actions for any stack instantly. 30+ frameworks supported.",
    creator: "@edwinvakayil",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  category: 'technology',
};

export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'fr' }, { lang: 'es' }, { lang: 'pt' }, { lang: 'br' }, { lang: 'de' }, { lang: 'cn' }];
}

export default async function RootLayout({
  children,
  params
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
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
