import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  agentRules: false,
  distDir: process.env.NIHON_BUILD_DIR || ".next",
  serverExternalPackages: ["kuromoji", "pg"],
  outputFileTracingIncludes: {
    "/api/\\[action\\]": ["./node_modules/kuromoji/dict/*.dat.gz"],
  },
};

export default config;
