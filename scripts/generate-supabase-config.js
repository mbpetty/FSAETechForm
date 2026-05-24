const fs = require("fs");
const path = require("path");

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_ANON_KEY?.trim();

if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY. Set them in Vercel → Settings → Environment Variables."
  );
  process.exit(1);
}

if (url.includes("YOUR_PROJECT") || key.includes("YOUR_ANON")) {
  console.error("Replace placeholder Supabase values with your real project URL and anon key.");
  process.exit(1);
}

const outPath =
  process.env.SUPABASE_CONFIG_OUT || path.join(__dirname, "..", "js", "supabase-config.js");

fs.mkdirSync(path.dirname(outPath), { recursive: true });

const contents = `// Generated at build time — do not edit on Vercel deployments.
window.SUPABASE_URL = ${JSON.stringify(url)};
window.SUPABASE_ANON_KEY = ${JSON.stringify(key)};
`;

fs.writeFileSync(outPath, contents, "utf8");
console.log(`Wrote ${path.relative(process.cwd(), outPath)} for deployment.`);
