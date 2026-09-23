const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const raiz = path.resolve(__dirname, '..');
const ignorados = new Set(['node_modules', '.git']);

function listarJavaScript(diretorio) {
  return fs.readdirSync(diretorio, { withFileTypes: true }).flatMap(entrada => {
    if (ignorados.has(entrada.name)) return [];
    const caminho = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) return listarJavaScript(caminho);
    return entrada.isFile() && entrada.name.endsWith('.js') ? [caminho] : [];
  });
}

for (const arquivo of listarJavaScript(raiz)) {
  const resultado = spawnSync(process.execPath, ['--check', arquivo], {
    stdio: 'inherit'
  });
  if (resultado.status !== 0) process.exit(resultado.status || 1);
}

console.log('Sintaxe JavaScript validada com sucesso.');
