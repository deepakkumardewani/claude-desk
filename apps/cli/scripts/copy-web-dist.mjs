import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(scriptsDir, "..");
const repoRoot = resolve(cliDir, "../..");
const webDist = resolve(repoRoot, "apps/web/dist");
const webDest = resolve(cliDir, "web");
const licenseSrc = resolve(repoRoot, "LICENSE");
const licenseDest = resolve(cliDir, "LICENSE");

if (!existsSync(resolve(webDist, "index.html"))) {
  throw new Error(`Missing ${webDist}/index.html — build the web app first`);
}

if (!existsSync(licenseSrc)) {
  throw new Error(`Missing ${licenseSrc}`);
}

rmSync(webDest, { recursive: true, force: true });
cpSync(webDist, webDest, { recursive: true });
cpSync(licenseSrc, licenseDest);
console.log(`copied ${webDist} -> ${webDest}`);
console.log(`copied ${licenseSrc} -> ${licenseDest}`);
