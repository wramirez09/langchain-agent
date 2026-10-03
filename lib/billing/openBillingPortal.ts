import { toast } from "sonner";

/**
 * Opens the Stripe customer portal in a new tab. Shared by every billing
 * entry point (sidebar Billing row, top-bar avatar) so they behave the same.
 *
 * Must be called directly from a click handler: the blank tab is opened
 * synchronously so the browser treats it as user-initiated and doesn't block
 * the popup, then redirected once the portal URL resolves.
 */
export async function openBillingPortal(): Promise<void> {
  const billingTab = window.open("", "_blank");
  try {
    const res = await fetch("/api/stripe/billing", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      billingTab?.close();
      // Prefer the server's message: a 404 here covers several distinct
      // causes (no customer on the profile, a deleted customer, or a customer
      // that belongs to a different Stripe account than the running key), and
      // collapsing them all into "complete your subscription" told subscribed
      // users to subscribe again and hid the real reason.
      if (res.status === 401) {
        toast.error("Please log in to access billing.");
      } else {
        toast.error(data.error || "Unable to open billing portal.");
      }
      return;
    }
    if (data.url) {
      if (billingTab) billingTab.location.href = data.url;
      else window.open(data.url, "_blank", "noopener,noreferrer");
    } else {
      billingTab?.close();
    }
  } catch (err) {
    billingTab?.close();
    console.error("Portal error:", err);
    toast.error("Unable to open billing portal. Please try again later.");
  }
}
