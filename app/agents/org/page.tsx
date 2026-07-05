import OrgManager from "@/components/OrgManager";

export const metadata = {
  title: "Organization",
};

export default function OrgPage() {
  // The /agents shell wraps content in `flex-1 overflow-hidden`, so this page
  // is its own scroll container.
  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Organization</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your organization&apos;s members, roles, usage, and billing.
          </p>
        </header>
        <OrgManager />
      </div>
    </main>
  );
}
