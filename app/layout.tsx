"use client";
import { Public_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import Image from "next/image";
import logo from "@/public/images/logo-main.svg";

import { NavbarMinimal } from "@/components/ui/navBar/NavbarMinimal";
import FlyoutForm from "@/components/ui/FlyoutForm";
import { Button } from "@/components/ui/button";
import * as React from "react";

const publicSans = Public_Sans({ subsets: ["latin"] });

export const Logo = () => (
  <Image src={logo} alt="NoteDoctor.Ai Logo" className="h-8 w-auto" />
);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [openSheet, setOpenSheet] = React.useState(false);
  return (
    <html lang="en">
      <head>
        <title>
          MediAuth Pro | AI-Powered Prior Authorization & Policy Lookup for
          Healthcare
        </title>
        <link rel="shortcut icon" href="/images/" />
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
        className={`${publicSans.className} overscroll-y-none`}
        style={{ overflow: "hidden" }}
      >
        <NuqsAdapter>
          <div className="bg-black grid grid-rows-[auto,1fr] overscroll-y-none h-[100vh]">
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
            <div
              className="bg-stone-950 mx-4 relative grid rounded-1xl  h-[90vh] shadow-lg"
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
