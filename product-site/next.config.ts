import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    inlineCss: true,
    optimizePackageImports: ["@base-ui/react", "lucide-react"],
  },
};

export default nextConfig;
