const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "public");

const COPY_DIRS = ["css", "js", "templates", "JuneInspectionList2026"];
const SKIP_NAMES = new Set(["supabase-config.js", "node_modules", ".git", "public"]);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_NAMES.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

if (fs.existsSync(out)) fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const dir of COPY_DIRS) {
  const src = path.join(root, dir);
  if (fs.existsSync(src)) copyDir(src, path.join(out, dir));
}

for (const name of fs.readdirSync(root)) {
  if (!name.endsWith(".html")) continue;
  fs.copyFileSync(path.join(root, name), path.join(out, name));
}

process.env.SUPABASE_CONFIG_OUT = path.join(out, "js", "supabase-config.js");
require("./generate-supabase-config.js");

console.log("Vercel build output ready in public/");
