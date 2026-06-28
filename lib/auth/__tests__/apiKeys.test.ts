import { createHash } from "crypto";
import { generateApiKey, hashApiKey, isApiKey } from "@/lib/auth/apiKeys";

describe("apiKeys", () => {
  describe("generateApiKey", () => {
    it("produces a sk_<env>_ key with matching hash and prefix", () => {
      const { plaintext, hash, prefix } = generateApiKey("live");
      expect(plaintext.startsWith("sk_live_")).toBe(true);
      expect(prefix).toBe(plaintext.slice(0, 12));
      expect(hash).toBe(createHash("sha256").update(plaintext).digest("hex"));
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("honours the test environment", () => {
      expect(generateApiKey("test").plaintext.startsWith("sk_test_")).toBe(true);
    });

    it("is unique across calls", () => {
      const a = generateApiKey("live");
      const b = generateApiKey("live");
      expect(a.plaintext).not.toBe(b.plaintext);
      expect(a.hash).not.toBe(b.hash);
    });
  });

  describe("hashApiKey", () => {
    it("is deterministic", () => {
      expect(hashApiKey("sk_live_abc")).toBe(hashApiKey("sk_live_abc"));
    });
  });

  describe("isApiKey", () => {
    it("matches our key shapes only", () => {
      expect(isApiKey("sk_live_abc")).toBe(true);
      expect(isApiKey("sk_test_abc")).toBe(true);
      expect(isApiKey("eyJhbGciOi...")).toBe(false); // supabase JWT
      expect(isApiKey("sk_other_abc")).toBe(false);
      expect(isApiKey("")).toBe(false);
    });
  });
});
