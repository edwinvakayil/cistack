"use client";

import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { Globe, Package, Terminal } from "lucide-react";
import { useEffect, useState } from "react";

import CopyButton from "@/components/CopyButton";
import InstallToggle from "@/components/InstallToggle";
import TerminalCard from "@/components/TerminalCard";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  HeroStagger,
  HeroStaggerItem,
  MotionHeader,
  MotionTagList,
  Reveal,
  SiteMotionRoot,
  StaggerItem,
  StaggerList,
  m,
  scrollViewport,
  SITE_EASE,
} from "@/components/site-motion";
import { Separator } from "@/components/ui/separator";
import type { Dictionary } from "@/lib/dictionary-types";

interface GithubIconProps {
  size?: number;
  className?: string;
}

interface RegistryPackageResponse {
  version?: string;
}

interface DownloadStatsResponse {
  downloads?: number;
}

const localeOptions = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "br", label: "BR (Brasil)" },
  { code: "de", label: "Deutsch" },
  { code: "cn", label: "简体中文" },
] as const;

const GithubIcon = ({ size = 24, className = "" }: GithubIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.02c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A4.8 4.8 0 0 0 8 18v4" />
  </svg>
);

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">{children}</p>
  );
}

function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`mt-1.5 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl ${className}`}>
      {children}
    </h2>
  );
}

