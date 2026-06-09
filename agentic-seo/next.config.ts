import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Allow images from Supabase storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // Headers for SSE support
  async headers() {
    return [
      {
        source: '/api/chat',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-transform' },
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      },
    ]
  },
}

export default nextConfig
