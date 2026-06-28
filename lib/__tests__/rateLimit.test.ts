// Mock Upstash so no network is touched. The Ratelimit instance's `.limit()`
// delegates to a programmable mock shared across org + key limiters.
const limitMock = jest.fn();

jest.mock("@upstash/redis", () => ({ Redis: class {} }));
jest.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    limit(key: string) {
      return limitMock(key);
    }
  }
  (Ratelimit as any).slidingWindow = () => "sliding-window";
  return { Ratelimit };
});

function loadModule(): typeof import("@/lib/rateLimit") {
  let mod!: typeof import("@/lib/rateLimit");
  jest.isolateModules(() => {
    mod = require("@/lib/rateLimit");
  });
  return mod;
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    limitMock.mockReset();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("fails open when Upstash is not configured", async () => {
    const { checkRateLimit } = loadModule();
    const r = await checkRateLimit("org-1", "key-1", "standard");
    expect(r.success).toBe(true);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("allows a request under the limit", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    limitMock.mockResolvedValue({ success: true, limit: 60, remaining: 59, reset: Date.now() + 1000 });

    const { checkRateLimit } = loadModule();
    const r = await checkRateLimit("org-1", "key-1", "standard");
    expect(r.success).toBe(true);
    expect(limitMock).toHaveBeenCalledTimes(2); // org + per-key
  });

  it("blocks with a Retry-After when over the limit", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    limitMock.mockResolvedValue({ success: false, limit: 60, remaining: 0, reset: Date.now() + 5000 });

    const { checkRateLimit } = loadModule();
    const r = await checkRateLimit("org-1", "key-1", "standard");
    expect(r.success).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("fails open if the limiter throws", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    limitMock.mockRejectedValue(new Error("redis down"));

    const { checkRateLimit } = loadModule();
    const r = await checkRateLimit("org-1", "key-1", "standard");
    expect(r.success).toBe(true);
  });
});
