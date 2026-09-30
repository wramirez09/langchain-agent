import { redirect } from "next/navigation";
import { createClient } from "@/utils/server";
import { safeNext } from "@/lib/auth/safeNext";
import { LoginClient } from "./LoginClient";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mobile?: string; redirect?: string; next?: string }>;
}) {
  const { mobile, redirect: redirectParam, next } = await searchParams;
  const isMobileDeepLink = mobile === "true" && redirectParam === "login";

  // Authenticated web users must never see the sign-in form — send them to
  // the app. Skip this for the mobile deep-link hand-off, which the client
  // component resolves to the native app instead.
  if (!isMobileDeepLink) {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) redirect(safeNext(next, "/protected/preAuth"));
  }

  return <LoginClient />;
}
