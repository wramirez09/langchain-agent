import Link from "next/link";

export default function Home() {
  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gradient-gradient">
        <div className="text-center px-6">
          <h1 className="text-4xl md:text-5xl font-bold text-black mb-4 text-shadow-lg">
            Welcome to <span className="text-white">NoteDoctor.ai</span>
          </h1>
          <p className="text-lg text-white max-w-xl mx-auto mb-8 text-shadow-lg">
            AI-powered medical coding that saves time, reduces errors, and ensures compliance.
          </p>

          <div className="flex gap-4 justify-center mb-6">
            <Link
              href="/auth/sign-up"
              className="px-6 py-3 rounded-xl font-medium button-light shadow-md hover:shadow-none transition duration-200 ease-in-out"
            >
              Sign Up
            </Link>
            <Link
              href="/auth/login"
              className="px-6 py-3 rounded-xl font-medium button-ghost shadow-md hover:shadow-none transition duration-200 ease-in-out"
            >
              Sign In
            </Link>
          </div>

          <p className="text-sm text-dark">
            HIPAA Compliant • Secure • Trusted by Healthcare Professionals
          </p>
        </div>
      </div>
    </>
  );
}
