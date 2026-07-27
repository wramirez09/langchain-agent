import ApiKeysManager from "@/components/ApiKeysManager";

export const metadata = {
  title: "API Keys",
};

export default function ApiKeysPage() {
  // The /agents shell wraps content in `flex-1 overflow-hidden` (for the chat
  // UI's internal scroll), so this page must be its own scroll container.
  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">API Keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage keys for the NoteDoctor public API. See the{" "}
            <a href="/api/v1/docs" className="underline">
              API documentation
            </a>{" "}
            to get started.
          </p>
        </header>
        <ApiKeysManager />
      </div>
    </main>
  );
}
