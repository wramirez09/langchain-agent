import { LoginForm } from "@/components/login-form"

export default function Page({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {

    return <LoginForm />
}