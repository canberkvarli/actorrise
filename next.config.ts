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
      { source: "/my-scripts/:path*", destination: "/practice/:path*", permanent: true },
      { source: "/my-monologues", destination: "/monologues", permanent: true },
      { source: "/scenes", destination: "/practice", permanent: true },
      // Bio links. X's t.co shortener drops the query string off a profile
      // website, so the UTM has to be added on our side of the hop. Temporary
      // (302) on purpose: the tags can change without a cached 301 pinning them.
      { source: "/x", destination: "/?utm_source=x&utm_medium=bio", permanent: false },
      { source: "/ig", destination: "/?utm_source=instagram&utm_medium=bio", permanent: false },
      // The link in the triggered emails (backend/app/services/email/triggered.py).
      // They are plain text, so the address is read, and the checkout's own is
      // four parameters long. The email's ?e=<touch> rides through untouched.
      // 302 for the same reason as the bio links.
      {
        source: "/trial",
        destination: "/checkout?tier=plus&period=monthly&trial=1&from=email",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;