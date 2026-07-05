import Link from "next/link";
import { CircleCheck, Shield, Users } from "lucide-react";
import { createClient } from "@/utils/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) redirect("/agents");

  return (
    <div
      className="h-full flex items-center justify-center text-center px-6 py-16"
      style={{
        background:
          "linear-gradient(160deg, #4aa8e0 0%, #2f86d5 55%, #2570c4 100%)",
      }}
    >
      <div className="max-w-[640px]">
        <p
          className="text-[22px] md:text-[28px] font-bold text-white tracking-[-0.01em] mb-1.5"
          style={{ fontFamily: "var(--font-outfit), sans-serif" }}
        >
          Welcome to
        </p>
        <h1
          className="text-[44px] md:text-[64px] font-extrabold tracking-[-0.03em] leading-none text-white mb-[22px]"
          style={{ fontFamily: "var(--font-outfit), sans-serif" }}
        >
          Note<span className="text-[#bfe2f7]">Doctor</span>
          <span className="text-[#d7eefb]">Ai</span>
        </h1>
        <p
          className="text-[17px] md:text-[19px] leading-relaxed text-white/90 max-w-[560px] mx-auto mb-9"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          <span className="text-[#d7eefb] font-semibold">
            Authorization readiness
          </span>{" "}
          screening that saves time, reduces errors, and ensures compliance.
        </p>

        <div className="flex flex-col sm:flex-row gap-3.5 justify-center">
          <Link
            href="/auth/sign-up"
            className="h-12 px-[30px] inline-flex items-center justify-center rounded-lg text-[15.5px] font-bold bg-white text-[#238dd2] border border-white hover:bg-[#eaf4fc] hover:border-[#eaf4fc] transition-colors"
          >
            Sign Up
          </Link>
          <Link
            href="/auth/login"
            className="h-12 px-[30px] inline-flex items-center justify-center rounded-lg text-[15.5px] font-bold bg-transparent text-white border-[1.5px] border-white/70 hover:bg-white/10 hover:border-white transition-colors"
          >
            Sign In
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-[22px] gap-y-2.5 mt-10">
          <span className="inline-flex items-center gap-1.5 text-sm text-white/90">
            <CircleCheck size={16} strokeWidth={2} />
            HIPAA Compliant
          </span>
          <span className="w-1 h-1 rounded-full bg-white/50" />
          <span className="inline-flex items-center gap-1.5 text-sm text-white/90">
            <Shield size={16} strokeWidth={2} />
            Secure
          </span>
          <span className="w-1 h-1 rounded-full bg-white/50" />
          <span className="inline-flex items-center gap-1.5 text-sm text-white/90">
            <Users size={16} strokeWidth={2} />
            Trusted by Healthcare Professionals
          </span>
        </div>
      </div>
    </div>
  );
}
