"use client";

import { useEffect, useMemo, useState } from "react";
import { LazyMotion, domAnimation, m } from "framer-motion";
import { RefreshCcw } from "lucide-react";

import CopyButton from "@/components/CopyButton";
import type { Dictionary } from "@/lib/dictionary-types";

const COMMAND = "npx cistack";

interface OutputLine {
  text: string;
  type:
    | "success"
    | "info"
    | "heading"
    | "detail"
    | "merged"
    | "bullet"
    | "written"
    | "done"
    | "path"
    | "blank";
  delay: number;
}

const lineColor: Record<OutputLine["type"], string> = {
  success: "text-emerald-500",
  info: "text-zinc-700",
  heading: "font-bold text-zinc-900",
  detail: "text-zinc-700",
  merged: "text-amber-500",
  bullet: "font-medium text-zinc-600",
  written: "text-emerald-600",
  done: "font-bold text-zinc-950",
  path: "text-zinc-600",
  blank: "",
};

export default function TerminalCardMotion({
  dict,
  version,
}: {
  dict: Dictionary["terminal"];
  version: string;
}) {
  const [typedCommand, setTypedCommand] = useState("");
  const [visibleLines, setVisibleLines] = useState(0);
  const [phase, setPhase] = useState<"typing" | "output" | "done">("typing");
  const [animationKey, setAnimationKey] = useState(0);

  const outputLines = useMemo<OutputLine[]>(() => {
    return [
      { text: `  cistack v${version}`, type: "heading", delay: 100 },
      { text: `  ${"─".repeat(24)}`, type: "detail", delay: 200 },
      { text: "", type: "blank", delay: 250 },
      { text: dict.project_scanned || "Project scanned", type: "success", delay: 500 },
      { text: dict.stack_detected || "Stack detected", type: "success", delay: 800 },
      { text: "", type: "blank", delay: 850 },
      {
        text: `  ${dict.detected_stack || "Detected Stack"}`,
        type: "heading",
        delay: 1000,
      },
      { text: `  ${"─".repeat(48)}`, type: "detail", delay: 1100 },
      {
        text: `  ${dict.languages || "Languages:"}           TypeScript`,
        type: "info",
        delay: 1300,
      },
      {
        text: `  ${dict.frameworks || "Frameworks:"}          Next.js, React`,
        type: "info",
        delay: 1450,
      },
      { text: `  ${dict.hosting || "Hosting:"}             Vercel`, type: "info", delay: 1600 },
      { text: `  ${dict.testing || "Testing:"}             none`, type: "info", delay: 1750 },
      {
        text: `  ${dict.release_tool || "Release tool:"}        none`,
        type: "info",
        delay: 1900,
      },
      { text: "", type: "blank", delay: 1950 },
      {
        text:
          dict.look_correct ||
          "Does this look correct? Generate pipeline with these settings? Yes",
        type: "detail",
        delay: 2200,
      },
      {
        text: dict.generated_workflows || "Generated 3 CI workflow(s)",
        type: "success",
        delay: 2600,
      },
      {
        text: `  ${dict.smart_merged || "Smart-merged: ci.yml"}`,
        type: "merged",
        delay: 2800,
      },
      {
        text: `    • ${dict.updated_on || 'updated top-level "on"'}`,
        type: "bullet",
        delay: 2900,
      },
      {
        text: `    • ${dict.updated_concurrency || 'updated top-level "concurrency"'}`,
        type: "bullet",
        delay: 2950,
      },
      {
        text: `    • ${dict.added_lint || 'added job "lint"'}`,
        type: "bullet",
        delay: 3000,
      },
      {
        text: `    •   ${dict.updated_build || 'job "build" → updated "name"'}`,
        type: "bullet",
        delay: 3050,
      },
      {
        text: `    •   ${dict.updated_needs || 'job "build" → updated "needs"'}`,
        type: "bullet",
        delay: 3100,
      },
      {
        text: `    •   ${
          dict.added_checkout || 'job "build" → added step "Checkout code"'
        }`,
        type: "bullet",
        delay: 3150,
      },
      {
        text: `    •   ${dict.added_node || 'job "build" → added step "Set up Node.js"'}`,
        type: "bullet",
        delay: 3200,
      },
      {
        text: `    •   ${dict.updated_step_build || 'job "build" → updated step "Build"'}`,
        type: "bullet",
        delay: 3250,
      },
      {
        text: `    •   ${
          dict.added_upload || 'job "build" → added step "Upload build artifact"'
        }`,
        type: "bullet",
        delay: 3300,
      },
      {
        text: `  ✔ ${dict.written_deploy || "Written:      deploy.yml"}`,
        type: "written",
        delay: 3500,
      },
      {
        text: `  ✔ ${dict.written_security || "Written:      security.yml"}`,
        type: "written",
        delay: 3650,
      },
      {
        text: `  ✔ ${
          dict.written_dependabot || "Written:      .github/dependabot.yml"
        }`,
        type: "written",
        delay: 3800,
      },
      { text: "", type: "blank", delay: 3850 },
      {
        text: `  ${dict.done_msg || "Done! Your GitHub Actions pipeline is ready."}`,
        type: "done",
        delay: 4100,
      },
      {
        text: `   ${dict.workflows_path || "Workflows → cistack/.github/workflows"}`,
        type: "path",
        delay: 4300,
      },
      {
        text: `   ${
          dict.dependabot_path || "Dependabot → cistack/.github/dependabot.yml"
        }`,
        type: "path",
        delay: 4450,
      },
    ];
  }, [dict, version]);

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
    <LazyMotion features={domAnimation}>
      <div
        key={animationKey}
        className="flex h-[300px] w-full flex-col rounded-sm border border-zinc-100 bg-white sm:h-[350px] lg:h-[380px]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 bg-white px-4 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="font-mono text-[12px] font-black tracking-[0.18em] text-zinc-600 uppercase">
                TERMINAL
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 rounded-sm border border-zinc-200 bg-zinc-50 px-2.5 py-1">
              <span className="font-mono text-[13px] font-bold tracking-tight text-zinc-800">
                {COMMAND}
              </span>
              <div className="h-3 w-px bg-zinc-300" />
              <CopyButton text={COMMAND} variant="terminal" />
            </div>
            <m.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={handleReplay}
              className="rounded-sm border border-transparent p-1.5 text-zinc-500 transition-colors hover:border-zinc-200 hover:text-zinc-900"
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
    </LazyMotion>
  );
}
