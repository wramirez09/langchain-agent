/**
 * @jest-environment node
 */
import {
  authIssuer,
  mcpResourceUrl,
  protectedResourceMetadata,
  siteUrl,
} from "../oauth/metadata";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("protectedResourceMetadata", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com/";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ref.supabase.co/";
  });

  it("advertises the exact MCP URL as the resource, and Supabase Auth as the server", () => {
    expect(protectedResourceMetadata()).toMatchObject({
      resource: "https://app.example.com/api/mcp",
      authorization_servers: ["https://ref.supabase.co/auth/v1"],
      bearer_methods_supported: ["header"],
      resource_name: "NoteDoctorAi",
    });
  });

  it("builds the issuer and resource without doubled slashes", () => {
    expect(mcpResourceUrl()).toBe("https://app.example.com/api/mcp");
    expect(authIssuer()).toBe("https://ref.supabase.co/auth/v1");
  });
});

describe("configuration errors", () => {
  it("throws when the site URL is unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(() => siteUrl()).toThrow("NEXT_PUBLIC_SITE_URL");
  });

  it("throws when the Supabase URL is unset", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => authIssuer()).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });
});
