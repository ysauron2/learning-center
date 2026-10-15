// Mac sem conta paga da Apple: assina "no escuro" (ad-hoc) para o app abrir em Macs com chip Apple.
// Sem isso, o Mac diz que o app está "danificado". Com isso, basta clicar com o botão direito → Abrir, uma vez.
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
