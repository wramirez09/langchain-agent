import { Inter, Public_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

import { NavbarMinimal } from "@/components/ui/navBar/NavbarMinimal";
import * as React from "react";

import TopBar from "@/components/TopBar";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });
const publicSans = Public_Sans({ subsets: ["latin"], variable: '--font-public-sans' });

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${publicSans.variable} font-sans`}>
      <head>
        {/* Primary Meta Tags */}
        <title>MediAuth Pro | AI-Powered Prior Authorization & Policy Lookup for Healthcare</title>
        <meta name="title" content="MediAuth Pro | AI-Powered Prior Authorization & Policy Lookup for Healthcare" />
        <meta name="description" content="Streamline healthcare prior authorizations with MediAuth Pro. Our AI-powered platform provides instant Medicare NCD/LCD insights and Cigna policy guidance, simplifying approvals and reducing administrative burden for healthcare providers." />
        <meta name="keywords" content="healthcare, prior authorization, medicare, NCD, LCD, Cigna, policy lookup, AI healthcare, medical billing, insurance approval" />
        <meta name="author" content="MediAuth Pro" />
        <meta name="robots" content="index, follow" />
        <meta name="revisit-after" content="7 days" />
        <meta name="language" content="English" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* Favicon */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5" />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://preauthproduction.vercel.app/" />
        <meta property="og:title" content="MediAuth Pro | AI-Powered Prior Authorization & Policy Lookup for Healthcare" />
        <meta property="og:description" content="Streamline healthcare prior authorizations with MediAuth Pro. Our AI-powered platform provides instant Medicare NCD/LCD insights and Cigna policy guidance, simplifying approvals and reducing administrative burden for healthcare providers." />
        <meta property="og:image" content="https://preauthproduction.vercel.app/images/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="MediAuth Pro" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://preauthproduction.vercel.app/" />
        <meta name="twitter:title" content="MediAuth Pro | AI-Powered Prior Authorization & Policy Lookup for Healthcare" />
        <meta name="twitter:description" content="Streamline healthcare prior authorizations with MediAuth Pro. Our AI-powered platform provides instant Medicare NCD/LCD insights and Cigna policy guidance, simplifying approvals and reducing administrative burden for healthcare providers." />
        <meta name="twitter:image" content="https://preauthproduction.vercel.app/images/og-image.png" />
        <meta name="twitter:site" content="@medauthpro" />

        {/* Canonical URL */}
        <link rel="canonical" href="https://preauthproduction.vercel.app/" />

        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "MediAuth Pro",
            "url": "https://preauthproduction.vercel.app/",
            "description": "AI-Powered Prior Authorization & Policy Lookup for Healthcare",
            "applicationCategory": "HealthcareApplication",
            "operatingSystem": "Web",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD"
            },
            "provider": {
              "@type": "Organization",
              "name": "MediAuth Pro",
              "sameAs": [
                "https://twitter.com/medauthpro",
                "https://www.linkedin.com/company/medauthpro"
              ]
            },
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "4.8",
              "ratingCount": "124"
            }
          })}
        </script>

        {/* Additional Schema.org markup */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [{
              "@type": "ListItem",
              "position": 1,
              "name": "Home",
              "item": "https://preauthproduction.vercel.app/"
            }]
          })}
        </script>
      </head>
      <body style={{ height: "100dvh" }}>
        <NuqsAdapter>
          <div className="bg-gradient grid grid-rows-[auto,1fr] h-full">
            <TopBar />
            <div
              className="bg-gradient mx-0 relative grid rounded-1xl shadow-lg"
              style={{ overflowY: "hidden" }}
            >
              <NavbarMinimal />
              <div className="absolute inset-0 overflow-hidden flex flex-col justify-start md:justify-start align-items-center w-full">
                {children}
              </div>
            </div>
          </div>
          <Toaster />
        </NuqsAdapter>
      </body>
    </html>
  );
}
