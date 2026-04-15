import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: {
    appIsrStatus: true,
  },
  // HMR 허용
  experimental: {
    allowedDevOrigins: ["1.235.196.133", "localhost:3000"]
  }
};

export default nextConfig;
