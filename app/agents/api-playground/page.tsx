import ApiPlayground from "@/components/ApiPlayground";

export const metadata = {
  title: "API Playground",
};

export default function ApiPlaygroundPage() {
  // Full-bleed console layout: the component brings its own toolbar (title,
  // key chip, rate meter) and owns scrolling within each pane. The /agents
  // shell wraps content in `flex-1 overflow-hidden`, so `h-full` fills it.
  return (
    <main className="h-full overflow-hidden">
      <ApiPlayground />
    </main>
  );
}
