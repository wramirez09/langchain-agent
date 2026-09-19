"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";
import * as React from "react";

/**
 * Mounts next-themes for the whole app.
 *
 * `attribute="class"` is what makes Tailwind's `darkMode: ["class"]` work:
 * next-themes writes `class="dark"` (or `"light"`) onto <html>, which is the
 * same hook the `dark:` variants key off. Before this provider existed the
 * dark tokens lived behind `@media (prefers-color-scheme: dark)` while the
 * variants waited on a class nothing ever set, so the two could never agree.
 *
 * Theme values stay the stock `light` / `dark` rather than product names so
 * that contract holds; the UI labels them.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
