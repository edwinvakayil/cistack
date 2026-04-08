"use client";

import { useEffect, useRef, useState } from "react";

type CopyButtonVariant = "hero" | "terminal";

interface CopyButtonProps {
  text: string;
  variant?: CopyButtonVariant;
  className?: string;
}

const copyLabels: Record<CopyButtonVariant, { idle: string; success: string }> = {
  hero: {
    idle: "COPY",
    success: "COPIED",
  },
  terminal: {
    idle: "Copy",
    success: "Copied",
  },
};

export default function CopyButton({
  text,
  variant = "hero",
  className = "",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Unable to copy command", error);
    }
  };

  if (variant === "terminal") {
    return (
      <button
        type="button"
        onClick={handleCopy}
        className={`text-[12px] font-semibold text-zinc-600 transition-colors hover:text-zinc-900 ${className}`}
        aria-label="Copy command"
      >
        {copied ? copyLabels.terminal.success : copyLabels.terminal.idle}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex h-auto items-center justify-between gap-6 rounded-sm border border-zinc-800 bg-zinc-950 px-6 py-3.5 text-[14px] text-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all hover:bg-black hover:shadow-zinc-300/50 ${className}`}
      aria-label="Copy install command"
    >
      <span className="font-mono font-bold tracking-tight text-emerald-400 transition-colors">
        {text}
      </span>
      <span className="ml-2 border-l border-zinc-800 pl-6 text-[12px] font-black uppercase tracking-[0.18em] text-zinc-300">
        {copied ? copyLabels.hero.success : copyLabels.hero.idle}
      </span>
    </button>
  );
}
