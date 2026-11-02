import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type checking runs separately (`pnpm typecheck`, TypeScript 7), so the
  // build doesn't depend on Next's own TypeScript integration.
  typescript: { ignoreBuildErrors: true },
  // The review-save API builds paths under data/videos, which makes Next's
  // file tracing want to bundle every pipeline file (including source videos)
  // into the function. The deployed site never reads data/, and public/demo is
  // served as static files (on Vercel the API refuses before touching either).
  // (.env.local is kept out of deployments by scripts/deploy.sh, not here: the
  // Vercel builder lists .env files in the functions regardless of these excludes.)
  outputFileTracingExcludes: {
    "*": ["./data/**/*", "./public/demo/**/*", "./spike/**/*", "./scripts/**/*"],
  },
};

export default nextConfig;
