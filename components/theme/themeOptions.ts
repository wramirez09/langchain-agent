import { Monitor, Moon, Sun } from "lucide-react";

/**
 * The three color themes. `value` is next-themes' stock key (it toggles the
 * `.dark` class Tailwind keys off); `label` is the name users see.
 */
export const THEME_OPTIONS = [
  { value: "light", label: "Classic", icon: Sun },
  { value: "dark", label: "Midnight", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

// For useSyncExternalStore: false on the server, true once hydrated.
// next-themes only knows the stored theme on the client, so selectors render
// nothing selected until then to keep server and client markup identical.
export const noopSubscribe = () => () => {};
