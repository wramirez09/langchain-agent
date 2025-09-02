module.exports = {
  experimental: {
    runtime: "nodejs",
    missingSuspenseWithCSRBailout: false,
    transpilePackages: ["@react-pdf/renderer"],
    experimental: {
      esmExternals: "loose",
    },
  },
};

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});
module.exports = withBundleAnalyzer({});
