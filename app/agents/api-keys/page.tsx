import ApiKeysManager from "@/components/ApiKeysManager";

export const metadata = {
  title: "API Keys",
};

export default function ApiKeysPage() {
  // The /agents shell wraps content in `flex-1 overflow-hidden` (for the chat
  // UI's internal scroll), so this page must be its own scroll container.
  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 md:py-10">
        <header>
          <h1 className="text-3xl font-extrabold leading-[1.15] tracking-[-0.026em]">API Keys</h1>
          <p className="mt-2 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
            Keys are server-side secrets scoped to your organization. The secret is shown once,
            right after creation — store it in a secrets manager.{" "}
            <a href="/api/v1/docs" className="text-primary underline-offset-2 hover:underline">
              API documentation ↗
            </a>
          </p>
        </header>
        <ApiKeysManager />
      </div>
    </main>
  );
}
