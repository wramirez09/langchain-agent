import ApiKeysManager from "@/components/ApiKeysManager";

export const metadata = {
  title: "API Keys",
};

export default function ApiKeysPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
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
    </main>
  );
}
