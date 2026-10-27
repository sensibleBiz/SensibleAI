import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.resolve(backendRoot, "dist");

if (path.dirname(distDirectory) !== backendRoot || path.basename(distDirectory) !== "dist") {
  throw new Error("Refusing to clean an unexpected build directory");
}

await rm(distDirectory, { recursive: true, force: true });
