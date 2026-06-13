import { describe, expect, it, vi } from "vitest";
import { AcceptanceGate } from "../orchestrator/AcceptanceGate.js";
import type { AcceptanceRunner } from "../orchestrator/AcceptanceRunner.js";
import type { AcceptanceReport } from "../schemas/acceptance.schema.js";

function mockRunner(
  outcomes: Array<Pick<AcceptanceReport, "passed">>,
): AcceptanceRunner {
  let call = 0;
  return {
    runChecks: vi.fn(async (_criteria, attempt) => {
      const outcome = outcomes[Math.min(call, outcomes.length - 1)];
      call += 1;
      return {
        runId: "test-run",
        timestamp: new Date().toISOString(),
        attempt,
        passed: outcome.passed,
        results: [],
      };
    }),
  } as unknown as AcceptanceRunner;
}

describe("AcceptanceGate", () => {
  it("passes on first successful attempt", async () => {
    const reports: AcceptanceReport[] = [];
    const gate = new AcceptanceGate({
      acceptanceRunner: mockRunner([{ passed: true }]),
      persistReport: (report) => reports.push(report),
    });

    const result = await gate.evaluate(
      [{ id: "ok", type: "command", command: "exit 0", required: true }],
      { maxRetries: 2 },
    );

    expect(result.passed).toBe(true);
    expect(result.attempts).toBe(1);
    expect(reports).toHaveLength(1);
  });

  it("retries and remediates before succeeding", async () => {
    const reports: AcceptanceReport[] = [];
    const remediate = vi.fn(async () => undefined);

    const gate = new AcceptanceGate({
      acceptanceRunner: mockRunner([{ passed: false }, { passed: true }]),
      persistReport: (report) => reports.push(report),
      onAttemptFailed: remediate,
    });

    const result = await gate.evaluate(
      [{ id: "flaky", type: "command", command: "fail", required: true }],
      { maxRetries: 2 },
    );

    expect(result.passed).toBe(true);
    expect(result.attempts).toBe(2);
    expect(remediate).toHaveBeenCalledTimes(1);
    expect(reports).toHaveLength(2);
  });

  it("fails after exhausting retries", async () => {
    const gate = new AcceptanceGate({
      acceptanceRunner: mockRunner([{ passed: false }, { passed: false }]),
      persistReport: () => undefined,
    });

    const result = await gate.evaluate(
      [{ id: "bad", type: "command", command: "fail", required: true }],
      { maxRetries: 1 },
    );

    expect(result.passed).toBe(false);
    expect(result.attempts).toBe(2);
  });
});
