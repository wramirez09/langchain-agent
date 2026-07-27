import { createHash } from "crypto";

import { getRedis } from "@/lib/redis";

/**
 * Optional idempotency for the public API's POST endpoints.
 *
 * A caller that retries an agent run after a timeout should not be charged for
 * (and should not re-run) a second 60-second inference. Passing an
 * `Idempotency-Key` header makes the request replayable: the first call's
 * response body is stored in Redis and returned verbatim for any repeat of the
 * same key.
 *
 * Semantics follow Stripe's, which integrators already know:
 *  - Same key + same body  → the stored response, plus `Idempotency-Replayed: true`.
 *  - Same key + different body → 422; a key identifies one request, not a slot.
 *  - Same key while the original is still running → 409; the client should retry.
 *  - No key → no idempotency at all. It is strictly opt-in.
 *
 * Redis-only, and deliberately so: with Upstash unconfigured or unreachable,
 * `begin()` reports `disabled` and the request proceeds normally. Losing
 * dedup is a worse-but-working API; failing the request is not.
 *
 * Applies to buffered JSON responses only. A streaming response is consumed as
 * it is produced and cannot be faithfully replayed, so a request that opts into
 * streaming skips this layer entirely rather than reserving a slot it could
 * never fill (which would 409 the caller's honest retries until the slot aged
 * out). Callers enforce that by passing `key: null` when streaming.
 */

const PREFIX = "idem:v1:";
/** Long enough to cover a client's whole retry schedule, short enough to bound storage. */
const TTL_SECONDS = 24 * 60 * 60;
/** A run can take ~5 min (agents maxDuration is 300s); after that treat it as dead. */
const IN_FLIGHT_TTL_SECONDS = 6 * 60;

const MAX_KEY_LENGTH = 255;
/** Skip recording bodies too large to be worth caching; the call still runs. */
const MAX_STORED_BODY_BYTES = 256 * 1024;

type StoredRecord =
  | { state: "in_flight"; fingerprint: string }
  | {
      state: "complete";
      fingerprint: string;
      status: number;
      body: string;
      contentType: string;
    };

export type IdempotencyOutcome =
  /** No key supplied, or Redis unavailable — run normally, nothing to record. */
  | { kind: "disabled" }
  /** We hold the slot. Call `record()` with the final response. */
  | { kind: "proceed"; commit: (res: Response) => Promise<Response> }
  /** A finished identical request exists; return this instead of running. */
  | { kind: "replay"; response: Response }
  /** Conflicting reuse or an in-flight duplicate; return this error. */
  | { kind: "conflict"; response: Response };

function fingerprintOf(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body) ?? "null").digest("hex");
}

/**
 * Read and validate the `Idempotency-Key` header. Returns null when absent;
 * over-long values are rejected by the caller as a bad request.
 */
export function readIdempotencyKey(req: Request): string | null {
  const raw = req.headers.get("idempotency-key");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isValidIdempotencyKey(key: string): boolean {
  return key.length <= MAX_KEY_LENGTH;
}

/**
 * Claim the idempotency slot for this request.
 *
 * Scoped by org so one tenant's key choices can never collide with — or expose
 * a response to — another's, and by endpoint so the same key reused against a
 * different route is treated as a different request.
 */
export async function begin(args: {
  key: string | null;
  orgId: string;
  endpoint: string;
  body: unknown;
  /** Builds the error envelope, so this module doesn't own response shape. */
  errorResponse: (code: string, message: string, status: number) => Response;
}): Promise<IdempotencyOutcome> {
  const { key, orgId, endpoint, body, errorResponse } = args;
  if (!key) return { kind: "disabled" };

  const redis = getRedis();
  if (!redis) return { kind: "disabled" };

  const redisKey = `${PREFIX}${orgId}:${endpoint}:${key}`;
  const fingerprint = fingerprintOf(body);

  let claimed: unknown;
  try {
    claimed = await redis.set<StoredRecord>(
      redisKey,
      { state: "in_flight", fingerprint },
      { ex: IN_FLIGHT_TTL_SECONDS, nx: true },
    );
  } catch (err) {
    console.warn("⚠️ Idempotency claim failed — running without dedup:", err);
    return { kind: "disabled" };
  }

  if (claimed !== "OK") {
    // Someone already holds this key. Decide replay vs conflict.
    let existing: StoredRecord | null = null;
    try {
      existing = await redis.get<StoredRecord>(redisKey);
    } catch (err) {
      console.warn("⚠️ Idempotency read failed — running without dedup:", err);
      return { kind: "disabled" };
    }

    // Expired between the SET and the GET — rare; treat as un-deduped rather
    // than re-racing for the slot.
    if (!existing) return { kind: "disabled" };

    if (existing.fingerprint !== fingerprint) {
      return {
        kind: "conflict",
        response: errorResponse(
          "idempotency_key_reuse",
          "This Idempotency-Key was already used with a different request body.",
          422,
        ),
      };
    }

    if (existing.state === "in_flight") {
      return {
        kind: "conflict",
        response: errorResponse(
          "idempotency_in_progress",
          "A request with this Idempotency-Key is still in progress. Retry shortly.",
          409,
        ),
      };
    }

    return {
      kind: "replay",
      response: new Response(existing.body, {
        status: existing.status,
        headers: {
          "content-type": existing.contentType,
          "cache-control": "no-store",
          "Idempotency-Replayed": "true",
        },
      }),
    };
  }

  return {
    kind: "proceed",
    commit: (res) => commit(redisKey, fingerprint, res),
  };
}

/**
 * Store the completed response under the claimed slot and return a response the
 * route can send. The body is read here, so the returned Response — not the
 * original — must be the one returned to the client.
 *
 * Errors (>=400) release the slot instead of being stored: a 500 should be
 * retryable with the same key, not permanently replayed back at the caller.
 */
async function commit(
  redisKey: string,
  fingerprint: string,
  res: Response,
): Promise<Response> {
  const redis = getRedis();
  if (!redis) return res;

  if (res.status >= 400) {
    try {
      await redis.del(redisKey);
    } catch {
      // slot expires via IN_FLIGHT_TTL_SECONDS anyway
    }
    return res;
  }

  let body: string;
  try {
    body = await res.clone().text();
  } catch {
    return res;
  }

  if (body.length > MAX_STORED_BODY_BYTES) {
    try {
      await redis.del(redisKey);
    } catch {
      /* non-fatal */
    }
    return res;
  }

  try {
    await redis.set<StoredRecord>(
      redisKey,
      {
        state: "complete",
        fingerprint,
        status: res.status,
        body,
        contentType: res.headers.get("content-type") ?? "application/json",
      },
      { ex: TTL_SECONDS },
    );
  } catch (err) {
    console.warn("⚠️ Idempotency store failed (response still returned):", err);
  }

  return res;
}
