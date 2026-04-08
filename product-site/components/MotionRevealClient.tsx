"use client";

import type { ReactNode } from "react";
import { LazyMotion, domAnimation, m } from "framer-motion";

type MotionTag = "div" | "nav" | "footer";

interface MotionRevealClientProps {
  as?: MotionTag;
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  immediate?: boolean;
  initialScale?: number;
  initialY?: number;
}

const motionTags = {
  div: m.div,
  nav: m.nav,
  footer: m.footer,
} as const;

export default function MotionRevealClient({
  as = "div",
  children,
  className,
  delay = 0,
  duration = 0.8,
  immediate = false,
  initialScale = 1,
  initialY = 20,
}: MotionRevealClientProps) {
  const MotionTag = motionTags[as];
  const transition = { duration, delay };
  const target = { opacity: 1, y: 0, scale: 1 };

  return (
    <LazyMotion features={domAnimation}>
      <MotionTag
        className={className}
        initial={{ opacity: 0, y: initialY, scale: initialScale }}
        {...(immediate
          ? { animate: target }
          : { whileInView: target, viewport: { once: true, amount: 0.2 } })}
        transition={transition}
      >
        {children}
      </MotionTag>
    </LazyMotion>
  );
}
