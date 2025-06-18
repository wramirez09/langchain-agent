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
        <title>LangChain + Next.js Template</title>
        <link rel="shortcut icon" href="/images/favicon.ico" />
        <meta
          name="description"
          content="Starter template showing how to use LangChain in Next.js projects. See source code and deploy your own at https://github.com/langchain-ai/langchain-nextjs-template!"
        />
        <meta property="og:title" content="LangChain + Next.js Template" />
        <meta
          property="og:description"
          content="Starter template showing how to use LangChain in Next.js projects. See source code and deploy your own at https://github.com/langchain-ai/langchain-nextjs-template!"
        />
        <meta property="og:image" content="/images/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="LangChain + Next.js Template" />
        <meta
          name="twitter:description"
          content="Starter template showing how to use LangChain in Next.js projects. See source code and deploy your own at https://github.com/langchain-ai/langchain-nextjs-template!"
        />
        <meta name="twitter:image" content="/images/og-image.png" />
        <ColorSchemeScript />
      </head>
      <body className={`${publicSans.className} overscroll-y-none`}>
        <MantineProvider>
          <NuqsAdapter>
            <div className="bg-secondary grid grid-rows-[auto,1fr] h-[100dvh] overscroll-y-none">
              <div className="grid grid-cols-[1fr,auto] gap-2 p-4">
                <div className="flex gap-4 flex-col md:flex-row md:items-center">
                  <a
                    href="https://js.langchain.com"
                    rel="noopener noreferrer"
                    target="_blank"
                    className="flex items-center gap-2"
                  >
                    <Logo />
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
              <div className="bg-background mx-4 relative grid rounded-t-2xl border border-input border-b-0 overscroll-none">
                <NavbarMinimal />
                <div className="absolute inset-0">{children}</div>
              </div>
            </div>
            <Toaster />
          </NuqsAdapter>
        </MantineProvider>
      </body>
    </html>
  );
}
