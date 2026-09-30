const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const raiz = __dirname;
const bancoAtivoPath = path.join(raiz, 'banco', 'hiperion.db');
const backupPath = path.join(raiz, 'banco', 'hiperion-backup-20260824.db');

function valor(valorOriginal) {
  return valorOriginal === undefined ? null : valorOriginal;
}

function serializavel(valorOriginal) {
  if (typeof valorOriginal === 'bigint') return Number(valorOriginal);
  if (Array.isArray(valorOriginal)) return valorOriginal.map(serializavel);
  if (valorOriginal && typeof valorOriginal === 'object') {
    return Object.fromEntries(
      Object.entries(valorOriginal).map(([chave, item]) => [chave, serializavel(item)])
    );
  }
  return valorOriginal;
}

function insert(tabela, colunas, registro) {
  return {
    sql: `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`,
    args: colunas.map((coluna) => valor(registro[coluna]))
  };
}

async function executar() {
  process.loadEnvFile(path.join(raiz, '.env'));

  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!url || !authToken) throw new Error('Credenciais do Turso ausentes no .env.');

  const bancoAtivo = new DatabaseSync(bancoAtivoPath, { readOnly: true });
  const backup = new DatabaseSync(backupPath, { readOnly: true });

  const usuarios = bancoAtivo.prepare('SELECT * FROM usuarios ORDER BY id').all();
  const protocolos = backup.prepare('SELECT * FROM protocolos ORDER BY id').all();
  const itens = backup.prepare('SELECT * FROM protocolo_itens ORDER BY id').all();

  bancoAtivo.close();
  backup.close();

  if (usuarios.length !== 10 || protocolos.length !== 5 || itens.length !== 15) {
    throw new Error(`Contagens locais inesperadas: ${usuarios.length} usuários, ${protocolos.length} protocolos, ${itens.length} itens.`);
  }

  const { connect } = await import('@tursodatabase/serverless');
  const db = connect({ url, authToken });

  const tabelasProtegidas = ['sessoes', 'protocolo_itens', 'protocolos', 'usuarios', 'clientes'];
  const copiaTurso = {};
  for (const tabela of tabelasProtegidas) {
    copiaTurso[tabela] = await db.all(`SELECT * FROM ${tabela}`);
  }

  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const copiaPath = path.join(raiz, 'banco', `turso-backup-${carimbo}.json`);
  fs.writeFileSync(copiaPath, JSON.stringify(serializavel(copiaTurso), null, 2), { encoding: 'utf8', flag: 'wx' });

  const colunasDisponiveis = async (tabela) => new Set(
    (await db.all(`PRAGMA table_info(${tabela})`)).map((coluna) => coluna.name)
  );
  const filtrarColunas = (colunas, disponiveis) => colunas.filter((coluna) => disponiveis.has(coluna));

  const colunasUsuario = filtrarColunas([
    'id', 'nome', 'departamento', 'perfil', 'ativo', 'criado_em',
    'usuario', 'senha_hash', 'senha_salt', 'ultimo_login'
  ], await colunasDisponiveis('usuarios'));
  const colunasProtocolo = filtrarColunas([
    'id', 'numero', 'cliente', 'cliente_id', 'cliente_box', 'endereco_empresa',
    'departamento', 'descricao', 'competencia', 'vencimento', 'emissor', 'entregador',
    'observacao', 'status', 'recebido_por', 'assinatura', 'criado_em', 'entregue_em',
    'motivo_cancelamento', 'cancelado_por', 'cancelado_em', 'excluido',
    'excluido_em', 'excluido_por'
  ], await colunasDisponiveis('protocolos'));
  const colunasItem = filtrarColunas(
    ['id', 'protocolo_id', 'descricao', 'competencia', 'vencimento', 'ordem', 'criado_em'],
    await colunasDisponiveis('protocolo_itens')
  );

  const operacoes = [
    'DELETE FROM sessoes',
    'DELETE FROM protocolo_itens',
    'DELETE FROM protocolos',
    'DELETE FROM usuarios',
    ...usuarios.map((registro) => insert('usuarios', colunasUsuario, registro)),
    ...protocolos.map((registro) => insert('protocolos', colunasProtocolo, registro)),
    ...itens.map((registro) => insert('protocolo_itens', colunasItem, registro)),
    "DELETE FROM sqlite_sequence WHERE name IN ('usuarios', 'protocolos', 'protocolo_itens')",
    "INSERT INTO sqlite_sequence(name, seq) VALUES ('usuarios', 10)",
    "INSERT INTO sqlite_sequence(name, seq) VALUES ('protocolos', 5)",
    `INSERT INTO sqlite_sequence(name, seq) VALUES ('protocolo_itens', ${Math.max(...itens.map((item) => Number(item.id)))})`
  ];

  try {
    await db.batch(operacoes, { mode: 'immediate' });
  } catch (erro) {
    throw new Error(`Migração cancelada sem confirmar alterações. Cópia de segurança: ${copiaPath}. Motivo: ${erro.message}`);
  }

  const verificacao = {
    usuarios: Number((await db.get('SELECT COUNT(*) AS total FROM usuarios')).total),
    clientes: Number((await db.get('SELECT COUNT(*) AS total FROM clientes')).total),
    protocolos: Number((await db.get('SELECT COUNT(*) AS total FROM protocolos')).total),
    itens: Number((await db.get('SELECT COUNT(*) AS total FROM protocolo_itens')).total),
    sessoes: Number((await db.get('SELECT COUNT(*) AS total FROM sessoes')).total),
    proximoProtocolo: Number((await db.get('SELECT COALESCE(MAX(numero), 0) + 1 AS numero FROM protocolos')).numero)
  };

  if (
    verificacao.usuarios !== 10 || verificacao.clientes !== 39 ||
    verificacao.protocolos !== 5 || verificacao.itens !== 15 ||
    verificacao.sessoes !== 0 || verificacao.proximoProtocolo !== 6
  ) {
    throw new Error(`Migração executada, mas a validação divergiu: ${JSON.stringify(verificacao)}. Restaure usando ${copiaPath}.`);
  }

  console.log(JSON.stringify({ ok: true, copiaPath, verificacao }, null, 2));
}

executar().catch((erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
