// Builds the single Render Static Site: the public web at / and the Vite dashboard at /dashboard/.
// Render: Build Command `node scripts/build-site.js`, Publish Directory `_site`.
// The dashboard reads VITE_GYMGO_API_URL at build time (set it in the Static Site's environment).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '_site');
// Only what the browser needs; the local Express server, docs and tooling stay out of the site.
const PUBLIC_ENTRIES = ['index.html', 'pages', 'assets', 'data'];

if (!process.env.VITE_GYMGO_API_URL) {
  throw new Error('Falta VITE_GYMGO_API_URL (ej. https://sirid-systemsappmovil.onrender.com/api).');
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const entry of PUBLIC_ENTRIES) {
  const source = path.join(root, entry);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(out, entry), { recursive: true });
}

const dashboard = path.join(root, 'dashboard');
const run = (command) => execSync(command, { cwd: dashboard, stdio: 'inherit' });
run('npm ci');
run(`npm run build -- --outDir "${path.join(out, 'dashboard')}" --emptyOutDir`);

console.log(`Sitio listo en ${out}: web en / y dashboard en /dashboard/.`);
