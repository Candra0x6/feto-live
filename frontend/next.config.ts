import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use "dist" as output dir to match Vercel project settings
  distDir: "dist",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
