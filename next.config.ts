import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // HMR 허용
  allowedDevOrigins: ["1.235.196.133", "localhost:3000"]
};

export default nextConfig;
