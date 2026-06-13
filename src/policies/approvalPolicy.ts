import type { CommandPolicyResult } from "./commandPolicy.js";
import type { FilePolicyResult } from "./filePolicy.js";

export type ApprovalStatus = "pending" | "approved" | "denied" | "auto_approved";

export interface ApprovalRequest {
  id: string;
  timestamp: string;
  category: "command" | "file" | "secret" | "manual";
  description: string;
  details: Record<string, string>;
  status: ApprovalStatus;
}

export interface ApprovalPolicyOptions {
  autoApproveInTests?: boolean;
  autoApproveManualChecks?: boolean;
}

export class ApprovalPolicy {
  private requests: ApprovalRequest[] = [];
  private requestCounter = 0;

  constructor(private readonly options: ApprovalPolicyOptions = {}) {}

  requestCommandApproval(command: string, policyResult: CommandPolicyResult): ApprovalRequest {
    return this.createRequest("command", policyResult.reason, {
      command,
      verdict: policyResult.verdict,
      matchedPattern: policyResult.matchedPattern ?? "",
    });
  }

  requestFileApproval(
    filePath: string,
    operation: string,
    policyResult: FilePolicyResult,
  ): ApprovalRequest {
    return this.createRequest("file", policyResult.reason, {
      path: filePath,
      operation,
      normalizedPath: policyResult.normalizedPath,
    });
  }

  requestManualApproval(message: string, checkId: string): ApprovalRequest {
    const req = this.createRequest("manual", message || `Manual approval required for ${checkId}`, {
      checkId,
    });
    if (this.options.autoApproveManualChecks) {
      req.status = "auto_approved";
    }
    return req;
  }

  private createRequest(
    category: ApprovalRequest["category"],
    description: string,
    details: Record<string, string>,
  ): ApprovalRequest {
    this.requestCounter += 1;
    const request: ApprovalRequest = {
      id: `approval-${this.requestCounter}`,
      timestamp: new Date().toISOString(),
      category,
      description,
      details,
      status: this.options.autoApproveInTests ? "auto_approved" : "pending",
    };
    this.requests.push(request);
    return request;
  }

  approve(requestId: string): void {
    const req = this.requests.find((r) => r.id === requestId);
    if (req) req.status = "approved";
  }

  deny(requestId: string): void {
    const req = this.requests.find((r) => r.id === requestId);
    if (req) req.status = "denied";
  }

  isApproved(request: ApprovalRequest): boolean {
    return request.status === "approved" || request.status === "auto_approved";
  }

  getPending(): ApprovalRequest[] {
    return this.requests.filter((r) => r.status === "pending");
  }

  getAll(): ApprovalRequest[] {
    return [...this.requests];
  }
}
