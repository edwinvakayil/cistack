import type { MetadataRoute } from "next";

import { DEFAULT_LOCALE, SITE_URL } from "@/lib/site-config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "cistack — GitHub Actions CI/CD generator",
    short_name: "cistack",
    description:
      "Scan your repository and generate production-ready GitHub Actions workflows, Dependabot config, and deployment pipelines.",
    start_url: `/${DEFAULT_LOCALE}`,
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#09090b",
    categories: ["developer", "productivity", "utilities"],
    lang: DEFAULT_LOCALE,
    icons: [
      {
        src: `${SITE_URL}/favicon.ico`,
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
