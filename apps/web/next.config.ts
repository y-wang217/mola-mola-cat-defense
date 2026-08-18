import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The sim ships as TypeScript source and is compiled by the app. It has no
  // build step of its own because it has no dependencies (CLAUDE.md §5).
  transpilePackages: ["@siege/sim"],

  // The sim uses standards-correct ESM specifiers ("./rng.js") so it can also
  // be run directly by Node — which §8's isomorphism test and the M2 server
  // side revalidation both need. Teach the bundlers to map them to source.
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
  },
};

export default nextConfig;
