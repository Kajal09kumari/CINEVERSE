import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,

  /**
   * Allow Next.js <Image> to load images from TMDB's CDN.
   * Without this, any <Image src="https://image.tmdb.org/..." /> will throw
   * a configuration error at runtime.
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
