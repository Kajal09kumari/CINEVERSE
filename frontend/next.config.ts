import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,

  /**
   * Allow Next.js <Image> to load images from Watchmode's CDNs
   * (Watchmode API returns both cdn.watchmode.com and image.tmdb.org URLs).
   */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.watchmode.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.watchmode.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
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
