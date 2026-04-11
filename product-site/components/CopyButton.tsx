"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const iconClass = "h-4 w-4 shrink-0";

interface CopyButtonProps {
  text: string;
  className?: string;
  idleLabel?: string;
  successLabel?: string;
}

export default function CopyButton({
  text,
  className = "",
  idleLabel = "Copy",
  successLabel = "Copied",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const reduce = useReducedMotion();

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
      console.error("Unable to copy text", error);
    }
  };

  const label = copied ? successLabel : idleLabel;
  const tap = reduce ? {} : { scale: 0.92 };
  const hover = reduce ? {} : { scale: 1.06 };

  return (
    <m.button
      type="button"
      onClick={handleCopy}
      whileTap={tap}
      whileHover={hover}
      transition={{ type: "spring", stiffness: 520, damping: 28 }}
      className={`flex h-9 w-9 shrink-0 items-center justify-center text-zinc-500 transition-colors hover:text-zinc-900 ${className}`}
      aria-label={label}
      title={label}
    >
      <span className="relative flex h-4 w-4 items-center justify-center">
        {reduce ? (
          copied ? (
            <Check className={`${iconClass} text-emerald-600`} aria-hidden strokeWidth={2.25} />
          ) : (
            <Copy className={iconClass} aria-hidden strokeWidth={2} />
          )
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <m.span
                key="check"
                initial={{ opacity: 0, scale: 0.35, rotate: -50 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.75 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className="absolute inset-0 flex items-center justify-center text-emerald-600"
              >
                <Check className={iconClass} aria-hidden strokeWidth={2.25} />
              </m.span>
            ) : (
              <m.span
                key="copy"
                initial={{ opacity: 0, scale: 0.75 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <Copy className={iconClass} aria-hidden strokeWidth={2} />
              </m.span>
            )}
          </AnimatePresence>
        )}
      </span>
    </m.button>
  );
}
