import { SignUpForm } from '@/components/sign-up-form';

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient p-6">
      <div className="w-full max-w-md">
        <div className="hidden md:block text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 text-shadow-lg">Create an account</h1>
          <p className="text-dark">Enter your details to get started</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-8">
          <SignUpForm />
        </div>
      </div>
    </div>
  );
}
