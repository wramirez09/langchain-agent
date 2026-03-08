import type { Metadata } from "next";
import { Inter, Public_Sans, Outfit } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

import { NavbarMinimal } from "@/components/ui/navBar/NavbarMinimal";
import * as React from "react";

import TopBar from "@/components/TopBar";

const BASE_URL = "https://preauthproduction.vercel.app";

const SITE_NAME = "NoteDoctor.ai";
const DEFAULT_TITLE = "NoteDoctor.ai | Authorization Readiness Screening for Healthcare";
const DEFAULT_DESCRIPTION =
  "AI-powered authorization readiness screening that saves time, reduces errors, and ensures compliance for healthcare providers. Instant Medicare NCD/LCD insights and payer policy guidance.";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    "prior authorization",
    "authorization readiness",
    "healthcare AI",
    "Medicare NCD LCD",
    "Cigna policy",
    "medical billing",
    "insurance approval",
    "HIPAA compliant",
    "clinical documentation",
    "NoteDoctor",
  ],
  authors: [{ name: SITE_NAME }],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    url: BASE_URL,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: "/images/og-image.png", width: 1200, height: 630, alt: `${SITE_NAME} — Authorization Readiness Screening` }],
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ["/images/og-image.png"],
    site: "@notedoctorai",
  },
  alternates: {
    canonical: BASE_URL,
  },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#5bbad5" }],
  },
  other: {
    "revisit-after": "7 days",
    "mobile-web-app-capable": "yes",
  },
};

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  url: BASE_URL,
  description: DEFAULT_DESCRIPTION,
  applicationCategory: "HealthcareApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  provider: {
    "@type": "Organization",
    name: SITE_NAME,
    url: BASE_URL,
    sameAs: ["https://twitter.com/notedoctorai"],
  },
};

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Screen for Prior Authorization with NoteDoctor.ai",
  description: "Use NoteDoctor.ai to quickly assess authorization readiness before submitting a prior auth request.",
  step: [
    { "@type": "HowToStep", position: 1, name: "Sign in", text: "Log in to your NoteDoctor.ai account." },
    { "@type": "HowToStep", position: 2, name: "Describe the procedure", text: "Enter a generic description of the procedure or service — no patient PHI required." },
    { "@type": "HowToStep", position: 3, name: "Review AI guidance", text: "Receive instant Medicare NCD/LCD and payer policy insights." },
    { "@type": "HowToStep", position: 4, name: "Verify and submit", text: "Confirm findings against payer portal guidelines before submitting the authorization request." },
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is prior authorization screening?",
      acceptedAnswer: { "@type": "Answer", text: "Prior authorization screening assesses whether a procedure or service is likely to meet payer criteria before a formal authorization request is submitted, reducing claim denials and administrative burden." },
    },
    {
      "@type": "Question",
      name: "Is NoteDoctor.ai HIPAA compliant?",
      acceptedAnswer: { "@type": "Answer", text: "NoteDoctor.ai is designed for HIPAA compliance. Users should never enter patient-specific PHI into the system; only generic clinical descriptions are required." },
    },
    {
      "@type": "Question",
      name: "Which payers and policies does NoteDoctor.ai support?",
      acceptedAnswer: { "@type": "Answer", text: "NoteDoctor.ai provides guidance on Medicare National Coverage Determinations (NCDs), Local Coverage Determinations (LCDs), and Cigna commercial insurance policies." },
    },
    {
      "@type": "Question",
      name: "How accurate is the AI guidance?",
      acceptedAnswer: { "@type": "Answer", text: "NoteDoctor.ai leverages LLM-based agents trained on current policy documents. All results should be verified against the payer portal prior to submission." },
    },
  ],
};

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });
const publicSans = Public_Sans({ subsets: ["latin"], variable: '--font-public-sans' });
const outfit = Outfit({ subsets: ["latin"], variable: '--font-outfit' });

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${publicSans.variable} ${outfit.variable} font-sans`}>
      <body style={{ height: "100dvh" }}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
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
