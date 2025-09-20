import { SignUpForm } from '@/components/sign-up-form';

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-100 p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-[#4dabf7] mb-2">Create an account</h1>
          <p className="text-gray-900">Enter your details to get started</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-8">
          <SignUpForm />
        </div>
      </div>
    </div>
  );
}
