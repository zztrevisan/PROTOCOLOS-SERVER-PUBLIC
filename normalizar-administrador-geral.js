const fs = require('fs');
const path = require('path');

async function executar() {
  process.loadEnvFile(path.join(__dirname, '.env'));
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!url || !authToken) throw new Error('Credenciais do Turso ausentes.');

  const { connect } = await import('@tursodatabase/serverless');
  const db = connect({ url, authToken });
  const afetados = await db.all(`
    SELECT id, nome, usuario, departamento, perfil, ativo
    FROM usuarios
    WHERE perfil = 'admin'
      AND LOWER(TRIM(COALESCE(usuario, ''))) <> 'admin'
    ORDER BY id
  `);

  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const copiaPath = path.join(__dirname, 'banco', `turso-backup-admin-${carimbo}.json`);
  fs.writeFileSync(copiaPath, JSON.stringify({ criadoEm: new Date().toISOString(), afetados }, null, 2), {
    encoding: 'utf8',
    flag: 'wx'
  });

  await db.batch([
    `DELETE FROM sessoes
     WHERE usuario_id IN (
       SELECT id FROM usuarios
       WHERE perfil = 'admin'
         AND LOWER(TRIM(COALESCE(usuario, ''))) <> 'admin'
     )`,
    `UPDATE usuarios
     SET perfil = 'emissor'
     WHERE perfil = 'admin'
       AND LOWER(TRIM(COALESCE(usuario, ''))) <> 'admin'`
  ], { mode: 'immediate' });

  const administradores = await db.all(`
    SELECT id, nome, usuario, departamento, perfil, ativo
    FROM usuarios
    WHERE perfil = 'admin'
  `);
  const aindaInvalidos = await db.get(`
    SELECT COUNT(*) AS total
    FROM usuarios
    WHERE perfil = 'admin'
      AND LOWER(TRIM(COALESCE(usuario, ''))) <> 'admin'
  `);

  if (Number(aindaInvalidos.total) !== 0 || administradores.length !== 1) {
    throw new Error('A normalização foi executada, mas a validação final divergiu.');
  }

  console.log(JSON.stringify({
    ok: true,
    alterados: afetados.map(({ id, nome, usuario, departamento }) => ({ id, nome, usuario, departamento })),
    administradorGeral: administradores[0],
    copiaPath
  }, null, 2));
}

executar().catch((erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
