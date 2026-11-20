import path from "node:path";
import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:4000";
// Monorepo root, so standalone output and Turbopack can see packages/shared.
const workspaceRoot = path.resolve(process.cwd(), "..");

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  // Workspace package shipped as TypeScript source.
  transpilePackages: ["@ebook/shared"],
  turbopack: {
    root: workspaceRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  /**
   * The browser always talks to same-origin /api/*, so auth cookies are first-party.
   * In Docker, nginx routes /api before it reaches Next; locally this rewrite proxies to Express.
   */
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
