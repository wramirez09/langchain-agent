const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  poweredByHeader: false,
  env: {
    // This makes the environment variables available in the browser
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_BASE_URL_PREVIEW: process.env.NEXT_PUBLIC_BASE_URL_PREVIEW,
    NEXT_PUBLIC_BASE_URL_PROD: process.env.NEXT_PUBLIC_BASE_URL_PROD,
  },
  
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
