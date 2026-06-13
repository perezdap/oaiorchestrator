import { ApprovalPolicy } from "../../policies/approvalPolicy.js";
import type { AcceptanceCheck } from "../../schemas/acceptance.schema.js";
import type { AcceptanceCheckHandler } from "./types.js";

export const manualApprovalCheckHandler: AcceptanceCheckHandler<
  Extract<AcceptanceCheck, { type: "manual_approval" }>
> = {
  type: "manual_approval",
  run(check, ctx, base) {
    const policy = ctx.approvalPolicy ?? new ApprovalPolicy({ autoApproveInTests: true });
    const request = policy.requestManualApproval(
      check.message ?? "Manual approval required",
      check.id,
    );
    const passed = policy.isApproved(request);
    return {
      ...base,
      passed,
      message: passed ? "Manual approval granted" : `Manual approval pending: ${request.id}`,
    };
  },
};
