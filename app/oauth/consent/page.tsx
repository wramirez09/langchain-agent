import { redirect } from "next/navigation";

import { createClient } from "@/utils/server";

import { ConsentForm } from "./ConsentForm";

export const dynamic = "force-dynamic";

/**
 * The consent step of Supabase Auth's OAuth 2.1 server — where a claude.ai or
 * ChatGPT connector sign-in lands (`authorization_url_path = /oauth/consent`).
 *
 * Supabase owns `/authorize` and `/token`; this page only shows the user who is
 * asking and records their decision. A signed-out user is sent to login with a
 * `next` that returns here, which is why `/oauth` is on the middleware's
 * unauthenticated allowlist.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;

  // Supabase issues opaque ids; refusing anything else keeps the value we put
  // back into `next` from carrying extra query parameters.
  if (!authorizationId || !/^[A-Za-z0-9_-]{1,128}$/.test(authorizationId)) {
    return (
      <ConsentError message="This sign-in link is missing or malformed. Start the connection again from your AI assistant." />
    );
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    const next = `/oauth/consent?authorization_id=${authorizationId}`;
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  const { data, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) {
    return (
      <ConsentError message="This sign-in request has expired or was already used. Start the connection again from your AI assistant." />
    );
  }

  // Already consented to this client and scope: Supabase hands back the
  // client's redirect directly.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  let redirectHost = data.redirect_uri;
  try {
    redirectHost = new URL(data.redirect_uri).host;
  } catch {
    // Show the raw value; the approve call is what Supabase validates.
  }

  return (
    <ConsentForm
      authorizationId={data.authorization_id}
      clientName={data.client.name || "An AI assistant"}
      redirectHost={redirectHost}
      email={data.user.email}
    />
  );
}

function ConsentError({ message }: { message: string }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-light px-4 py-6">
      <div className="w-full max-w-md bg-card rounded-xl shadow-md p-6">
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Can&apos;t connect
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
