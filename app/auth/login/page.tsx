import { LoginForm } from '@/components/login-form';

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-100 p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-black mb-2">Welcome back</h1>
          <p className="text-gray-600">Sign in to your account to continue</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
