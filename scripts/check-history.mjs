import { execFileSync, spawnSync } from "node:child_process";

const root = process.cwd();
const highConfidenceSecrets = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/
];

const history = execFileSync(
  "git",
  [
    "log",
    "--all",
    "-p",
    "--format=",
    "--",
    ".",
    ":!pnpm-lock.yaml",
    ":!scripts/check-history.mjs"
  ],
  { cwd: root, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 }
);
if (highConfidenceSecrets.some((pattern) => pattern.test(history))) {
  throw new Error(
    "high-confidence secret pattern found in Git history; rotate it before any approved history cleanup"
  );
}

const objectList = execFileSync("git", ["rev-list", "--objects", "--all"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024
});
const objectIds = objectList
  .split("\n")
  .filter(Boolean)
  .map((line) => line.split(" ", 1)[0])
  .join("\n");
const objectCheck = spawnSync(
  "git",
  ["cat-file", "--batch-check=%(objecttype) %(objectname) %(objectsize) %(rest)"],
  {
    cwd: root,
    encoding: "utf8",
    input: objectIds,
    maxBuffer: 64 * 1024 * 1024
  }
);
if (objectCheck.status !== 0) {
  throw new Error(objectCheck.stderr || "unable to inspect Git objects");
}

const oversized = objectCheck.stdout
  .split("\n")
  .filter((line) => {
    const [type, , size] = line.split(" ", 4);
    return type === "blob" && Number(size) > 5 * 1024 * 1024;
  });
if (oversized.length > 0) {
  throw new Error(`Git history contains ${oversized.length} blob(s) larger than 5 MiB`);
}

console.log("Git history check passed: no high-confidence secret patterns or blobs over 5 MiB.");
