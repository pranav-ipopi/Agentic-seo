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
  // Suppress sourcemap warnings from node_modules
  webpack(config) {
    config.module.rules.push({
      test: /\.js$/,
      enforce: 'pre',
      use: ['source-map-loader'],
      exclude: /node_modules/,
    })
    return config
  },
}

export default nextConfig
