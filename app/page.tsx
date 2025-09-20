import Link from "next/link";



export default function Home() {
  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-100">
        <div className="text-center px-6">
          <h1 className="text-4xl md:text-5xl font-bold text-black mb-4">
            Welcome to <span className="text-[#4dabf7]">NoteDoctor.ai</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-xl mx-auto mb-8">
            AI-powered medical coding that saves time, reduces errors, and ensures compliance.
          </p>

          <div className="flex gap-4 justify-center mb-6">
            <Link
              href="/auth/sign-up"
              className="px-6 py-3 rounded-xl bg-blue-600 text-white font-medium shadow hover:bg-blue-700 transition"
            >
              Sign Up
            </Link>
            <Link
              href="/auth/login"
              className="px-6 py-3 rounded-xl border border-blue-600 text-blue-600 font-medium hover:bg-blue-50 transition"
            >
              Sign In
            </Link>
          </div>

          <p className="text-sm text-gray-500">
            HIPAA Compliant • Secure • Trusted by Healthcare Professionals
          </p>
        </div>
      </div>
    </>
  );
}
