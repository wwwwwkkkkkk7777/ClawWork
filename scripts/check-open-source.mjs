import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "LICENSE",
  "README.md",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "GOVERNANCE.md",
  "MAINTAINERS.md",
  "SECURITY.md",
  "SUPPORT.md",
  "THIRD_PARTY_NOTICES.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/dependabot.yml"
];

const failures = [];
for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) failures.push(`missing required file: ${file}`);
}

const license = readFileSync(join(root, "LICENSE"), "utf8");
if (
  !license.includes("GNU AFFERO GENERAL PUBLIC LICENSE") ||
  !license.includes("Version 3, 19 November 2007")
) {
  failures.push("LICENSE is not the complete GNU AGPL version 3 text");
}

const packageFiles = [
  "package.json",
  ...readdirSync(join(root, "apps"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `apps/${entry.name}/package.json`),
  ...readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}/package.json`)
].filter((file) => existsSync(join(root, file)));

for (const file of packageFiles) {
  const packageJson = JSON.parse(readFileSync(join(root, file), "utf8"));
  if (packageJson.license !== "AGPL-3.0-only") {
    failures.push(`${file} must declare license AGPL-3.0-only`);
  }
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
    if (packageJson[section]?.xlsx) {
      failures.push(`${file} still depends on vulnerable package xlsx`);
    }
  }
}

const mobileReadme = readFileSync(join(root, "apps/mobile/README.md"), "utf8");
if (/doubao-inspired/i.test(mobileReadme)) {
  failures.push("apps/mobile/README.md contains the removed branded design phrase");
}

const ignoredDirectories = new Set([
  ".git",
  ".runtime",
  ".worktrees",
  "coverage",
  "dist",
  "node_modules",
  "superpowers"
]);
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(path);
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;
    const content = readFileSync(path, "utf8");
    if (/\]\((?:\/?[a-zA-Z]:[\\/])/.test(content)) {
      failures.push(`${relative(root, path)} contains a machine-local absolute link`);
    }
  }
}
visit(root);

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8"
})
  .split("\0")
  .filter(Boolean);
for (const file of trackedFiles) {
  const normalized = file.replaceAll("\\", "/");
  if (
    (normalized === ".env" || normalized.includes("/.env")) &&
    !normalized.endsWith(".example")
  ) {
    failures.push(`tracked environment file is not an example: ${normalized}`);
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Open-source baseline verified (${packageFiles.length} packages).`);
}
