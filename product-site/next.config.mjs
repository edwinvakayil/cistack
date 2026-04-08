import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    inlineCss: true,
    optimizePackageImports: ["@base-ui/react", "lucide-react"],
  },
};

export default nextConfig;
