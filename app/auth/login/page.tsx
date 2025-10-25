import { LoginForm } from '@/components/login-form';

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-light p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome back</h1>
          <p className="text-dark">Sign in to your account to continue</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
