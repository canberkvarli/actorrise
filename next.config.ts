import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
        pathname: '/images/M/**',
      },
      {
        protocol: 'https',
        hostname: 'img.omdbapi.com',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/dashboard", destination: "/practice", permanent: true },
      { source: "/search", destination: "/monologues", permanent: true },
      { source: "/my-scripts", destination: "/practice", permanent: true },
      { source: "/my-monologues", destination: "/monologues", permanent: true },
      { source: "/scenes", destination: "/practice", permanent: true },
    ];
  },
};

export default nextConfig;