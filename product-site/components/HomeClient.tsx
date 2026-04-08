"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Box,
  Check,
  Globe,
  Package,
  Shield,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";

import CopyButton from "@/components/CopyButton";
import InstallToggle from "@/components/InstallToggle";
import TerminalCard from "@/components/TerminalCard";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/lib/dictionary-types";
import { motion } from "framer-motion";

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

const detectionPanels = [
  {
    id: "p1",
    idx: "S_01",
    name: "Firebase",
    signal: "firebase.json, firebase-tools dep",
    description:
      "Automatic Firebase Hosting detection with automated multi-project branch logic.",
    Icon: Package,
  },
  {
    id: "p2",
    idx: "S_02",
    name: "Vercel",
    signal: "vercel.json, .vercel dir, vercel dep",
    description:
      "Vercel deploy-gate generation with branch-aware environment provisioning.",
    Icon: Shield,
  },
  {
    id: "p3",
    idx: "S_03",
    name: "Netlify",
    signal: "netlify.toml, _redirects, netlify-cli dep",
    description:
      "Netlify edge detection with custom header and redirect validation.",
    Icon: Terminal,
  },
  {
    id: "p4",
    idx: "S_04",
    name: "GitHub Pages",
    signal: "gh-pages dep, github.io package.json",
    description:
      "Static site hosting recognition for the native GitHub Pages deployment service.",
    Icon: Globe,
  },
  {
    id: "p5",
    idx: "S_05",
    name: "AWS Cloud",
    signal: "serverless.yml, appspec.yml, cdk.json, aws-sdk dep",
    description:
      "Infrastructure-as-Code (IaC) recognition for AWS CDK, EC2, and Serverless.",
    Icon: Box,
  },
  {
    id: "p6",
    idx: "S_06",
    name: "GCP App Engine",
    signal: "app.yaml",
    description:
      "Automated deployment scanning for Google Cloud Platform App Engine targets.",
    Icon: Globe,
  },
  {
    id: "p7",
    idx: "S_07",
    name: "Azure",
    signal: "azure/pipelines.yml, @azure/* deps",
    description:
      "Azure App Service and native Azure pipeline definition identification.",
    Icon: Package,
  },
  {
    id: "p8",
    idx: "S_08",
    name: "Heroku",
    signal: "Procfile, heroku.yml",
    description:
      "Classic PaaS deployment via Heroku registry and git push logic.",
    Icon: Box,
  },
  {
    id: "p9",
    idx: "S_09",
    name: "Render / Railway",
    signal: "render.yaml, railway.json, railway.toml",
    description:
      "Modern PaaS detection utilizing automated app service descriptors.",
    Icon: Terminal,
  },
  {
    id: "p10",
    idx: "S_10",
    name: "Docker",
    signal: "Dockerfile, docker-compose.yml",
    description:
      "Containerization recognition with Buildx layer caching and GHCR authentication.",
    Icon: Box,
  },
] as const;

const frameworkCoverage = [
  "Next.js",
  "Nuxt",
  "SvelteKit",
  "Remix",
  "Astro",
  "Vite",
  "React",
  "Vue",
  "Angular",
  "Svelte",
  "Gatsby",
  "Express",
  "Fastify",
  "NestJS",
  "Hono",
  "Koa",
  "tRPC",
  "Django",
  "Flask",
  "FastAPI",
  "Ruby on Rails",
  "Spring Boot",
  "Laravel",
  "Go (gin)",
  "Rust (Cargo)",
] as const;

const testingTools = [
  "Jest",
  "Vitest",
  "Mocha",
  "Cypress",
  "Playwright",
  "Pytest",
  "RSpec",
  "Go Test",
  "Cargo Test",
  "PHPUnit",
  "JUnit/Maven",
  "Storybook",
] as const;

