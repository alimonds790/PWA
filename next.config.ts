import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Invariant #1: no image/file storage — also disable Next's remote image
  // optimization surface entirely.
  images: { unoptimized: true },
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
