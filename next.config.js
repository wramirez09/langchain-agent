const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const isProd = process.env.NODE_ENV === "production";

// CSP: Next.js needs 'unsafe-inline' for runtime chunks and 'unsafe-eval' for
// some build artifacts. Stripe.js requires its own script/frame/connect hosts.
// Supabase is reached over both https and wss from the browser.
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://m.stripe.com https://m.stripe.network",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://m.stripe.com https://m.stripe.network",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://m.stripe.network",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives },
  // HSTS: only meaningful over HTTPS. Vercel terminates TLS in front, so
  // production responses are always HTTPS. 2 years + preload matches
  // browser preload-list requirements.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send origin only on cross-origin to avoid leaking path/query (which
  // could contain PHI-adjacent identifiers).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Modern browsers honor frame-ancestors from CSP; X-Frame-Options is
  // kept for older user agents.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  poweredByHeader: false,
  generateEtags: true,

  transpilePackages: ["@react-pdf/renderer"],

  serverExternalPackages: ["puppeteer", "playwright", "pdf-parse"],

  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=300", // 5 minutes
          },
          ...securityHeaders,
        ],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