const exampleStacks = [
  {
    name: "Next.js + Vercel",
    description: "ci.yml (lint, test, build), deploy.yml (vercel deploy), security.yml",
  },
  {
    name: "React + Firebase",
    description:
      "ci.yml, deploy.yml (firebase deploy --only hosting), security.yml",
  },
  {
    name: "Node.js API + Docker",
    description: "ci.yml, docker.yml (GHCR push), security.yml",
  },
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

export default function HomeClient({
  dict,
  lang,
}: {
  dict: Dictionary;
  lang: string;
}) {
  const [version, setVersion] = useState("3.0.0");
  const [downloads, setDownloads] = useState("2.4k");

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
            setDownloads(count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count.toLocaleString());
          }
        }
      } catch (e) {
        console.error("Stats fetch error", e);
      }
    };

    void loadStats();
    return () => { cancelled = true; };
  }, []);

  const now = new Date();
  const manifestStamp = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, "0")}`;
  const currentYear = now.getFullYear();

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
            description: dict.hero.description,
            creator: {
              "@type": "Person",
              name: "Edwin Vakayil",
              url: "https://www.edwinvakayil.info/",
            },
            featureList: Object.values(dict.docs.capabilities).map((capability) => capability.label),
            keywords: "github actions, automation, ci/cd, devops, workflow generator, nextjs, docker, vercel, aws, firebase",
          }),
        }}
      />
      <div
        className="page-root relative flex min-h-screen flex-col overflow-x-hidden bg-white text-zinc-900 selection:bg-black selection:text-white"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0, 0, 0, 0.05) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      >
        <motion.nav
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-50 mx-auto w-full max-w-[1400px] bg-white/80 backdrop-blur-md"
        >
          <div className="grid grid-cols-1 border-x border-b border-zinc-100 md:grid-cols-12">
            <div className="flex items-center gap-3 border-b border-zinc-100 p-5 md:col-span-3 md:border-b-0 md:border-r md:p-6">
              <div className="flex items-center gap-2 text-[20px] font-bold tracking-tighter text-zinc-950">
                <Terminal size={18} className="text-zinc-500" />
                cistack
              </div>
              <span className="rounded-sm border border-zinc-100 bg-zinc-50 px-1.5 py-0.5 font-mono text-[12px] font-bold text-zinc-500">
                V{version}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-zinc-100 p-5 md:col-span-6 md:border-b-0 md:border-r md:p-6">
              <div className="flex items-center gap-6">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px] font-black uppercase leading-none tracking-[0.2em] text-zinc-500">
                    {dict.navigation.version}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    <span className="text-[12px] font-bold uppercase tracking-tighter text-zinc-600">
                      {dict.navigation.status}
                    </span>
                  </div>
                </div>
                <div className="mx-2 hidden h-6 w-px bg-zinc-100 lg:block" />
                <div className="hidden items-center gap-6 text-[12px] font-bold text-zinc-500 lg:flex">
                  <a
                    href="https://github.com/edwinvakayil/cistack"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-2 uppercase tracking-widest transition-colors hover:text-zinc-950"
                  >
                    <GithubIcon size={14} className="opacity-40 transition-opacity group-hover:opacity-100" />
                    {dict.navigation.repository}
                  </a>
                  <a
                    href="https://www.npmjs.com/package/cistack"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-2 uppercase tracking-widest transition-colors hover:text-zinc-950"
                  >
                    <Package size={14} className="opacity-40 transition-opacity group-hover:opacity-100" />
                    {dict.navigation.registry}
                  </a>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <Link
                  href="/en"
                  className={`rounded-sm border px-1.5 py-0.5 text-[12px] font-bold uppercase tracking-widest transition-colors ${
                    lang === "en"
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-transparent text-zinc-500 hover:border-zinc-100 hover:text-zinc-950"
                  }`}
                >
                  EN
                </Link>
                {lang !== "en" && (
                  <>
                    <div className="mx-0.5 h-3 w-px bg-zinc-100" />
                    <Link
                      href={`/${lang}`}
                      className="rounded-sm border border-zinc-950 bg-zinc-950 px-1.5 py-0.5 text-[12px] font-bold uppercase tracking-widest text-white"
                    >
                      {lang.toUpperCase()}
                    </Link>
                  </>
                )}

                <details className="group/lang relative ml-1 border-l border-zinc-100 pl-2">
                  <summary
                    aria-label="Change language"
                    className="flex list-none cursor-pointer items-center gap-1 py-1 text-[12px] font-bold uppercase tracking-[0.14em] text-zinc-600 transition-colors hover:text-zinc-950 [&::-webkit-details-marker]:hidden"
                  >
                    <Globe size={13} className="text-current" />
                    Lang
                  </summary>
                  <div className="absolute right-0 top-full z-[100] mt-2 flex w-32 flex-col gap-1 rounded-sm border border-zinc-200 bg-white p-1 shadow-xl">
                    {localeOptions.map((locale) => (
                      <Link
                        key={locale.code}
                        href={`/${locale.code}`}
                        className="rounded-sm p-2 text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950"
                      >
                        {locale.label}
                      </Link>
                    ))}
                  </div>
                </details>
              </div>
            </div>

            <div className="flex items-center justify-between gap-6 bg-zinc-50/20 p-5 md:col-span-3 md:justify-end md:p-6">
              <span className="font-mono text-[12px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                {`${dict.navigation.core_manifest} // ${manifestStamp}`}
              </span>
              <a
                href="#docs"
                className="rounded-sm border border-zinc-900 px-4 py-2 text-[12px] font-black uppercase tracking-widest text-zinc-900 transition-all hover:bg-zinc-950 hover:text-white"
              >
                {dict.navigation.docs}
              </a>
            </div>
          </div>
        </motion.nav>

        <main className="relative z-10 mx-auto w-full max-w-[1500px] px-4 pt-6 sm:px-6 md:px-8 lg:pt-12">
          <div className="pointer-events-none absolute inset-x-0 top-0 -mt-40 h-[600px] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] opacity-[0.35] [background-size:24px_24px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />

          <div className="relative grid grid-cols-1 border-l border-t border-zinc-100 bg-white/40 lg:grid-cols-12">
            <div className="group/hero relative border-b border-r border-zinc-100 p-8 sm:p-12 lg:col-span-7 lg:p-16">
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="relative z-10 flex flex-col gap-8"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className="rounded-sm border-zinc-200 bg-white px-2 py-0.5 text-[12px] font-black uppercase tracking-[0.2em] text-zinc-500"
                  >
                    VERSION_{version}
                  </Badge>
                  <div className="h-px w-12 bg-zinc-100" />
                  <span className="font-mono text-[12px] font-bold uppercase tracking-widest text-zinc-500">
                    {dict.hero.scan_identity}
                  </span>
                </div>

                <div className="flex flex-col gap-8 md:gap-8">
                  <div className="group/h1 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                    <span className="font-mono text-[12px] font-bold text-zinc-400 transition-colors sm:text-zinc-300 md:text-[12px] group-hover/h1:text-zinc-500">
                      {dict.hero.s1_label}
                    </span>
                    <h1 className="break-words text-[2.2rem] font-[1000] leading-[0.9] tracking-tighter text-black min-[400px]:text-[2.5rem] sm:leading-none md:text-[3.8rem]">
                      {dict.hero.s1_title}
                    </h1>
                  </div>

                  <div className="group/h2 flex flex-col gap-1 sm:ml-6 sm:flex-row sm:items-baseline sm:gap-4 md:ml-12">
                    <span className="font-mono text-[12px] font-bold text-zinc-400 transition-colors sm:text-zinc-300 md:text-[12px] group-hover/h2:text-zinc-500">
                      {dict.hero.s2_label}
                    </span>
                    <h2 className="break-words text-[2.2rem] font-[1000] leading-[0.9] tracking-tighter text-black min-[400px]:text-[2.5rem] sm:leading-none md:text-[3.8rem]">
                      {dict.hero.s2_title}
                    </h2>
                  </div>

                  <div className="group/h3 flex flex-col gap-1 sm:ml-12 sm:flex-row sm:items-baseline sm:gap-4 md:ml-24">
                    <span className="font-mono text-[12px] font-bold text-zinc-400 transition-colors sm:text-zinc-300 md:text-[12px] group-hover/h3:text-zinc-500">
                      {dict.hero.s3_label}
                    </span>
                    <h2 className="break-words text-[2.2rem] font-[1000] leading-[0.9] tracking-tighter text-zinc-500 min-[400px]:text-[2.5rem] sm:leading-none sm:text-zinc-500 md:text-[3.8rem]">
                      {dict.hero.s3_title}
                    </h2>
                  </div>
                </div>

                <p className="max-w-[540px] text-xs font-medium leading-relaxed text-zinc-500 sm:text-sm">
                  {dict.hero.description}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-6">
                  <CopyButton text={dict.hero.npx_command} variant="hero" />
                  <div className="flex flex-col gap-1 border-l-2 border-zinc-100 px-2">
                    <span className="text-[12px] font-black uppercase tracking-widest text-zinc-500">
                      {dict.hero.active_installs}
                    </span>
                    <span className="text-[14px] font-bold tracking-tight text-zinc-900">
                      {downloads} {dict.hero.per_week}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>

            <div className="flex flex-col border-b border-r border-zinc-100 lg:col-span-5">
              <div className="group/runtime flex flex-1 items-center justify-center overflow-hidden bg-zinc-50/20 p-8 transition-colors duration-700 hover:bg-zinc-50/40 sm:p-12">
                <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] opacity-[0.2] [background-size:16px_16px]" />
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                  className="relative z-20 w-full overflow-hidden rounded-sm"
                >
                  <TerminalCard dict={dict.terminal} version={version} />
                </motion.div>
                <div className="absolute right-8 top-6 hidden items-center gap-2 sm:flex">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  <span className="font-mono text-[12px] font-black uppercase tracking-widest text-zinc-500">
                    {dict.hero.realtime_synth}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 border-t border-zinc-100 bg-white">
                <div className="group/meta flex cursor-default flex-col gap-2 border-r border-zinc-100 p-8 transition-colors hover:bg-zinc-50/50">
                  <span className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-500 transition-colors group-hover/meta:text-zinc-700">
                    {dict.hero.integrations}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[20px] font-black leading-none text-zinc-900">30+</span>
                    <span className="text-[12px] font-bold uppercase tracking-tighter text-zinc-500">
                      {dict.hero.stack_aware}
                    </span>
                  </div>
                </div>
                <div className="group/meta flex cursor-default flex-col gap-2 bg-zinc-50/30 p-8 transition-colors hover:bg-zinc-50/60">
                  <span className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-500 transition-colors group-hover/meta:text-zinc-700">
                    {dict.hero.success_rate}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[20px] font-black leading-none tracking-tighter text-emerald-600">99.9%</span>
                    <Check size={14} className="text-emerald-500/50" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        <section id="docs" className="relative z-10 mx-auto w-full max-w-[1400px] px-4 py-24 pb-40 sm:px-6 md:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] opacity-[0.4] [background-size:32px_32px]" />

          <div className="mb-16 flex max-w-[900px] flex-col gap-4">
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="rounded-sm border-zinc-200 bg-white px-3 py-1 text-[12px] font-black uppercase tracking-[0.2em] text-zinc-700"
              >
                {dict.docs.badge}
                {version}
              </Badge>
              <div className="h-px flex-1 bg-zinc-200/60" />
            </div>
            <h2 className="text-[36px] font-bold leading-[1.1] tracking-tight text-zinc-900 sm:text-[44px]">
              {dict.docs.title_part1}
              <br />
              {dict.docs.title_part2}
            </h2>
            <p className="max-w-[760px] text-xs font-medium leading-relaxed text-zinc-500 sm:text-sm">
              {dict.docs.description}
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="grid grid-cols-1 border-l border-t border-zinc-100 lg:grid-cols-12"
          >
            <div className="group/cell relative border-b border-r border-zinc-100 bg-zinc-50/20 p-8 transition-colors duration-500 hover:bg-zinc-50/40 lg:col-span-4 lg:p-12">
              <div className="absolute right-4 top-4 font-mono text-[12px] font-bold text-zinc-500 transition-colors group-hover/cell:text-zinc-700">
                {dict.docs.section1_id}
              </div>
              <div className="flex flex-col gap-10">
                <div className="flex flex-col gap-2">
                  <span className="text-[12px] font-black uppercase tracking-[0.18em] text-zinc-500">
                    {dict.docs.section1_num}
                  </span>
                  <h3 className="text-[18px] font-bold text-zinc-900">{dict.docs.section1_title}</h3>
                </div>
                <div className="flex flex-col divide-y divide-zinc-200/40">
                  {Object.values(dict.docs.capabilities).map((item) => (
                    <div key={item.label} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                      <span
                        role="img"
                        aria-label="Available feature"
                        className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-zinc-200 bg-zinc-900 text-white"
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                      <div className="flex flex-col">
                        <span className="text-[14px] font-semibold leading-tight text-zinc-800">{item.label}</span>
                        <span className="mt-0.5 text-[12px] leading-snug text-zinc-500">{item.sub}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:col-span-8">
              <div className="border-b border-r border-zinc-100 p-8 lg:p-12">
                <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:gap-16">
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                      <span className="text-[12px] font-black uppercase tracking-[0.18em] text-zinc-500">
                        {dict.docs.section2_num}
                      </span>
                      <h3 className="text-[18px] font-bold text-zinc-900">{dict.docs.section2_title}</h3>
                    </div>
                    <InstallToggle dict={dict} />

                    <div className="mt-2 flex flex-col gap-3">
                      <span className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-500">
                        {dict.docs.command_registry}
                      </span>
                      <div className="flex flex-col gap-2">
                        {[
                          { command: "audit", description: dict.docs.commands.audit },
                          { command: "upgrade", description: dict.docs.commands.upgrade },
                          { command: "init", description: dict.docs.commands.init },
                        ].map((cmd) => (
                          <div
                            key={cmd.command}
                            className="group flex items-center justify-between rounded-sm border border-zinc-100 bg-zinc-50/50 px-3 py-2 transition-colors hover:border-zinc-200"
                          >
                            <code className="text-[12px] font-extrabold text-zinc-800">
                              npx cistack {cmd.command}
                            </code>
                            <span className="text-[12px] font-medium text-zinc-500">{cmd.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="text-[13px] italic text-zinc-400">{dict.docs.recommended_npx}</p>
                  </div>
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-500">
                        {dict.docs.parameters_manifest}
                      </span>
                      <div className="h-px flex-1 bg-zinc-200 opacity-60" />
                    </div>

                    <div className="flex flex-col divide-y divide-zinc-100 border-y border-zinc-200 bg-white/40">
                      {[
                        { flag: "--explain", type: "boolean", description: dict.docs.flags.explain },
                        { flag: "--path", type: "string", description: dict.docs.flags.path },
                        { flag: "--output", type: "string", description: dict.docs.flags.output },
                        { flag: "--dry-run", type: "boolean", description: dict.docs.flags.dry_run },
                        { flag: "--no-prompt", type: "boolean", description: dict.docs.flags.no_prompt },
                        { flag: "--verbose", type: "boolean", description: dict.docs.flags.verbose },
                        { flag: "--force", type: "boolean", description: dict.docs.flags.force },
                      ].map((flag) => (
                        <div
                          key={flag.flag}
                          className="group flex flex-col px-2 py-3 transition-colors hover:bg-zinc-50/80 md:flex-row md:items-center"
                        >
                          <div className="flex shrink-0 items-center gap-3 md:w-[150px]">
                            <div className="h-[12px] w-[3px] bg-zinc-200 transition-colors group-hover:bg-emerald-500" />
                            <code className="font-mono text-[12px] font-bold tracking-tight text-zinc-800">
                              {flag.flag}
                            </code>
                          </div>
                          <div className="mt-2 flex flex-1 flex-row items-center gap-4 pl-[15px] md:mt-0 md:pl-0">
                            <span className="rounded-sm bg-zinc-100 px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-widest text-zinc-600">
                              {flag.type}
                            </span>
                            <span className="text-[12px] font-medium text-zinc-600">{flag.description}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid flex-1 grid-cols-1 border-b border-r border-zinc-100 md:grid-cols-2">
                <div className="border-b border-zinc-100 p-8 md:border-b-0 md:border-r lg:p-12">
                  <div className="flex flex-col gap-8">
                    <div className="flex flex-col gap-2">
                      <h4 className="text-[14px] font-bold uppercase tracking-widest text-zinc-900">
                        {dict.docs.detection_logic_title}
                      </h4>
                      <p className="text-[13px] font-medium leading-relaxed text-zinc-400">
                        {dict.docs.detection_logic_desc}
                      </p>
                    </div>

                    <div className="max-h-[250px] w-full overflow-y-auto overflow-x-hidden pr-3 sm:max-h-[265px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-200 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-300 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1">
                      <div className="w-full">
                        {detectionPanels.map((panel) => (
                          <details key={panel.id} className="group border-b border-zinc-100 last:border-0">
                            <summary className="list-none cursor-pointer py-4 text-zinc-500 transition-colors hover:text-zinc-900 sm:py-5 [&::-webkit-details-marker]:hidden">
                              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 overflow-hidden text-start sm:gap-2">
                                <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                                  <span className="w-[24px] shrink-0 font-mono text-[12px] font-bold text-zinc-500 transition-colors group-hover:text-zinc-700">
                                    {panel.idx}
                                  </span>
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <panel.Icon
                                      size={14}
                                      className="shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-900"
                                    />
                                    <span className="text-[15px] font-semibold whitespace-nowrap sm:text-[16px]">
                                      {panel.name}
                                    </span>
                                  </div>
                                  <span className="ml-auto text-[12px] font-black uppercase tracking-[0.2em] text-zinc-500">
                                    OPEN
                                  </span>
                                </div>
                                <div className="flex w-full justify-start overflow-hidden ps-[36px] sm:ps-[44px]">
                                  <Badge
                                    variant="outline"
                                    className="max-w-full truncate rounded-sm border-zinc-200 bg-zinc-50/50 text-[12px] font-mono font-normal tracking-tight opacity-80"
                                  >
                                    {panel.signal}
                                  </Badge>
                                </div>
                              </div>
                            </summary>
                            <div className="border-s-2 border-zinc-200 pb-6 ps-6">
                              <p className="max-w-[440px] text-[15px] leading-relaxed text-zinc-500">{panel.description}</p>
                              <div className="mt-4 flex items-center gap-2">
                                <span className="text-[12px] font-bold uppercase tracking-widest text-zinc-500">
                                  {dict.docs.signal_source}
                                </span>
                                <code className="rounded-sm border border-zinc-100 bg-white px-2 py-0.5 font-mono text-[12px] text-zinc-600">
                                  {panel.signal}
                                </code>
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-10 bg-zinc-50/20 p-8 lg:p-12">
                  <div className="flex flex-col gap-6">
                    <h4 className="text-[14px] font-bold uppercase tracking-wider text-zinc-900">
                      {dict.docs.framework_coverage}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {frameworkCoverage.map((framework) => (
                        <Badge
                          key={framework}
                          variant="outline"
                          className="rounded-sm border-zinc-100 bg-white px-2 py-0.5 text-[12px] font-medium text-zinc-600"
                        >
                          {framework}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-6">
                    <h4 className="text-[14px] font-bold uppercase tracking-wider text-zinc-900">
                      {dict.docs.testing_tools}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {testingTools.map((tool) => (
                        <Badge
                          key={tool}
                          variant="secondary"
                          className="rounded-sm border-transparent bg-zinc-100 px-2 py-0.5 text-[12px] font-bold text-zinc-600"
                        >
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Workflow Outputs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="grid grid-cols-1 border-b border-e border-s border-zinc-100 lg:grid-cols-12"
          >
            <div className="group/artifacts border-e border-zinc-100 p-8 transition-colors duration-500 hover:bg-zinc-50/20 lg:col-span-8 lg:p-12">
              <div className="flex flex-col gap-10">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-black uppercase tracking-[0.18em] text-zinc-500">
                      {dict.docs.section4_num}
                    </span>
                    <Terminal size={14} className="text-zinc-400 transition-colors group-hover/artifacts:text-zinc-500" />
                  </div>
                  <h3 className="text-[18px] font-bold text-zinc-900">{dict.docs.section3_title}</h3>
                </div>
                <div className="grid grid-cols-1 gap-x-16 gap-y-12 md:grid-cols-2">
                  {[
                    { f: "ci.yml", l: dict.docs.workflows.ci.label, d: dict.docs.workflows.ci.desc },
                    { f: "deploy.yml", l: dict.docs.workflows.deploy.label, d: dict.docs.workflows.deploy.desc },
                    { f: "docker.yml", l: dict.docs.workflows.docker.label, d: dict.docs.workflows.docker.desc },
                    { f: "security.yml", l: dict.docs.workflows.security.label, d: dict.docs.workflows.security.desc },
                  ].map((wf) => (
                    <div key={wf.f} className="group/item flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <code className="rounded-sm border border-zinc-100 px-2.5 py-1 text-[14px] font-black leading-none text-zinc-800 transition-colors group-hover/item:border-zinc-200">
                            {wf.f}
                          </code>
                          <div className="h-[1px] flex-1 bg-zinc-100 transition-colors group-hover/item:bg-zinc-200" />
                        </div>
                        <span className="text-[12px] font-bold uppercase tracking-tight text-zinc-500">{wf.l}</span>
                      </div>
                      <p className="text-[14px] text-zinc-500 transition-colors leading-relaxed group-hover/item:text-zinc-600">
                        {wf.d}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:col-span-4">
              <div className="group relative flex-1 overflow-hidden bg-zinc-950 p-8 text-white lg:p-12">
                <div className="absolute end-0 top-0 -me-32 -mt-32 h-64 w-64 rounded-full bg-emerald-500/10 blur-[100px]" />
                <div className="relative z-10 flex flex-col gap-8">
                  <div className="flex flex-col gap-2">
                    <span className="text-[12px] font-black uppercase tracking-[0.18em] text-zinc-500">
                      {dict.docs.security_requirement}
                    </span>
                    <h4 className="text-[18px] font-bold">{dict.docs.encrypted_secrets}</h4>
                  </div>
                  <div className="flex flex-col gap-1">
                    {["VERCEL_TOKEN", "AWS_ACCESS_KEY", "FIREBASE_TOKEN", "GHCR_TOKEN"].map((token) => (
                      <div
                        key={token}
                        className="group/token flex items-center justify-between border-b border-white/5 py-3 transition-colors last:border-0"
                      >
                        <code className="text-[13px] font-mono text-zinc-400 transition-colors group-hover/token:text-white">
                          {token}
                        </code>
                        <Shield size={12} className="text-zinc-700 transition-colors group-hover/token:text-emerald-500" />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3">
                    <p className="border-l-2 border-emerald-500/30 py-2 pl-4 text-[13px] italic leading-relaxed text-zinc-500">
                      {dict.docs.add_secrets_at} <br />
                      <span className="font-bold not-italic tracking-tight text-zinc-300">
                        Settings → Secrets and variables → Actions
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.995 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="grid grid-cols-1 border-b border-l border-r border-zinc-100 bg-zinc-50/10 lg:grid-cols-12"
          >
            <div className="p-8 lg:col-span-12 lg:p-12">
              <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-2">
                  <span className="text-[12px] font-black uppercase tracking-[0.18em] text-zinc-500">
                    {dict.docs.section4_num}
                  </span>
                  <h3 className="text-[18px] font-bold text-zinc-900">{dict.docs.section4_title}</h3>
                </div>
                <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                  {exampleStacks.map((example) => (
                    <div
                      key={example.name}
                      className="flex cursor-default flex-col gap-3 rounded-sm border border-zinc-200/60 bg-white p-6 transition-all hover:shadow-xl hover:shadow-zinc-200/40"
                    >
                      <span className="text-[14px] font-black text-zinc-900">{example.name}</span>
                      <p className="text-[13px] font-medium leading-relaxed text-zinc-500">{example.description}</p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span className="font-mono text-[12px] font-bold uppercase tracking-widest text-zinc-500">
                          {dict.docs.validated_output}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <motion.footer
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2 }}
          className="relative z-20 border-t border-zinc-100 bg-white"
        >
          <div className="mx-auto max-w-[1400px] border-l border-r border-zinc-100">
            <div className="grid grid-cols-1 md:grid-cols-12">
              <div className="flex flex-col gap-6 border-b border-zinc-100 p-8 md:col-span-4 md:border-b-0 md:border-r">
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-500">
                    {dict.footer.project_origin}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[18px] font-bold tracking-tighter text-zinc-900">cistack</span>
                    <span className="rounded-sm border border-zinc-100 bg-zinc-50 px-1.5 py-0.5 font-mono text-[12px] font-bold text-zinc-500">
                      {`V_${version} // PRODUCTION`}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-500">
                    {dict.footer.architected_by}
                  </span>
                  <a
                    href="https://www.edwinvakayil.info/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-2 text-[14px] font-bold text-zinc-600 transition-colors hover:text-zinc-950"
                  >
                    Edwin Vakayil
                    <ArrowUpRight size={12} className="text-zinc-400 transition-colors group-hover:text-zinc-950" />
                  </a>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-8 border-b border-zinc-100 p-8 md:col-span-5 md:border-b-0 md:border-r">
                <div className="flex flex-wrap gap-x-8 gap-y-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-500">
                      {dict.footer.status}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                      <span className="text-[12px] font-bold text-zinc-700">{dict.footer.operational}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-500">
                      {dict.footer.license}
                    </span>
                    <span className="text-[12px] font-bold text-zinc-700 uppercase">{dict.footer.open_source}</span>
                  </div>
                </div>
                <p className="text-[12px] font-medium leading-relaxed text-zinc-500">{dict.footer.footer_desc}</p>
              </div>

              <div className="flex flex-col items-start justify-center gap-3 bg-zinc-50/30 p-8 md:col-span-3 md:items-end">
                <span className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-500">
                  {dict.footer.global_install}
                </span>
                <code className="cursor-default rounded-sm border border-zinc-100 bg-white px-3 py-1.5 font-mono text-[13px] font-bold text-zinc-800 transition-colors">
                  npm install -g cistack
                </code>
              </div>
            </div>

            <div className="flex flex-col items-center justify-between gap-4 border-t border-zinc-100 p-4 px-8 sm:flex-row">
              <span className="font-mono text-[12px] font-bold uppercase tracking-widest text-zinc-500">
                {`© ${currentYear} ${dict.footer.copyright}`}
              </span>
              <div className="flex items-center gap-6">
                <a
                  href="https://github.com/edwinvakayil/cistack"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-black uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-950"
                >
                  Github
                </a>
                <a
                  href="https://www.npmjs.com/package/cistack"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-black uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-950"
                >
                  Npm
                </a>
                <a
                  href="#docs"
                  className="text-[12px] font-black uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-950"
                >
                  {dict.navigation.docs}
                </a>
              </div>
            </div>
          </div>
        </motion.footer>
      </div>
    </>
  );
}
