async function iniciar() {

  try {

    // ========================================================
    // CARREGAR .ENV
    // ========================================================

    process.loadEnvFile('.env');

    const databaseUrl =
      process.env.TURSO_DATABASE_URL
        ?.trim();

    const authToken =
      process.env.TURSO_AUTH_TOKEN
        ?.trim();

    if (!databaseUrl || !authToken) {

      console.error('');
      console.error(
        'URL ou token do Turso não encontrados no .env.'
      );
      console.error('');

      process.exit(1);
    }

    // ========================================================
    // DRIVER TURSO
    // ========================================================

    const {
      connect
    } = await import(
      '@tursodatabase/serverless'
    );

    const db = connect({
      url: databaseUrl,
      authToken: authToken
    });

    console.log('');
    console.log(
      '========================================'
    );
    console.log(
      ' HIPERION - PREPARAÇÃO DO BANCO TURSO'
    );
    console.log(
      '========================================'
    );
    console.log('');

    // ========================================================
    // CRIAR TABELAS
    // ========================================================

    console.log(
      '1. Criando estrutura do banco...'
    );

    await db.batch([

      // ======================================================
      // USUÁRIOS
      // ======================================================

      `
        CREATE TABLE IF NOT EXISTS usuarios (

          id INTEGER
            PRIMARY KEY
            AUTOINCREMENT,

          nome TEXT
            NOT NULL,

          departamento TEXT
            NOT NULL,

          perfil TEXT
            NOT NULL,

          ativo INTEGER
            NOT NULL
            DEFAULT 1,

          criado_em TEXT
            NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

          usuario TEXT,

          senha_hash TEXT,

          senha_salt TEXT,

          ultimo_login TEXT

        )
      `,

      // ======================================================
      // LOGIN ÚNICO
      // ======================================================

      `
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_usuarios_login

        ON usuarios(usuario)

        WHERE usuario IS NOT NULL
      `,

      // ======================================================
      // PROTOCOLOS
      // ======================================================

      `
        CREATE TABLE IF NOT EXISTS protocolos (

          id INTEGER
            PRIMARY KEY
            AUTOINCREMENT,

          numero INTEGER
            NOT NULL
            UNIQUE,

          cliente TEXT
            NOT NULL,

          cliente_id INTEGER,

          cliente_box TEXT,

          endereco_empresa TEXT,

          departamento TEXT
            NOT NULL,

          descricao TEXT
            NOT NULL,

          competencia TEXT,

          vencimento TEXT,

          emissor TEXT
            NOT NULL,

          entregador TEXT
            NOT NULL,

          observacao TEXT,

          status TEXT
            NOT NULL
            DEFAULT 'Aguardando entrega',

          recebido_por TEXT,

          assinatura TEXT,

          criado_em TEXT
            NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

          entregue_em TEXT,

          motivo_cancelamento TEXT,

          cancelado_por TEXT,

          cancelado_em TEXT,

          excluido INTEGER
            NOT NULL
            DEFAULT 0,

          excluido_em TEXT,

          excluido_por TEXT

        )
      `,

      // ======================================================
      // ITENS / DOCUMENTOS DO PROTOCOLO
      // ======================================================

      `
        CREATE TABLE IF NOT EXISTS protocolo_itens (

          id INTEGER
            PRIMARY KEY
            AUTOINCREMENT,

          protocolo_id INTEGER
            NOT NULL,

          descricao TEXT
            NOT NULL,

          vencimento TEXT,

          ordem INTEGER
            NOT NULL
            DEFAULT 1,

          criado_em TEXT
            NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

          FOREIGN KEY(protocolo_id)
            REFERENCES protocolos(id)
            ON DELETE CASCADE

        )
      `,

      // ======================================================
      // ÍNDICE DOS ITENS
      // ======================================================

      `
        CREATE INDEX IF NOT EXISTS
        idx_protocolo_itens_protocolo

        ON protocolo_itens(protocolo_id)
      `,

      `
        CREATE TABLE IF NOT EXISTS clientes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          nome_normalizado TEXT NOT NULL UNIQUE,
          box TEXT,
          endereco TEXT,
          numero TEXT,
          complemento TEXT,
          bairro TEXT,
          cidade TEXT,
          uf TEXT,
          cep TEXT,
          observacao TEXT,
          ativo INTEGER NOT NULL DEFAULT 1,
          criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `,

      `CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome)`,

      `CREATE INDEX IF NOT EXISTS idx_clientes_box ON clientes(box)`,

      // ======================================================
      // SESSÕES
      // ======================================================

      `
        CREATE TABLE IF NOT EXISTS sessoes (

          id INTEGER
            PRIMARY KEY
            AUTOINCREMENT,

          token TEXT
            NOT NULL
            UNIQUE,

          usuario_id INTEGER
            NOT NULL,

          criado_em TEXT
            NOT NULL
            DEFAULT CURRENT_TIMESTAMP,

          expira_em TEXT
            NOT NULL,

          FOREIGN KEY(usuario_id)
            REFERENCES usuarios(id)

        )
      `

    ]);

    console.log(
      '2. Estrutura criada.'
    );

    // ========================================================
    // VERIFICAR TABELAS
    // ========================================================

    const tabelas =
      await db.all(`
        SELECT
          name

        FROM sqlite_master

        WHERE
          type = 'table'

        ORDER BY name
      `);

    console.log('');
    console.log(
      '3. Tabelas encontradas no Turso:'
    );
    console.log('');

    for (
      const tabela
      of tabelas
    ) {

      console.log(
        `- ${tabela.name}`
      );

    }

    console.log('');
    console.log(
      '========================================'
    );
    console.log(
      ' BANCO HIPERION PREPARADO COM SUCESSO'
    );
    console.log(
      '========================================'
    );
    console.log('');

    console.log(
      'Nenhum dado real da empresa foi importado.'
    );

    console.log(
      'Este banco continua sendo apenas o ambiente de teste.'
    );

    console.log('');

  } catch (erro) {

    console.error('');
    console.error(
      'ERRO AO PREPARAR O BANCO TURSO:'
    );
    console.error('');

    console.error(erro);

    console.error('');

  }

}

iniciar();
