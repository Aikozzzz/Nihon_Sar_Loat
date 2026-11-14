import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  agentRules: false,
  distDir: process.env.NIHON_BUILD_DIR || ".next",
  serverExternalPackages: ["kuromoji", "pg"],
};

export default config;
