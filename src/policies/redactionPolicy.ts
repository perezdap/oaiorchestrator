export interface RedactionOptions {
  /** When false, persistence and log redaction is skipped. Defaults to true. */
  enabled?: boolean;
}

const DEFAULT_OPTIONS: Required<RedactionOptions> = {
  enabled: true,
};

let globalOptions: RedactionOptions = { ...DEFAULT_OPTIONS };

export function configureRedaction(options: RedactionOptions): void {
  globalOptions = { ...globalOptions, ...options };
}

export function getRedactionOptions(): Readonly<RedactionOptions> {
  return { ...globalOptions };
}

const SECRET_PATTERNS = [
  /cursor_[a-zA-Z0-9_-]{10,}/g,
  /ghp_[a-zA-Z0-9]{20,}/g,
  // OpenAI keys, including project/service-account variants like sk-proj-…
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
  /api[_-]?key\s*[:=]\s*["']?[^\s"']+/gi,
];

function resolveOptions(options?: RedactionOptions): Required<RedactionOptions> {
  return { ...DEFAULT_OPTIONS, ...globalOptions, ...options };
}

export function redactSecrets(text: string, options?: RedactionOptions): string {
  const opts = resolveOptions(options);
  if (!opts.enabled) {
    return text;
  }

  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}

export function redactSecretsDeep<T>(value: T, options?: RedactionOptions): T {
  const opts = resolveOptions(options);
  if (!opts.enabled) {
    return value;
  }

  if (typeof value === "string") {
    return redactSecrets(value, opts) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecretsDeep(item, opts)) as T;
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = redactSecretsDeep(entry, opts);
    }
    return result as T;
  }

  return value;
}
