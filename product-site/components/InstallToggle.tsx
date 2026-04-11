"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { useState } from "react";

import CopyButton from "@/components/CopyButton";
import { Separator } from "@/components/ui/separator";
import type { Dictionary } from "@/lib/dictionary-types";

import { SITE_EASE } from "@/components/site-motion";

type InstallMode = "npx" | "npm";

const installCopy: Record<InstallMode, string> = {
  npx: "npx cistack",
  npm: "npm install -g cistack",
};

const installModes: Record<
  InstallMode,
  {
    badgeClassName: string;
    badgeLabel: keyof Dictionary["install_toggle"];
    description: keyof Dictionary["install_toggle"];
  }
> = {
  npx: {
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-800",
    badgeLabel: "recommended_badge",
    description: "npx_desc",
  },
  npm: {
    badgeClassName: "border-zinc-200 bg-zinc-50 text-zinc-700",
    badgeLabel: "global_badge",
    description: "npm_desc",
  },
};

export default function InstallToggle({ dict }: { dict: Dictionary }) {
  const [mode, setMode] = useState<InstallMode>("npx");
  const selectedMode = installModes[mode];
  const command = installCopy[mode];
  const reduce = useReducedMotion();

  return (
    <div className="flex flex-col gap-0">
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <m.button
          type="button"
          onClick={() => setMode("npx")}
          whileTap={reduce ? {} : { scale: 0.98 }}
          className={`text-sm font-semibold transition-colors ${
            mode === "npx" ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"
          }`}
        >
          npx
          {mode === "npx" && (
            <span className="ml-1.5 text-xs font-normal text-zinc-500">
              — {dict.install_toggle.recommended}
            </span>
          )}
        </m.button>
        <Separator orientation="vertical" className="h-4 bg-zinc-200" />
        <m.button
          type="button"
          onClick={() => setMode("npm")}
          whileTap={reduce ? {} : { scale: 0.98 }}
          className={`text-sm font-semibold transition-colors ${
            mode === "npm" ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"
          }`}
        >
          {dict.install_toggle.npm_global}
        </m.button>
        <m.span
          layout
          className={`ms-auto rounded-sm border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${selectedMode.badgeClassName}`}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
        >
          {dict.install_toggle[selectedMode.badgeLabel]}
        </m.span>
      </div>

      <Separator className="bg-zinc-200" />

      <m.div
        key={command}
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: SITE_EASE }}
        className="flex min-h-[3.25rem] items-stretch border bg-white"
      >
        <pre className="flex flex-1 items-center overflow-x-auto p-3 font-mono text-[13px] leading-snug text-zinc-900">
          <code>{command}</code>
        </pre>
        <Separator orientation="vertical" className="bg-zinc-200" />
        <div className="flex shrink-0 items-center px-3">
          <CopyButton
            text={command}
            idleLabel={dict.copy_button.idle}
            successLabel={dict.copy_button.success}
          />
        </div>
      </m.div>

      <Separator className="bg-zinc-200" />

      <div className="relative min-h-[4.5rem] overflow-hidden pt-4">
        <AnimatePresence mode="wait" initial={false}>
          <m.p
            key={mode}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: SITE_EASE }}
            className="text-sm leading-relaxed text-zinc-600"
          >
            {dict.install_toggle[selectedMode.description]}
          </m.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
