import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ship the read-only tracker copy with the API route on Vercel.
  outputFileTracingIncludes: {
    "/api/brief": ["./data/tracker.db"],
  },
};

export default nextConfig;
