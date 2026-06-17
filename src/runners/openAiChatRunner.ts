/**
 * OpenAI-compatible chat completions runner — works against standard OpenAI,
 * Azure OpenAI, xAI/Grok, or any custom gateway exposing /v1/chat/completions.
 *
 * The model only returns text: it proposes, the host verifies. All
 * security-critical actions (downloads, hash checks, signatures, tests) run
 * as acceptance criteria in the host process, never inside the model.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { redactSecrets } from "../policies/commandPolicy.js";
import type { AgentRunner, AgentRunInput, AgentRunResult } from "./types.js";

export type OpenAiAuthStyle = "bearer" | "api-key";

export interface OpenAiChatRunnerOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
  /**
   * Header used to send the API key. Defaults to `bearer`
   * (`Authorization: Bearer <key>`); Azure OpenAI key auth uses `api-key`.
   * Auto-detected as `api-key` for *.azure.com endpoints when unset.
   */
  authStyle?: OpenAiAuthStyle;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 120_000;

const SYSTEM_CONTRACT = [
  "You are an agent inside an orchestration framework running on the user's Windows host.",
  "You cannot execute commands or modify files yourself. The host verifies every",
  "security-critical action (downloads, hash verification, signature checks, running tests)",
  "through acceptance gates that execute real PowerShell commands. Propose actions and",
  "provide data for the host to verify; never claim an action has been performed.",
  "When the phase lists expected output artifacts, emit each one as a fenced code block",
  'tagged with its filename, e.g. ```json name=research.json ... ``` so the host can save it.',
].join(" ");

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value !== "");
}

interface ChatCompletionResponse {
  id?: string;
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
}

export class OpenAiChatRunner implements AgentRunner {
  readonly name = "openai-chat";

  constructor(private readonly options: OpenAiChatRunnerOptions = {}) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const apiKey = firstNonEmpty(
      input.apiKey,
      this.options.apiKey,
      process.env.OPENAI_API_KEY,
    );
    if (!apiKey) {
      return {
        success: false,
        status: "error",
        error: "OPENAI_API_KEY is required for the OpenAI chat runner",
        artifacts: [],
      };
    }

    const requestUrl = this.resolveRequestUrl(input);
    const model = this.resolveModel(input);

    const body = {
      model,
      messages: [
        { role: "system", content: SYSTEM_CONTRACT },
        { role: "user", content: input.prompt },
      ],
      temperature: this.options.temperature ?? 0.2,
    };

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    try {
      const res = await fetch(requestUrl, {
        method: "POST",
        headers: {
          ...this.authHeader(requestUrl, apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          status: "error",
          error: redactSecrets(`OpenAI chat runner failed: HTTP ${res.status}: ${text}`),
          artifacts: [],
        };
      }

      const json = (await res.json()) as ChatCompletionResponse;
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        return {
          success: false,
          status: "error",
          error: "OpenAI chat runner failed: response contained no message content",
          artifacts: [],
        };
      }

      const artifacts = this.writeArtifacts(content, input);

      return {
        success: true,
        status: "finished",
        result: redactSecrets(content),
        agentSessionId: `${this.name}-${input.phaseId}`,
        runSessionId: json.id,
        artifacts,
      };
    } catch (err) {
      const message =
        controller.signal.aborted
          ? `request timed out after ${this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : String(err);
      return {
        success: false,
        status: "error",
        error: redactSecrets(`OpenAI chat runner failed: ${message}`),
        artifacts: [],
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveRequestUrl(input: AgentRunInput): string {
    const raw = firstNonEmpty(
      input.agentConfig.baseUrl,
      this.options.baseUrl,
      process.env.OPENAI_BASE_URL,
    ) ?? DEFAULT_BASE_URL;
    // Accept full endpoint URLs (e.g. an Azure endpoint ending in
    // ending in /chat/completions, optionally with a trailing slash and/or
    // ?api-version=...) as well as base URLs that need /chat/completions
    // appended. Parse with URL so the query string is preserved regardless of
    // where the slash falls.
    try {
      const url = new URL(raw);
      const path = url.pathname.replace(/\/+$/, "");
      url.pathname = /\/chat\/completions$/i.test(path) ? path : `${path}/chat/completions`;
      return url.toString();
    } catch {
      const trimmed = raw.replace(/\/+$/, "");
      return /\/chat\/completions$/i.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
    }
  }

  private resolveModel(input: AgentRunInput): string {
    const configured = input.agentConfig.model;
    if (configured && configured !== "auto") {
      return configured;
    }
    return firstNonEmpty(this.options.model, process.env.OPENAI_DEFAULT_MODEL) ?? DEFAULT_MODEL;
  }

  private authHeader(requestUrl: string, apiKey: string): Record<string, string> {
    const style = this.options.authStyle ?? this.detectAuthStyle(requestUrl);
    return style === "api-key"
      ? { "api-key": apiKey }
      : { Authorization: `Bearer ${apiKey}` };
  }

  private detectAuthStyle(requestUrl: string): OpenAiAuthStyle {
    const envStyle = firstNonEmpty(process.env.OPENAI_AUTH_STYLE)?.toLowerCase();
    if (envStyle === "api-key" || envStyle === "azure") return "api-key";
    if (envStyle === "bearer") return "bearer";
    try {
      return new URL(requestUrl).hostname.toLowerCase().endsWith(".azure.com")
        ? "api-key"
        : "bearer";
    } catch {
      return "bearer";
    }
  }

  /**
   * Extracts fenced blocks tagged `name=<filename>` and writes them under the
   * run's artifacts directory. PhaseRunner separately backfills any expected
   * output that the model did not emit as a named block.
   */
  private writeArtifacts(content: string, input: AgentRunInput): string[] {
    const written: string[] = [];
    const fenceRegex = /```[^\s`]*[ \t]+name=([^\s`]+)[^\n]*\n([\s\S]*?)```/g;
    const artifactsRoot = resolve(input.artifactsDir);

    let match: RegExpExecArray | null;
    while ((match = fenceRegex.exec(content)) !== null) {
      const name = match[1];
      const body = match[2];
      const target = resolve(join(artifactsRoot, name));
      if (target !== artifactsRoot && !target.startsWith(artifactsRoot + "\\") && !target.startsWith(artifactsRoot + "/")) {
        continue;
      }
      mkdirSync(resolve(target, ".."), { recursive: true });
      writeFileSync(target, redactSecrets(body), "utf-8");
      written.push(name);
    }

    return written;
  }
}
