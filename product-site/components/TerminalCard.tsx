"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { Dictionary } from "@/lib/dictionary-types";

function TerminalCardFallback({ version, dict }: { version: string; dict: Dictionary["terminal"] }) {
  return (
    <div className="flex h-[300px] w-full flex-col border border-zinc-200 bg-white sm:h-[350px] lg:h-[380px]">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />
            <span className="text-[12px] font-bold tracking-[0.14em] text-zinc-600 uppercase">
              {dict?.processing || "Processing Output..."}
            </span>
          </div>
        </div>
        <div className="rounded-sm border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-mono text-[13px] font-bold tracking-tight text-zinc-800">
          npx cistack
        </div>
      </div>

      <div
        className="flex-1 bg-white p-6 pt-4 font-mono text-[12px] leading-relaxed tracking-tight text-zinc-700 sm:text-[13px]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="font-bold text-zinc-600">$</span>
          <span className="font-bold text-zinc-900">npx cistack</span>
          <span className="inline-block h-4 w-1.5 animate-pulse bg-emerald-600" />
        </div>
        <div className="space-y-1">
          <div className="font-bold text-zinc-900">cistack v{version}</div>
          <div>{dict.project_scanned}</div>
          <div>{dict.stack_detected}</div>
          <div>
            {dict.detected_stack}: Next.js, React, TypeScript
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TerminalCard({
  dict,
  version = "3.0.0",
  copyLabels,
}: {
  dict: Dictionary["terminal"];
  version?: string;
  copyLabels: { idle: string; success: string };
}) {
  const TerminalCardMotion = useMemo(
    () =>
      dynamic(() => import("@/components/TerminalCardMotion"), {
        ssr: false,
        loading: () => <TerminalCardFallback version={version} dict={dict} />,
      }),
    [version, dict]
  );

  return <TerminalCardMotion dict={dict} version={version} copyLabels={copyLabels} />;
}
