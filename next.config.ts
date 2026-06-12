import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // Necesario para que el backend pueda arrancar procesos stdio (MCPs) en runtime
  serverExternalPackages: ["@modelcontextprotocol/sdk", "openai"],
};

export default config;
