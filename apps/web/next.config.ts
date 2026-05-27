import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // SSR-first: no static export
  output: undefined,

  // Strict React mode for development
  reactStrictMode: true,

  // Minimize client-side JS per ERP spec
  experimental: {
    // optimizePackageImports reduces bundle size
    optimizePackageImports: ['@xtechs/shared'],
  },

  // Server connects to Fastify backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/:path*',
      },
    ];
  },
};

export default nextConfig;