function SnippetStack({
  snippets,
  copyLabels,
}: {
  snippets: readonly string[];
  copyLabels?: { idle: string; success: string };
}) {
  const reduce = useReducedMotion();
  if (snippets.length === 0) return null;
  const preClass =
    "min-w-0 flex-1 overflow-x-auto p-2.5 font-mono text-[11px] leading-relaxed text-zinc-900 whitespace-pre-wrap sm:text-xs";

  return (
    <div className="border border-zinc-200 bg-white">
      {snippets.map((line, i) => (
        <div key={`${line.slice(0, 48)}-${i}`}>
          {i > 0 && <Separator className="bg-zinc-200" />}
          <div className="flex min-h-11 items-stretch">
            {reduce ? (
              <pre className={preClass}>
                <code>{line}</code>
              </pre>
            ) : (
              <m.pre
                className={preClass}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={scrollViewport}
                transition={{ duration: 0.38, ease: SITE_EASE, delay: i * 0.06 }}
              >
                <code>{line}</code>
              </m.pre>
            )}
            {copyLabels ? (
              <>
                <Separator orientation="vertical" className="h-auto bg-zinc-200" />
                <div className="flex shrink-0 items-center px-1">
                  <CopyButton
                    text={line}
                    idleLabel={copyLabels.idle}
                    successLabel={copyLabels.success}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function InstallCodeBlock({
  command,
  idleLabel,
  successLabel,
}: {
  command: string;
  idleLabel: string;
  successLabel: string;
}) {
  const reduce = useReducedMotion();
  const inner = (
    <div className="flex min-h-12 items-stretch border border-zinc-200 bg-white">
      <pre className="flex flex-1 items-center overflow-x-auto p-3 font-mono text-[13px] leading-snug text-zinc-900">
        <code>{command}</code>
      </pre>
      <Separator orientation="vertical" className="bg-zinc-200" />
      <div className="flex shrink-0 items-center px-3">
        <CopyButton text={command} idleLabel={idleLabel} successLabel={successLabel} />
      </div>
    </div>
  );
  if (reduce) {
    return inner;
  }
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.985 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={scrollViewport}
      transition={{ duration: 0.45, ease: SITE_EASE }}
    >
      {inner}
    </m.div>
  );
}

/** Bento rows: items-start prevents short columns (e.g. Detection) stretching to match a tall neighbor. */
const pad = "p-5 sm:p-6 lg:px-8 lg:py-6";
const bentoRow = "grid grid-cols-1 border-b border-zinc-200 lg:grid-cols-12 lg:items-start";
const colLeft = `${pad} border-b border-zinc-200 lg:border-b-0 lg:border-e lg:border-zinc-200`;
const colRight = pad;

export default function HomeClient({
  dict,
  lang,
}: {
  dict: Dictionary;
  lang: string;
}) {
  const [version, setVersion] = useState("3.0.0");
  const [downloads, setDownloads] = useState("2.4k");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        const [registryRes, downloadsRes] = await Promise.all([
          fetch("https://registry.npmjs.org/cistack/latest"),
          fetch("https://api.npmjs.org/downloads/point/last-week/cistack"),
        ]);

        if (registryRes.ok) {
          const data = (await registryRes.json()) as RegistryPackageResponse;
          if (!cancelled && data.version) setVersion(data.version);
        }

        if (downloadsRes.ok) {
          const data = (await downloadsRes.json()) as DownloadStatsResponse;
          if (!cancelled && typeof data.downloads === "number") {
            const count = data.downloads;
            setDownloads(
              count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count.toLocaleString()
            );
          }
        }
      } catch (e) {
        console.error("Stats fetch error", e);
      }
    };

    void loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentYear = new Date().getFullYear();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "cistack",
            operatingSystem: "Any",
            applicationCategory: "DeveloperApplication",
            softwareVersion: version,
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
            },
            description: `${dict.hero.tagline} ${dict.hero.intro}`,
            creator: {
              "@type": "Person",
              name: "Edwin Vakayil",
              url: "https://www.edwinvakayil.info/",
            },
            featureList: dict.why.items,
            keywords:
              "github actions, automation, ci/cd, devops, workflow generator, docker, vercel, aws, firebase",
          }),
        }}
      />
      <div className="min-h-screen bg-white text-zinc-900 antialiased selection:bg-zinc-900 selection:text-white">
        <SiteMotionRoot>
        <MotionHeader className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/${lang}`}
                className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-950"
              >
                <Terminal className="h-5 w-5 text-zinc-500" aria-hidden />
                {dict.hero.product_name}
              </Link>
              <span className="border border-zinc-200 px-2 py-0.5 font-mono text-xs font-medium text-zinc-600">
                {dict.navigation.version} {version}
              </span>
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                {dict.navigation.status}
              </span>
            </div>
            <nav className="flex flex-wrap items-center gap-4 text-sm font-medium text-zinc-600">
              <a
                href="https://github.com/edwinvakayil/cistack"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-950"
              >
                <GithubIcon size={16} className="opacity-70" />
                {dict.navigation.repository}
              </a>
              <a
                href="https://www.npmjs.com/package/cistack"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-950"
              >
                <Package size={16} className="opacity-70" />
                {dict.navigation.registry}
              </a>
              <a href="#reference" className="transition-colors hover:text-zinc-950">
                {dict.navigation.reference}
              </a>
              <div className="flex items-center gap-2 border-s border-zinc-200 ps-4">
                <Link
                  href="/en"
                  className={`border px-2 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
                    lang === "en"
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  EN
                </Link>
                {lang !== "en" && (
                  <Link
                    href={`/${lang}`}
                    className="border border-zinc-900 bg-zinc-900 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white"
                  >
                    {lang.toUpperCase()}
                  </Link>
                )}
                <details className="relative">
                  <summary className="flex cursor-pointer list-none items-center gap-1 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600 hover:text-zinc-950 [&::-webkit-details-marker]:hidden">
                    <Globe size={14} aria-hidden />
                    Lang
                  </summary>
                  <div className="absolute inset-e-0 top-full z-100 mt-2 flex min-w-36 flex-col gap-0.5 border border-zinc-200 bg-white p-1 shadow-lg">
                    {localeOptions.map((locale) => (
                      <Link
                        key={locale.code}
                        href={`/${locale.code}`}
                        className="px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        {locale.label}
                      </Link>
                    ))}
                  </div>
                </details>
              </div>
            </nav>
          </div>
        </MotionHeader>

        <main className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-6 lg:px-8">
          <div className="border border-zinc-200 bg-white">
            {/* Hero + metrics */}
            <Reveal className={bentoRow} y={22}>
              <div className={`${colLeft} lg:col-span-8`}>
                <HeroStagger>
                  <HeroStaggerItem>
                    <SectionKicker>{dict.hero.live_registry}</SectionKicker>
                  </HeroStaggerItem>
                  <HeroStaggerItem>
                    <SectionTitle>{dict.hero.tagline}</SectionTitle>
                  </HeroStaggerItem>
                  <HeroStaggerItem>
                    <Separator className="my-4 bg-zinc-200" />
                  </HeroStaggerItem>
                  <HeroStaggerItem>
                    <p className="max-w-2xl text-pretty text-sm leading-relaxed text-zinc-600 sm:text-base">
                      {dict.hero.intro}
                    </p>
                  </HeroStaggerItem>
                </HeroStagger>
              </div>
              {reduceMotion ? (
                <div className={`${colRight} lg:col-span-4`}>
                  <SectionKicker>{dict.hero.weekly_downloads}</SectionKicker>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{downloads}</p>
                  <p className="mt-0.5 text-sm text-zinc-500">{dict.hero.per_week}</p>
                  <Separator className="my-4 bg-zinc-200" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                    {dict.install.quick_command}
                  </p>
                  <div className="mt-2">
                    <InstallCodeBlock
                      command={dict.hero.npx_command}
                      idleLabel={dict.copy_button.idle}
                      successLabel={dict.copy_button.success}
                    />
                  </div>
                </div>
              ) : (
                <m.div
                  className={`${colRight} lg:col-span-4`}
                  initial={{ opacity: 0, y: 26, x: 12 }}
                  animate={{ opacity: 1, y: 0, x: 0 }}
                  transition={{ duration: 0.58, ease: SITE_EASE, delay: 0.18 }}
                >
                  <SectionKicker>{dict.hero.weekly_downloads}</SectionKicker>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{downloads}</p>
                  <p className="mt-0.5 text-sm text-zinc-500">{dict.hero.per_week}</p>
                  <Separator className="my-4 bg-zinc-200" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                    {dict.install.quick_command}
                  </p>
                  <div className="mt-2">
                    <InstallCodeBlock
                      command={dict.hero.npx_command}
                      idleLabel={dict.copy_button.idle}
                      successLabel={dict.copy_button.success}
                    />
                  </div>
                </m.div>
              )}
            </Reveal>

            {/* Install + preview */}
            <Reveal className={bentoRow} delay={0.04} y={20}>
              <div className={`${colLeft} lg:col-span-5`}>
                <SectionTitle className="mb-3">{dict.install.title}</SectionTitle>
                <InstallToggle dict={dict} />
                <Separator className="my-4 bg-zinc-200" />
                <p className="text-sm leading-relaxed text-zinc-600">{dict.install.node_note}</p>
              </div>
              <div className={`${colRight} lg:col-span-7`}>
                <SectionTitle className="mb-1">{dict.preview.title}</SectionTitle>
                <p className="text-sm text-zinc-500">{dict.preview.caption}</p>
                <Separator className="my-4 bg-zinc-200" />
                <div className="min-h-[260px] sm:min-h-[300px] lg:min-h-[320px]">
                  <TerminalCard
                    dict={dict.terminal}
                    version={version}
                    copyLabels={dict.copy_button}
                  />
                </div>
              </div>
            </Reveal>

            {/* Why */}
            <Reveal className={bentoRow} delay={0.06} y={20}>
              <div id="reference" className={`${pad} scroll-mt-24 lg:col-span-12`}>
                <SectionKicker>{dict.navigation.reference}</SectionKicker>
                <SectionTitle>{dict.why.title}</SectionTitle>
                <Separator className="my-4 bg-zinc-200" />
                <StaggerList className="grid gap-2.5 text-sm leading-snug text-zinc-700 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-2">
                  {dict.why.items.map((item) => (
                    <StaggerItem key={item} className="flex gap-2.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 bg-zinc-400" aria-hidden />
                      <span>{item}</span>
                    </StaggerItem>
                  ))}
                </StaggerList>
              </div>
            </Reveal>

            {/* CLI + Generated */}
            <Reveal className={bentoRow} delay={0.08} y={18}>
              <div className={`${colLeft} lg:col-span-6`}>
                <SectionTitle className="mb-3">{dict.cli.section_title}</SectionTitle>
                <Accordion multiple className="w-full border-t border-zinc-200">
                  {dict.cli.items.map((item, i) => (
                    <AccordionItem key={item.title} value={`cli-${i}`} className="border-zinc-200">
                      <AccordionTrigger className="py-3 text-left text-sm font-semibold text-zinc-900 hover:no-underline">
                        {item.title}
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-4 text-zinc-600">
                        {item.paragraphs.map((p) => (
                          <p key={p} className="text-sm leading-relaxed">
                            {p}
                          </p>
                        ))}
                        <SnippetStack snippets={item.snippets} copyLabels={dict.copy_button} />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
              <div className={`${colRight} lg:col-span-6`}>
                <SectionTitle className="mb-3">{dict.generated.section_title}</SectionTitle>
                <Accordion multiple className="w-full border-t border-zinc-200">
                  {dict.generated.items.map((item, i) => (
                    <AccordionItem key={item.title} value={`gen-${i}`} className="border-zinc-200">
                      <AccordionTrigger className="py-3 text-left text-sm font-semibold text-zinc-900 hover:no-underline">
                        {item.title}
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-4 text-zinc-600">
                        {item.paragraphs.map((p) => (
                          <p key={p} className="text-sm leading-relaxed">
                            {p}
                          </p>
                        ))}
                        <SnippetStack snippets={item.snippets} copyLabels={dict.copy_button} />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </Reveal>

            {/* Detection + Configuration */}
            <Reveal className={bentoRow} delay={0.1} y={18}>
              <div className={`${colLeft} lg:col-span-6`}>
                <SectionTitle className="mb-3">{dict.detection.section_title}</SectionTitle>
                <Accordion multiple defaultValue={["hosting"]} className="w-full border-t border-zinc-200">
                  <AccordionItem value="hosting" className="border-zinc-200">
                    <AccordionTrigger className="py-3 text-left text-sm font-semibold text-zinc-900 hover:no-underline">
                      {dict.detection.hosting_title}
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pb-4 text-zinc-600">
                      <MotionTagList tags={dict.detection.hosting_tags} />
                      <Separator className="bg-zinc-200" />
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-900">
                          {dict.configuration.keys_title}
                        </h3>
                        <StaggerList className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {dict.configuration.keys.map((key) => (
                            <StaggerItem key={key} className="font-mono text-xs text-zinc-700">
                              {key}
                            </StaggerItem>
                          ))}
                        </StaggerList>
                      </div>
                      <Separator className="bg-zinc-200" />
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-900">
                          {dict.configuration.branches_title}
                        </h3>
                        <StaggerList className="mt-2 space-y-1.5 text-sm leading-snug text-zinc-600">
                          {dict.configuration.branches.map((line) => (
                            <StaggerItem key={line} className="flex gap-2">
                              <span className="text-zinc-400" aria-hidden>
                                —
                              </span>
                              {line}
                            </StaggerItem>
                          ))}
                        </StaggerList>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="frameworks" className="border-zinc-200">
                    <AccordionTrigger className="py-3 text-left text-sm font-semibold text-zinc-900 hover:no-underline">
                      {dict.detection.frameworks_title}
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <MotionTagList tags={dict.detection.frameworks_tags} />
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="testing" className="border-zinc-200">
                    <AccordionTrigger className="py-3 text-left text-sm font-semibold text-zinc-900 hover:no-underline">
                      {dict.detection.testing_title}
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <MotionTagList tags={dict.detection.testing_tags} />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
              <div className={`${colRight} lg:col-span-6`}>
                <SectionTitle className="mb-3">{dict.configuration.section_title}</SectionTitle>
                <p className="text-sm leading-relaxed text-zinc-600">{dict.configuration.intro}</p>
                <Separator className="my-4 bg-zinc-200" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                  {dict.configuration.example_caption}
                </p>
                <div className="mt-1.5">
                  <div className="flex min-h-12 items-stretch border border-zinc-200 bg-white">
                    {reduceMotion ? (
                      <pre className="min-w-0 flex-1 overflow-x-auto p-3 font-mono text-[11px] leading-snug text-zinc-900 whitespace-pre-wrap sm:text-xs">
                        <code>{dict.configuration.config_snippet}</code>
                      </pre>
                    ) : (
                      <m.pre
                        className="min-w-0 flex-1 overflow-x-auto p-3 font-mono text-[11px] leading-snug text-zinc-900 whitespace-pre-wrap sm:text-xs"
                        initial={{ opacity: 0, y: 14, scale: 0.99 }}
                        whileInView={{ opacity: 1, y: 0, scale: 1 }}
                        viewport={scrollViewport}
                        transition={{ duration: 0.55, ease: SITE_EASE }}
                      >
                        <code>{dict.configuration.config_snippet}</code>
                      </m.pre>
                    )}
                    <Separator orientation="vertical" className="h-auto bg-zinc-200" />
                    <div className="flex shrink-0 items-center px-1">
                      <CopyButton
                        text={dict.configuration.config_snippet}
                        idleLabel={dict.copy_button.idle}
                        successLabel={dict.copy_button.success}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Secrets + local checks (left) | Quality (right) */}
            <Reveal className={`${bentoRow} border-b-0`} delay={0.12} y={16}>
              <div className={`${colLeft} lg:col-span-6`}>
                <SectionTitle className="mb-3">{dict.secrets.section_title}</SectionTitle>
                <Separator className="mb-4 bg-zinc-200" />
                <p className="text-sm leading-relaxed text-zinc-600">{dict.secrets.body}</p>
                <Separator className="my-4 bg-zinc-200" />
                <h3 className="text-sm font-semibold text-zinc-900">{dict.quality.commands_title}</h3>
                <div className="mt-2 border border-zinc-200 bg-white">
                  {dict.quality.commands.map((cmd, i) => (
                    <div key={cmd}>
                      {i > 0 && <Separator className="bg-zinc-200" />}
                      <div className="flex min-h-11 items-stretch">
                        <pre className="min-w-0 flex-1 overflow-x-auto p-2.5 font-mono text-[11px] text-zinc-800 sm:text-xs">
                          <code>{cmd}</code>
                        </pre>
                        <Separator orientation="vertical" className="h-auto bg-zinc-200" />
                        <div className="flex shrink-0 items-center px-1">
                          <CopyButton
                            text={cmd}
                            idleLabel={dict.copy_button.idle}
                            successLabel={dict.copy_button.success}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-zinc-500">{dict.quality.repo_note}</p>
              </div>
              <div className={`${colRight} lg:col-span-6`}>
                <SectionTitle className="mb-3">{dict.quality.section_title}</SectionTitle>
                <p className="text-sm leading-snug text-zinc-600">{dict.quality.intro}</p>
                <Separator className="my-4 bg-zinc-200" />
                <StaggerList className="space-y-1.5 text-sm leading-snug text-zinc-700">
                  {dict.quality.items.map((item) => (
                    <StaggerItem key={item} className="flex gap-2">
                      <span className="text-zinc-400" aria-hidden>
                        ·
                      </span>
                      {item}
                    </StaggerItem>
                  ))}
                </StaggerList>
              </div>
            </Reveal>

            {/* Footer */}
            <Reveal className="border-t border-zinc-200" y={14} delay={0.02}>
              <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2 lg:gap-0 lg:px-8 lg:py-6">
                <div className="lg:pe-8">
                  <p className="text-sm font-semibold text-zinc-900">{dict.footer.license}</p>
                  <p className="mt-1.5 max-w-md text-sm leading-relaxed text-zinc-500">{dict.footer.tagline}</p>
                </div>
                <div className="lg:border-s lg:border-zinc-200 lg:ps-8">
                  <p className="text-sm text-zinc-600">
                    <span>{dict.footer.architect_credit} </span>
                    <a
                      href="https://www.edwinvakayil.info/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-zinc-950 underline-offset-4 hover:underline"
                    >
                      {dict.footer.architect_name}
                    </a>
                  </p>
                </div>
              </div>
              <Separator className="bg-zinc-200" />
              <p className="px-5 py-3 text-center text-xs text-zinc-400 sm:px-8">
                © {currentYear} {dict.footer.copyright_suffix}
              </p>
            </Reveal>
          </div>
        </main>
        </SiteMotionRoot>
      </div>
    </>
  );
}
