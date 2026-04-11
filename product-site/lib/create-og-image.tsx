import { ImageResponse } from "next/og";

import type { Dictionary } from "@/lib/dictionary-types";

import { truncateMetaDescription } from "@/lib/seo";

export const OG_SIZE = { width: 1200, height: 630 } as const;

export function createCistackOgImage(dict: Dictionary) {
  const subtitle = truncateMetaDescription(dict.hero.tagline, 120);

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#fafafa",
          padding: 72,
          borderBottom: "4px solid #18181b",
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: "#09090b",
            letterSpacing: "-0.02em",
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
          }}
        >
          {dict.hero.product_name}
        </div>
        <div
          style={{
            fontSize: 30,
            lineHeight: 1.35,
            color: "#3f3f46",
            marginTop: 20,
            maxWidth: 980,
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
          }}
        >
          {subtitle}
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 18,
            color: "#71717a",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          }}
        >
          npm · GitHub Actions · CI/CD
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
