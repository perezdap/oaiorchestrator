import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactStore } from "../orchestrator/ArtifactStore.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function createStore(): { store: ArtifactStore; workspace: string; runDir: string } {
  const workspace = mkdtempSync(join(tmpdir(), "artifact-workspace-"));
  tempDirs.push(workspace);
  const runDir = join(workspace, ".runs", "test-run");
  const store = new ArtifactStore(runDir, workspace);
  return { store, workspace, runDir };
}

describe("ArtifactStore", () => {
  it("round-trips content via writeArtifact and readArtifact", () => {
    const { store } = createStore();
    store.writeArtifact("plan.md", "# Plan\n\nContent here.");
    expect(store.readArtifact("plan.md")).toBe("# Plan\n\nContent here.");
  });

  it("returns true from hasArtifact for written files", () => {
    const { store } = createStore();
    store.writeArtifact("notes.txt", "hello");
    expect(store.hasArtifact("notes.txt")).toBe(true);
  });

  it("returns false from hasArtifact for missing files", () => {
    const { store } = createStore();
    expect(store.hasArtifact("missing.txt")).toBe(false);
  });

  it("lists written artifacts", () => {
    const { store } = createStore();
    store.writeArtifact("a.md", "a");
    store.writeArtifact("b.md", "b");
    const listed = store.listArtifacts();
    expect(listed).toContain("a.md");
    expect(listed).toContain("b.md");
  });

  it("copies external files into artifacts", () => {
    const { store, workspace } = createStore();
    const sourcePath = join(workspace, "source.txt");
    writeFileSync(sourcePath, "external content", "utf-8");
    const dest = store.copyExternalToArtifact(sourcePath);
    expect(dest).toContain("source.txt");
    expect(store.readArtifact("source.txt")).toBe("external content");
  });

  it("throws when copying files outside workspace", () => {
    const { store, workspace } = createStore();
    const outsidePath = join(workspace, "..", "outside-workspace", "secret.txt");
    expect(() => store.copyExternalToArtifact(outsidePath)).toThrow(/blocked/i);
  });

  it("rejects artifact names that escape the artifacts directory", () => {
    const { store } = createStore();
    expect(() => store.writeArtifact("../../package.json", "pwned")).toThrow(/escapes/i);
    expect(() => store.readArtifact("../../package.json")).toThrow(/escapes/i);
    expect(() => store.copyExternalToArtifact("anything", "../../escape.txt")).toThrow(/escapes/i);
  });

  it("redacts secrets when writing artifacts", () => {
    const { store } = createStore();
    const secret = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    store.writeArtifact("output.md", `token=${secret}`);
    const content = store.readArtifact("output.md");
    expect(content).not.toContain(secret);
    expect(content).toContain("[REDACTED]");
  });
});
