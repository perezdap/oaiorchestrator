import type { AcceptanceCheck, AcceptanceCheckType, AcceptanceResult } from "../../schemas/acceptance.schema.js";
import { agentReviewCheckHandler } from "./agentReviewCheck.js";
import { commandCheckHandler } from "./commandCheck.js";
import { fileContainsCheckHandler } from "./fileContainsCheck.js";
import { fileExistsCheckHandler } from "./fileExistsCheck.js";
import { jsonShapeCheckHandler } from "./jsonShapeCheck.js";
import { manualApprovalCheckHandler } from "./manualApprovalCheck.js";
import { markdownArtifactCheckHandler } from "./markdownArtifactCheck.js";
import { testResultCheckHandler } from "./testResultCheck.js";
import type { AcceptanceCheckContext, AcceptanceCheckHandler, AcceptanceResultBase } from "./types.js";

const handlerRegistry: { [K in AcceptanceCheckType]: AcceptanceCheckHandler<Extract<AcceptanceCheck, { type: K }>> } = {
  command: commandCheckHandler,
  file_exists: fileExistsCheckHandler,
  file_contains: fileContainsCheckHandler,
  json_shape: jsonShapeCheckHandler,
  markdown_artifact: markdownArtifactCheckHandler,
  agent_review: agentReviewCheckHandler,
  test_result: testResultCheckHandler,
  manual_approval: manualApprovalCheckHandler,
};

export function getHandler<T extends AcceptanceCheckType>(
  type: T,
): AcceptanceCheckHandler<Extract<AcceptanceCheck, { type: T }>> {
  return handlerRegistry[type];
}

export async function runCheck(
  check: AcceptanceCheck,
  ctx: AcceptanceCheckContext,
  base: AcceptanceResultBase,
): Promise<AcceptanceResult> {
  switch (check.type) {
    case "command":
      return commandCheckHandler.run(check, ctx, base);
    case "file_exists":
      return fileExistsCheckHandler.run(check, ctx, base);
    case "file_contains":
      return fileContainsCheckHandler.run(check, ctx, base);
    case "json_shape":
      return jsonShapeCheckHandler.run(check, ctx, base);
    case "markdown_artifact":
      return markdownArtifactCheckHandler.run(check, ctx, base);
    case "agent_review":
      return agentReviewCheckHandler.run(check, ctx, base);
    case "test_result":
      return testResultCheckHandler.run(check, ctx, base);
    case "manual_approval":
      return manualApprovalCheckHandler.run(check, ctx, base);
    default: {
      const _exhaustive: never = check;
      return {
        ...base,
        passed: false,
        message: `Unsupported check type: ${(_exhaustive as AcceptanceCheck).type}`,
      };
    }
  }
}

export type { AcceptanceCheckContext, AcceptanceCheckHandler, AcceptanceResultBase } from "./types.js";
