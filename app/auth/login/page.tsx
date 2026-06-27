import { redirect } from "next/navigation";
import { createClient } from "@/utils/server";
import { LoginClient } from "./LoginClient";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mobile?: string; redirect?: string }>;
}) {
  const { mobile, redirect: redirectParam } = await searchParams;
  const isMobileDeepLink = mobile === "true" && redirectParam === "login";

  // Authenticated web users must never see the sign-in form — send them to
  // the app. Skip this for the mobile deep-link hand-off, which the client
  // component resolves to the native app instead.
  if (!isMobileDeepLink) {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) redirect("/protected/preAuth");
  }

  return <LoginClient />;
}
