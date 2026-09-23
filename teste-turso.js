async function iniciar() {

  try {

    // ========================================
    // CARREGAR .ENV
    // ========================================

    try {

      process.loadEnvFile('.env');

    } catch (erro) {

      console.error('');
      console.error(
        'Não foi possível carregar o arquivo .env.'
      );

      console.error(erro);
      process.exit(1);

    }

    // ========================================
    // VARIÁVEIS
    // ========================================

    const databaseUrl =
      process.env.TURSO_DATABASE_URL
        ?.trim();

    const authToken =
      process.env.TURSO_AUTH_TOKEN
        ?.trim();

    if (!databaseUrl) {

      console.error('');
      console.error(
        'TURSO_DATABASE_URL não encontrada no .env.'
      );

      process.exit(1);

    }

    if (!authToken) {

      console.error('');
      console.error(
        'TURSO_AUTH_TOKEN não encontrada no .env.'
      );

      process.exit(1);

    }

    // ========================================
    // DRIVER TURSO
    // ========================================

    const {
      connect
    } = await import(
      '@tursodatabase/serverless'
    );

    // ========================================
    // CONECTAR
    // ========================================

    const db = connect({

      url:
        databaseUrl,

      authToken:
        authToken

    });

    console.log('');
    console.log(
      '======================================'
    );

    console.log(
      ' HIPERION - TESTE DE CONEXÃO TURSO'
    );

    console.log(
      '======================================'
    );

    console.log('');

    console.log(
      '1. Conectando ao banco...'
    );

    // ========================================
    // CRIAR TABELA
    // ========================================

    await db.batch([
      `
        CREATE TABLE IF NOT EXISTS teste_conexao (

          id INTEGER
            PRIMARY KEY
            AUTOINCREMENT,

          mensagem TEXT
            NOT NULL,

          criado_em TEXT
            NOT NULL

        )
      `
    ]);

    console.log(
      '2. Tabela criada/verificada.'
    );

    // ========================================
    // INSERIR REGISTRO
    // ========================================

    const agora =
      new Date()
        .toISOString();

    await db.run(

      `
        INSERT INTO teste_conexao (

          mensagem,
          criado_em

        )

        VALUES (?, ?)
      `,

      'Hiperion conectado ao Turso',

      agora

    );

    console.log(
      '3. Registro enviado para o Turso.'
    );

    // ========================================
    // LER REGISTROS
    // ========================================

    const registros =
      await db.all(`
        SELECT

          id,
          mensagem,
          criado_em

        FROM teste_conexao

        ORDER BY id DESC

        LIMIT 5
      `);

    console.log('');
    console.log(
      '4. Registros encontrados:'
    );

    console.log('');

    for (
      const linha
      of registros
    ) {

      console.log(
        `ID: ${linha.id}`
      );

      console.log(
        `Mensagem: ${linha.mensagem}`
      );

      console.log(
        `Criado em: ${linha.criado_em}`
      );

      console.log(
        '--------------------------------------'
      );

    }

    console.log('');
    console.log(
      'CONEXÃO COM O TURSO FUNCIONANDO.'
    );

    console.log('');

  } catch (erro) {

    console.error('');
    console.error(
      'ERRO AO CONECTAR COM O TURSO:'
    );

    console.error('');
    console.error(erro);
    console.error('');

  }

}

iniciar();