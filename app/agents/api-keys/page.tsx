import ApiKeysManager from "@/components/ApiKeysManager";

export const metadata = {
  title: "API Keys",
};

export default function ApiKeysPage() {
  // The /agents shell wraps content in `flex-1 overflow-hidden` (for the chat
  // UI's internal scroll), so this page must be its own scroll container.
  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[940px] px-4 py-8 sm:px-6 md:py-11">
        <header>
          <h1 className="text-3xl font-bold leading-tight tracking-[-0.024em]">API Keys</h1>
          <p className="mt-1.5 max-w-[62ch] text-sm text-muted-foreground">
            Manage keys for the NoteDoctor public API. See the{" "}
            <a href="/api/v1/docs" className="text-primary underline-offset-2 hover:underline">
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
