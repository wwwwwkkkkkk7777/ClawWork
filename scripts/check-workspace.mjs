import { existsSync, readFileSync } from "node:fs";

if (!existsSync("package.json")) {
  throw new Error("missing root package.json");
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (!pkg.workspaces && !pkg.packageManager) {
  throw new Error("workspace metadata not configured");
}
