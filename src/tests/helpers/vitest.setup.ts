import { afterEach } from "vitest";
import { cleanupTempDirs } from "./tempDirs.js";

afterEach(() => {
  cleanupTempDirs();
});
