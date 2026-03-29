import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/auth/login", "/auth/sign-up"],
        disallow: ["/api/", "/protected/", "/pdf/", "/auth/confirm/", "/auth/update-password/"],
      },
    ],
    sitemap: "https://app.notedoctor.ai/sitemap.xml",
  };
}
