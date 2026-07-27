import ApiPlayground from "@/components/ApiPlayground";

export const metadata = {
  title: "API Playground",
};

export default function ApiPlaygroundPage() {
  // The /agents shell wraps content in `flex-1 overflow-hidden`, so this page
  // owns its own scroll (matching the API Keys page).
  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">API Playground</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Try the{" "}
            <a href="/api/v1/docs" className="underline">
              public API
            </a>{" "}
            without leaving the dashboard. Each request runs server-side with a
            short-lived test key — no secret ever touches your browser.
          </p>
        </header>
        <ApiPlayground />
      </div>
    </main>
  );
}
