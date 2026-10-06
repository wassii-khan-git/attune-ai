import type { NextConfig } from 'next';

import { loadServerEnv } from './src/lib/server-env';

// Fails the build, or the start of the server, if the environment is incomplete.
loadServerEnv();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
