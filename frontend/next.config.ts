import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: [
    "localhost:3000",
    "192.168.0.103",
    "192.168.0.103:3000",
    "100.120.48.48",
    "100.120.48.48:3000"
  ],
};

export default nextConfig;
