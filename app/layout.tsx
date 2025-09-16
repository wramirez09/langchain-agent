
import { Public_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

import { NavbarMinimal } from "@/components/ui/navBar/NavbarMinimal";
import * as React from "react";

import TopBar from "@/components/TopBar";

const publicSans = Public_Sans({ subsets: ["latin"] });

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {


  return (
    <html lang="en">
      <head>

        <title>
          MediAuth Pro | AI-Powered Prior Authorization & Policy Lookup for
          Healthcare
        </title>
        <link rel="shortcut icon" href="/images/" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="Streamline healthcare prior authorizations with MediAuth Pro. Our AI-powered platform provides instant Medicare NCD/LCD insights and Cigna policy guidance, simplifying approvals and reducing administrative burden for providers."
        />
        <meta
          property="og:title"
          content="MediAuth Pro | AI-Powered Prior Authorization & Policy Lookup for Healthcare"
        />
        <meta
          property="og:description"
          content="Streamline healthcare prior authorizations with MediAuth Pro. Our AI-powered platform provides instant Medicare NCD/LCD insights and Cigna policy guidance, simplifying approvals and reducing administrative burden for providers."
        />
        <meta property="og:image" content="/images/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="MediAuth Pro | AI-Powered Prior Authorization & Policy Lookup for Healthcare"
        />
        <meta
          name="twitter:description"
          content="Streamline healthcare prior authorizations with MediAuth Pro. Our AI-powered platform provides instant Medicare NCD/LCD insights and Cigna policy guidance, simplifying approvals and reducing administrative burden for providers."
        />
        <meta name="twitter:image" content="/images/og-image.png" />
      </head>
      <body
        className={`${publicSans.className}`}
        style={{ height: "100dvh" }}
      >
        <NuqsAdapter>
          <div className="bg-gray-200 grid grid-rows-[auto,1fr] overflow-y-scroll h-full">
            <TopBar />
            <div
              className="bg-gray-100 mx-4 relative grid rounded-1xl  h-[90vh] shadow-lg"
              style={{ overflowY: "hidden" }}
            >
              <NavbarMinimal />
              <div className="absolute inset-0 overflow-hidden flex flex-col justify-end md:justify-center align-items-center">
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
