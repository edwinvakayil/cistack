"use client";

import { useState } from "react";

import type { Dictionary } from "@/lib/dictionary-types";

type InstallMode = "npx" | "npm";

const installModes: Record<
  InstallMode,
  {
    command: string;
    badgeClassName: string;
    badgeLabel: keyof Dictionary["install_toggle"];
    description: keyof Dictionary["install_toggle"];
  }
> = {
  npx: {
    command: "$ npx cistack",
    badgeClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
    badgeLabel: "recommended_badge",
    description: "npx_desc",
  },
  npm: {
    command: "$ npm install -g cistack",
    badgeClassName: "border-zinc-700 bg-zinc-500/10 text-zinc-400",
    badgeLabel: "global_badge",
    description: "npm_desc",
  },
};

export default function InstallToggle({ dict }: { dict: Dictionary }) {
  const [mode, setMode] = useState<InstallMode>("npx");
  const selectedMode = installModes[mode];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setMode("npx")}
          className={`py-1 pr-4 text-[12px] font-semibold transition-colors ${
            mode === "npx" ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"
          }`}
        >
          npx
          {mode === "npx" && (
            <span className="ml-1.5 text-[11px] font-normal text-zinc-400">
              {" "}
              - {dict.install_toggle.recommended}
            </span>
          )}
        </button>
        <div className="h-3.5 w-px bg-zinc-200" />
        <button
          type="button"
          onClick={() => setMode("npm")}
          className={`py-1 pl-4 text-[12px] font-semibold transition-colors ${
            mode === "npm" ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"
          }`}
        >
          {dict.install_toggle.npm_global}
        </button>
      </div>

      <div className="relative overflow-hidden rounded-sm bg-zinc-950 px-6 pt-5 pb-6 font-mono text-sm text-zinc-300">
        <div className="mb-5 flex items-center justify-between">
          <span
            className={`px-2 py-0.5 text-[12px] font-black uppercase tracking-widest ${selectedMode.badgeClassName}`}
          >
            {dict.install_toggle[selectedMode.badgeLabel]}
          </span>
          <span className="text-[12px] font-black uppercase tracking-[0.2em] text-zinc-700">
            {mode}
          </span>
        </div>
        <code className="text-[15px] tracking-tight text-emerald-400">
          {selectedMode.command}
        </code>
        <div className="my-4 h-px w-full bg-zinc-800" />
        <p className="font-sans text-[12px] leading-relaxed text-zinc-500">
          {dict.install_toggle[selectedMode.description]}
        </p>
      </div>
    </div>
  );
}
