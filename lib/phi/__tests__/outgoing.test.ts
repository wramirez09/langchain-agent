import { redactOutgoing, redactUserMessages } from "@/lib/phi/outgoing";
import { serializeQuery } from "@/lib/priorAuth/serializeQuery";

describe("redactOutgoing", () => {
  it("removes a lowercase name typed into the History field", () => {
    const query = serializeQuery({
      guidelines: "Medicare",
      state: "FL",
      treatment: "Total knee arthroplasty",
      cptCodes: "27447",
      diagnosis: "M17.11",
      patientHistory: "john wayne",
    });
    const { text, result } = redactOutgoing(query);
    expect(text).toBe(
      "Guidelines: Medicare. State: FL. Treatment: Total knee arthroplasty. " +
        "CPT/HCPCS : 27447. Diagnosis: M17.11. History: [NAME]",
    );
    expect(result.total).toBe(1);
  });

  it("redacts identifiers in free chat text", () => {
    const { text } = redactOutgoing(
      "is a TKA covered for john smith, DOB 04/12/1956?",
    );
    expect(text).not.toMatch(/john|smith|1956/i);
  });

  it("returns the original text untouched when nothing is found", () => {
    const input = "Failed PT x 8 weeks, KL grade 3, BMI 34 — CPT 29881";
    const { text, result } = redactOutgoing(input);
    expect(text).toBe(input);
    expect(result.total).toBe(0);
  });
});

describe("redactUserMessages", () => {
  it("redacts user turns in content and parts, leaves assistant turns", () => {
    const { messages, total, counts } = redactUserMessages([
      { role: "user", content: "History: john wayne" },
      { role: "assistant", content: "Smith fracture, effective 01/01/2024" },
      { role: "user", parts: [{ type: "text", text: "call 555-123-4567" }] },
    ]);
    expect(messages[0].content).toBe("History: [NAME]");
    expect(messages[1].content).toBe("Smith fracture, effective 01/01/2024");
    expect(messages[2].content).toBe("call [PHONE]");
    expect(messages[2].parts).toBeUndefined();
    expect(total).toBe(2);
    expect(counts).toEqual({ name: 1, phone: 1 });
  });

  it("returns the same message objects when there is nothing to remove", () => {
    const input = [{ role: "user", content: "TKA, CPT 27447, Medicare FL" }];
    expect(redactUserMessages(input).messages[0]).toBe(input[0]);
  });

  it("is idempotent on text the browser already redacted", () => {
    const { total } = redactUserMessages([
      { role: "user", content: "History: [NAME]. DOB [DATE]" },
    ]);
    expect(total).toBe(0);
  });
});
