import { LoginForm } from '@/components/login-form'


export default async function Page(
  props: Promise<any>) {

  const slug = await props


  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 ">
      <div className="w-full max-w-sm bg-blue-50">
        <LoginForm />
      </div>
    </div>
  )
}
