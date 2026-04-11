"use client";

import {
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import type { ReactNode } from "react";

export const SITE_EASE = [0.22, 1, 0.36, 1] as const;

export const scrollViewport = {
  once: true,
  margin: "-10% 0px -6% 0px",
  amount: 0.15,
} as const;

export function SiteMotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}

export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={scrollViewport}
      transition={{ duration: 0.62, ease: SITE_EASE, delay }}
    >
      {children}
    </m.div>
  );
}

export function MotionHeader({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <header className={className}>{children}</header>;
  }
  return (
    <m.header
      className={className}
      initial={{ opacity: 0, y: -18, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.52, ease: SITE_EASE }}
    >
      {children}
    </m.header>
  );
}

const heroStagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.06 },
  },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: SITE_EASE },
  },
};

export function HeroStagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <m.div
      className={className}
      variants={heroStagger}
      initial="hidden"
      animate="show"
    >
      {children}
    </m.div>
  );
}

export function HeroStaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <m.div className={className} variants={heroItem}>
      {children}
    </m.div>
  );
}

const listStagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
};

const listItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: SITE_EASE },
  },
};

export function StaggerList({
  children,
  className,
  as: Component = "ul",
}: {
  children: ReactNode;
  className?: string;
  as?: "ul" | "ol" | "div";
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Tag = Component;
    return <Tag className={className}>{children}</Tag>;
  }
  const MotionTag = Component === "ul" ? m.ul : Component === "ol" ? m.ol : m.div;
  return (
    <MotionTag
      className={className}
      variants={listStagger}
      initial="hidden"
      whileInView="show"
      viewport={scrollViewport}
    >
      {children}
    </MotionTag>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <li className={className}>{children}</li>;
  }
  return (
    <m.li className={className} variants={listItem}>
      {children}
    </m.li>
  );
}

const tagContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.035, delayChildren: 0.02 },
  },
};

const tagItem: Variants = {
  hidden: { opacity: 0, scale: 0.85, y: 6 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 380, damping: 22 },
  },
};

export function MotionTagList({ tags }: { tags: readonly string[] }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700"
          >
            {tag}
          </span>
        ))}
      </div>
    );
  }
  return (
    <m.div
      className="flex flex-wrap gap-1.5"
      variants={tagContainer}
      initial="hidden"
      whileInView="show"
      viewport={scrollViewport}
    >
      {tags.map((tag) => (
        <m.span
          key={tag}
          variants={tagItem}
          className="inline-flex border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700"
          whileHover={{ y: -2, borderColor: "rgb(24 24 27)", transition: { duration: 0.2 } }}
        >
          {tag}
        </m.span>
      ))}
    </m.div>
  );
}

export { m };
