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
        style={{ height: "100dvh" }}
      >
        <NuqsAdapter>
<<<<<<< Updated upstream
          <div className="bg-gray-200 grid grid-rows-[auto,1fr] overflow-y-scroll h-full">
<<<<<<< Updated upstream
            <TopBar />
=======
            <div className="grid grid-cols-[1fr,auto] gap-2 px-4 py-2 md:py-3">
              <div className="flex gap-4 flex-col md:flex-row md:items-center ml-2">
                <a
                  href=""
                  rel="noopener noreferrer"
                  target="_blank"
                  className="flex items-center gap-2"
                >
                  <Image
                    src={logo}
                    alt="NoteDoctor.Ai Logo"
                    className="h-5 md:h-8 w-auto "
                  />
                  <span className="text-xs md:text-md text-black">NoteDoctor.Ai</span>
                </a>
              </div>

              <div className="flex justify-center"></div>
            </div>
=======
          <div className="bg-gradient grid grid-rows-[auto,1fr] overflow-y-scroll h-full">
            <TopBar />
>>>>>>> Stashed changes
>>>>>>> Stashed changes
            <div
              className="bg-gradient mx-0 relative grid rounded-1xl shadow-lg"
              style={{ overflowY: "hidden" }}
            >
              <NavbarMinimal />
              <div className="bg-gradient absolute inset-0 overflow-hidden flex flex-col justify-end md:justify-center align-items-center">
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
