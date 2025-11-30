const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  poweredByHeader: false,

  
  transpilePackages: ["@react-pdf/renderer"],
  
  serverExternalPackages: [
    "puppeteer",
    "playwright", 
    "pdf-parse"
  ],
  
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=300, s-maxage=300', // 5 minutes
          },
        ],
      },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
