import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};

export default nextConfig;
