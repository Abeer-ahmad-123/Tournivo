import { expect, it } from "vitest";
import { validateEvidence } from "@/modules/discipline/evidence-storage";
it("rejects disguised, empty, oversized and active SVG evidence", () => {
  expect(() =>
    validateEvidence(new TextEncoder().encode("<script>alert(1)</script>"), "image/png"),
  ).toThrow(/content/);
  expect(() => validateEvidence(new Uint8Array(), "application/pdf")).toThrow(/between/);
  expect(() => validateEvidence(new Uint8Array(10 * 1024 * 1024 + 1), "image/png")).toThrow(
    /10 MB/,
  );
  expect(() => validateEvidence(new TextEncoder().encode("<svg/>"), "image/svg+xml")).toThrow(
    /Use PNG/,
  );
});
it("accepts signature-checked PDF, JPEG, PNG and WebP formats", () => {
  expect(() =>
    validateEvidence(new TextEncoder().encode("%PDF-1.4\n"), "application/pdf"),
  ).not.toThrow();
  expect(() => validateEvidence(new Uint8Array([255, 216, 255, 224]), "image/jpeg")).not.toThrow();
  expect(() =>
    validateEvidence(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"),
  ).not.toThrow();
  expect(() =>
    validateEvidence(new TextEncoder().encode("RIFF0000WEBP0000"), "image/webp"),
  ).not.toThrow();
});
