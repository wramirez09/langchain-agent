"use client";
import { Public_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import "@mantine/core/styles.css";
import Image from "next/image";
import logo from "@/public/images/logo-main.svg";

import { NavbarMinimal } from "@/components/ui/navBar/NavbarMinimal";

const publicSans = Public_Sans({ subsets: ["latin"] });

const Logo = () => <Image src={logo} alt="Agent Logo" className="h-8 w-auto" />;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" {...mantineHtmlProps} className="overscroll-y-none">
      <head>
        <title>
          MediAuth Pro | AI-Powered Prior Authorization & Policy Lookup for
          Healthcare
        </title>
        <link rel="shortcut icon" href="/images/" />
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
        <ColorSchemeScript />
      </head>
      <body className={`${publicSans.className} overscroll-y-none`}>
        <MantineProvider>
          <NuqsAdapter>
            <div className="bg-secondary grid grid-rows-[auto,1fr] h-[100dvh] overscroll-y-none">
              <div className="grid grid-cols-[1fr,auto] gap-2 p-4">
                <div className="flex gap-4 flex-col md:flex-row md:items-center ml-2">
                  <a
                    href=""
                    rel="noopener noreferrer"
                    target="_blank"
                    className="flex items-center gap-2"
                  >
                    <Logo />
                    NoteDoctorAi
                  </a>
                  <nav className="flex gap-1 flex-col md:flex-row">
                    {/* <ActiveLink href="/">🏴‍☠️ Chat</ActiveLink>
                    <ActiveLink href="/structured_output">
                      🧱 Structured Output
                    </ActiveLink>
                    <ActiveLink href="/agents">🦜 Agents</ActiveLink>
                    <ActiveLink href="/retrieval">🐶 Retrieval</ActiveLink>
                    <ActiveLink href="/retrieval_agents">
                      🤖 Retrieval Agents
                    </ActiveLink>
                    <ActiveLink href="/ai_sdk">
                      🌊 React Server Components
                    </ActiveLink>
                    <ActiveLink href="/langgraph">🕸️ LangGraph</ActiveLink> */}
                  </nav>
                </div>

                <div className="flex justify-center"></div>
              </div>
              <div className="bg-background mx-4 relative grid rounded-2xl border border-slate-50 overscroll-none h-[90vh] shadow-lg">
                <NavbarMinimal />
                <div className="absolute inset-0 overflow-hidden mb-6 h-100vh flex flex-col justify-end md:justify-center align-items-center">
                  {children}
                </div>
              </div>
            </div>
            <Toaster />
          </NuqsAdapter>
        </MantineProvider>
      </body>
    </html>
  );
}
