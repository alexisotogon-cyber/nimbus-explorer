const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

/** @type {import('next').NextConfig} */
module.exports = (phase) => ({
  // Development and production builds must never write into the same artifact
  // directory. A concurrent `next build` previously invalidated chunks used by
  // the live server and brought localhost:3000 down.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  experimental: {},
});
