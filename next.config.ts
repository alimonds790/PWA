import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Invariant #1: no image/file storage — also disable Next's remote image
  // optimization surface entirely.
  images: { unoptimized: true },
  // Ship the SQL migration files with every serverless function so the
  // boot-time auto-migrate (src/instrumentation.ts) finds them on Vercel.
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**"],
    "/**": ["./drizzle/**"],
  },
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
  ],
};

export default nextConfig;
