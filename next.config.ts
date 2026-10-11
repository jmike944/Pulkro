import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Keeps navigations / server actions pending while offline and retries on reconnect.
    // Exposes `useOffline()` from "next/offline" for connectivity-aware UI.
    useOffline: true,
    // Pages render from on-device data after hydration, so only validate segments that opt in.
    instantInsights: { validationLevel: "manual-warning" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          // The worker itself fetches (and caches) the OpenFreeMap tiles/styles: without connect-src they were blocked by default-src.
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; connect-src 'self' https://tiles.openfreemap.org" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
