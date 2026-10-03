import Link from "next/link";
import { CircleCheck, Shield, Users } from "lucide-react";
import { createClient } from "@/utils/server";
import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Supabase sends an auth link (password reset, invite) to the Site URL —
  // this page — instead of /auth/callback whenever the requested redirect
  // isn't on the project's Redirect URLs allowlist. The PKCE code would be
  // dropped here and the link dead-ends, so hand it to the callback, which
  // exchanges it for a session and continues to the password form.
  const { code } = await searchParams;
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) redirect("/agents");

  return (
    <div className="landing-hero h-full flex items-center justify-center text-center px-6 py-16">
      <div className="max-w-[640px]">
        <p
          className="text-[22px] md:text-[28px] font-bold text-white dark:text-foreground tracking-[-0.01em] mb-1.5"
          style={{ fontFamily: "var(--font-outfit), sans-serif" }}
        >
          Welcome to
        </p>
        <h1
          className="text-[44px] md:text-[64px] font-extrabold tracking-[-0.03em] leading-none text-white dark:text-foreground mb-[22px]"
          style={{ fontFamily: "var(--font-outfit), sans-serif" }}
        >
          Note
          <span className="text-[#bfe2f7] dark:text-accent-foreground">
            Doctor
          </span>
          <span className="text-[#d7eefb] dark:text-accent-foreground">Ai</span>
        </h1>
        <p
          className="text-[17px] md:text-[19px] leading-relaxed text-white/90 dark:text-muted-foreground max-w-[560px] mx-auto mb-9"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          <span className="text-[#d7eefb] dark:text-accent-foreground font-semibold">
            Authorization readiness
          </span>{" "}
          screening that saves time, reduces errors, and ensures compliance.
        </p>

        <div className="flex flex-col sm:flex-row gap-3.5 justify-center">
          <Link
            href="/auth/sign-up"
            className="h-12 px-[30px] inline-flex items-center justify-center rounded-lg text-[15.5px] font-bold bg-white text-[#238dd2] border border-white hover:bg-[#eaf4fc] hover:border-[#eaf4fc] dark:bg-primary dark:text-primary-foreground dark:border-primary dark:shadow-[0_0_32px_rgba(59,130,246,0.35)] dark:hover:bg-primary dark:hover:border-primary dark:hover:-translate-y-0.5 transition-colors dark:transition-all"
          >
            Sign Up
          </Link>
          <Link
            href="/auth/login"
            className="h-12 px-[30px] inline-flex items-center justify-center rounded-lg text-[15.5px] font-bold bg-transparent text-white border-[1.5px] border-white/70 hover:bg-white/10 hover:border-white dark:text-foreground dark:border dark:border-border dark:hover:bg-white/5 dark:hover:border-border transition-colors"
          >
            Sign In
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-[22px] gap-y-2.5 mt-10">
          <span className="inline-flex items-center gap-1.5 text-sm text-white/90 dark:text-muted-foreground">
            <CircleCheck size={16} strokeWidth={2} />
            HIPAA Compliant
          </span>
          <span className="w-1 h-1 rounded-full bg-white/50 dark:bg-faint" />
          <span className="inline-flex items-center gap-1.5 text-sm text-white/90 dark:text-muted-foreground">
            <Shield size={16} strokeWidth={2} />
            Secure
          </span>
          <span className="w-1 h-1 rounded-full bg-white/50 dark:bg-faint" />
          <span className="inline-flex items-center gap-1.5 text-sm text-white/90 dark:text-muted-foreground">
            <Users size={16} strokeWidth={2} />
            Trusted by Healthcare Professionals
          </span>
        </div>
      </div>
    </div>
  );
}
