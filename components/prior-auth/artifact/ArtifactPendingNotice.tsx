/**
 * What the chat panel shows while a screening is in flight.
 *
 * It replaces a block of shimmer bars. The bars were honest about one thing --
 * something is loading -- and silent about the part users most need to know,
 * which is that their text is scanned for identifiers before it is used for
 * anything. The report is withheld until the whole run has been checked, so
 * this is a long wait with nothing else on screen; it may as well say what is
 * happening.
 *
 * The steps are the agent's real pipeline order (see the numbered workflow in
 * `app/api/chat/agents/agentPrompt.ts`), not live status -- the chat panel has
 * no stage data at this point, and `AgentProgressPanel` on the Output tab is
 * where per-tool progress actually lives. Only the first step is marked
 * active, so this reads as "here is the order", not as a fake progress bar.
 */

const STEPS = [
  "Checking for any PHI",
  "Extracting treatment, codes and history",
  "Searching coverage guidelines",
  "Reviewing against payer criteria",
];

export function ArtifactPendingNotice() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <ol className="space-y-2.5">
        {STEPS.map((step, i) => {
          const active = i === 0;
          return (
            <li key={step} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={
                  active
                    ? "size-2 flex-shrink-0 rounded-full bg-primary animate-pulse"
                    : "size-2 flex-shrink-0 rounded-full border border-border"
                }
              />
              <span
                className={
                  active
                    ? "text-[13.5px] font-medium text-foreground"
                    : "text-[13.5px] text-muted-foreground"
                }
              >
                {step}
                {active ? "…" : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
