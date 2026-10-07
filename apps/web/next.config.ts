import type { NextConfig } from 'next';

import { loadServerEnv } from './src/lib/server-env';

// Fails the build, or the start of the server, if the environment is incomplete.
loadServerEnv();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Keeps `next dev` from writing its own guidance files into the project.
  agentRules: false,
};

export default nextConfig;
