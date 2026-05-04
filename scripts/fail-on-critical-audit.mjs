#!/usr/bin/env node
/**
 * Exit 1 only when npm audit JSON reports critical vulnerabilities.
 * Medium/low/high do not fail the pipeline (L2 maturity gap design).
 */
import { readFileSync, existsSync } from "node:fs";

const path = process.argv[2] ?? "npm-audit-report.json";
if (!existsSync(path)) {
  console.error("Missing audit file:", path);
  process.exit(1);
}
let data;
try {
  data = JSON.parse(readFileSync(path, "utf8"));
} catch {
  console.error("Invalid JSON in audit file:", path);
  process.exit(1);
}
const critical = data.metadata?.vulnerabilities?.critical ?? 0;
console.log("npm audit summary:", data.metadata?.vulnerabilities ?? data);
if (critical > 0) {
  console.error(`Failing: ${critical} critical vulnerability/vulnerabilities`);
  process.exit(1);
}
console.log("No critical vulnerabilities; pipeline continues.");
process.exit(0);
