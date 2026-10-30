// Levanta el MCP local de Penpot (`npm run penpot`).
// - CI=true: pnpm no se frena preguntando si reinstala node_modules en la caché de npx.
// - El análisis HTTPS de AVG reemplaza los certificados, y Node no confía en su raíz
//   si no se le indica. Nunca desactivar strict-ssl para evitar este error.
const { spawn } = require('child_process');
const { existsSync } = require('fs');

const AVG_CERT = 'C:\\ProgramData\\AVG\\Antivirus\\wscert.pem';

const env = { ...process.env, CI: 'true' };
if (!env.NODE_EXTRA_CA_CERTS && existsSync(AVG_CERT)) {
  env.NODE_EXTRA_CA_CERTS = AVG_CERT;
}

const child = spawn('npx -y -p pnpm@9 -p @penpot/mcp@stable penpot-mcp', {
  env,
  shell: true,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
