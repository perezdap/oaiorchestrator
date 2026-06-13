import type { AcceptanceCheck, AcceptanceReport } from "../schemas/acceptance.schema.js";
import type { AcceptanceRunner } from "./AcceptanceRunner.js";

export interface AcceptanceRetryPolicy {
  maxRetries: number;
}

export interface AcceptanceGateOptions {
  acceptanceRunner: AcceptanceRunner;
  persistReport: (report: AcceptanceReport) => void;
  onAttemptStart?: (attempt: number, maxAttempts: number) => void;
  onAttemptFailed?: (attempt: number, report: AcceptanceReport) => Promise<void>;
}

export interface AcceptanceGateResult {
  passed: boolean;
  report: AcceptanceReport;
  attempts: number;
}

export class AcceptanceGate {
  constructor(private readonly options: AcceptanceGateOptions) {}

  async evaluate(
    criteria: AcceptanceCheck[],
    policy: AcceptanceRetryPolicy,
  ): Promise<AcceptanceGateResult> {
    const maxAttempts = policy.maxRetries + 1;
    let lastReport: AcceptanceReport | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.options.onAttemptStart?.(attempt, maxAttempts);
      const report = await this.options.acceptanceRunner.runChecks(criteria, attempt);
      this.options.persistReport(report);
      lastReport = report;

      if (report.passed) {
        return { passed: true, report, attempts: attempt };
      }

      if (attempt < maxAttempts && this.options.onAttemptFailed) {
        await this.options.onAttemptFailed(attempt, report);
      }
    }

    return {
      passed: false,
      report: lastReport!,
      attempts: maxAttempts,
    };
  }
}
