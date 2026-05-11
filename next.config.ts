import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
    proxyClientMaxBodySize: "25mb",
  },
  allowedDevOrigins: ["192.168.1.12"]
};

export default nextConfig;
