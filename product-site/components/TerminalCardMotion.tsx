"use client";

import { useEffect, useMemo, useState } from "react";
import { m } from "framer-motion";
import { RefreshCcw } from "lucide-react";

import CopyButton from "@/components/CopyButton";
import {
  buildTerminalDemoLines,
  type TerminalDemoLine,
} from "@/components/terminal-demo-content";
import { Separator } from "@/components/ui/separator";
import type { Dictionary } from "@/lib/dictionary-types";

const COMMAND = "npx cistack";

const lineColor: Record<TerminalDemoLine["type"], string> = {
  success: "text-emerald-500",
  info: "text-zinc-700",
  heading: "font-bold text-zinc-900",
  detail: "text-zinc-500",
  question: "text-zinc-700",
  written: "text-emerald-600",
  done: "font-bold text-zinc-950",
  path: "text-zinc-600",
  blank: "",
};

export default function TerminalCardMotion({
  dict,
  version,
  copyLabels,
}: {
  dict: Dictionary["terminal"];
  version: string;
  copyLabels: { idle: string; success: string };
}) {
  const [typedCommand, setTypedCommand] = useState("");
  const [visibleLines, setVisibleLines] = useState(0);
  const [phase, setPhase] = useState<"typing" | "output" | "done">("typing");
  const [animationKey, setAnimationKey] = useState(0);

  const outputLines = useMemo(() => buildTerminalDemoLines(version), [version]);

  useEffect(() => {
    if (phase !== "typing") {
      return;
    }

    if (typedCommand.length < COMMAND.length) {
      const timeout = window.setTimeout(() => {
        setTypedCommand(COMMAND.slice(0, typedCommand.length + 1));
      }, 60 + Math.random() * 60);

      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => setPhase("output"), 400);
    return () => window.clearTimeout(timeout);
  }, [typedCommand, phase, animationKey]);

  useEffect(() => {
    if (phase !== "output") {
      return;
    }

    if (visibleLines >= outputLines.length) {
      const timeout = window.setTimeout(() => setPhase("done"), 0);
      return () => window.clearTimeout(timeout);
    }

    const currentDelay =
      outputLines[visibleLines].delay -
      (visibleLines > 0 ? outputLines[visibleLines - 1].delay : 0);
    const timeout = window.setTimeout(() => {
      setVisibleLines((current) => current + 1);
    }, Math.max(currentDelay, 30));

    return () => window.clearTimeout(timeout);
  }, [visibleLines, phase, outputLines]);

  const handleReplay = () => {
    setTypedCommand("");
    setVisibleLines(0);
    setPhase("typing");
    setAnimationKey((current) => current + 1);
  };

  return (
    <div
      key={animationKey}
      className="flex h-[300px] w-full flex-col border border-zinc-200 bg-white sm:h-[350px] lg:h-[380px]"
    >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="font-mono text-[12px] font-black tracking-[0.18em] text-zinc-600 uppercase">
                {dict.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0 border border-zinc-200 bg-white">
              <span className="px-2.5 py-1 font-mono text-[13px] font-bold tracking-tight text-zinc-800">
                {COMMAND}
              </span>
              <Separator orientation="vertical" className="h-6 bg-zinc-200" />
              <div className="px-2">
                <CopyButton
                  text={COMMAND}
                  idleLabel={copyLabels.idle}
                  successLabel={copyLabels.success}
                />
              </div>
            </div>
            <m.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={handleReplay}
              className="border border-transparent p-1.5 text-zinc-500 transition-colors hover:border-zinc-200 hover:text-zinc-900"
              aria-label="Replay terminal animation"
            >
              <RefreshCcw size={14} />
            </m.button>
          </div>
        </div>

        <div
          className="custom-scrollbar flex-1 overflow-y-auto bg-white p-6 pt-4 font-mono text-[12px] leading-relaxed tracking-tight selection:bg-zinc-900 selection:text-white sm:text-[13px]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <div className="flex flex-col gap-1.5">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-bold text-zinc-600">$</span>
              <span className="font-bold text-zinc-900">{typedCommand}</span>
              {phase === "typing" && (
                <m.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.8, repeat: Number.POSITIVE_INFINITY }}
                  className="inline-block h-4 w-1.5 bg-emerald-500"
                />
              )}
            </div>

            {phase !== "typing" && (
              <div className="space-y-0.5">
                {outputLines.slice(0, visibleLines).map((line, index) => (
                  <m.div
                    key={`${animationKey}-${index}`}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`whitespace-pre-wrap break-words ${lineColor[line.type]}`}
                    style={{
                      minHeight: line.type === "blank" ? "0.75rem" : undefined,
                    }}
                  >
                    {line.text}
                  </m.div>
                ))}
                {phase === "output" && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-3 w-1 animate-pulse bg-zinc-300" />
                    <span className="text-[12px] font-bold tracking-[0.14em] text-zinc-600 uppercase">
                      {dict.processing || "Processing Output..."}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
  );
}
