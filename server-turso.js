const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();

const PORT =
  process.env.PORT ||
  3000;


// ============================================================
// CARREGAR .ENV
// ============================================================

if (
  !process.env.TURSO_DATABASE_URL ||
  !process.env.TURSO_AUTH_TOKEN
) {

  try {

    process.loadEnvFile('.env');

  } catch (erro) {

    console.log(
      'Arquivo .env não carregado automaticamente.'
    );

  }

}


// ============================================================
// CONEXÃO COM TURSO
// ============================================================

let db = null;


async function garantirDb() {

  if (db) {

    return db;

  }

  const url =
    process.env
      .TURSO_DATABASE_URL
      ?.trim();

  const authToken =
    process.env
      .TURSO_AUTH_TOKEN
      ?.trim();


  if (
    !url ||
    !authToken
  ) {

    throw new Error(
      'TURSO_DATABASE_URL ou TURSO_AUTH_TOKEN não configurados.'
    );

  }


  const {
    connect
  } =
    await import(
      '@tursodatabase/serverless'
    );


  db =
    connect({

      url,

      authToken

    });

  await garantirEstruturaOperacional(db);


  return db;

}

async function adicionarColunaTurso(conexao, tabela, coluna, definicao) {
  try {
    await conexao.run(
      `ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`
    );
  } catch (erro) {
    if (!/duplicate column|already exists/i.test(String(erro?.message || erro))) {
      throw erro;
    }
  }
}

async function garantirEstruturaOperacional(conexao) {
  await conexao.run(`
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
  `);

  await adicionarColunaTurso(conexao, 'protocolos', 'endereco_empresa', 'TEXT');
  await adicionarColunaTurso(conexao, 'protocolos', 'cliente_id', 'INTEGER');
  await adicionarColunaTurso(conexao, 'protocolos', 'cliente_box', 'TEXT');
  await adicionarColunaTurso(conexao, 'protocolo_itens', 'competencia', 'TEXT');

  await conexao.run('CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome)');
  await conexao.run('CREATE INDEX IF NOT EXISTS idx_clientes_box ON clientes(box)');

  const clientesIniciais = [
    ['LIN QIYING', '742'], ['RISCAZERA', '802'],
    ['XIN XIN COMERCIO', '138'], ['MODAS VOV', '254'],
    ['MOREMEL', '2185'], ['CENTRO MEDICO DA MULHER', '111'],
    ['DECO FORM', '279'], ['SANSEI IMOVEIS', '93'],
    ['LANCHONETE TANZINHO', '2330'], ['3Y ADMINISTRACAO', '2252'],
    ['GB COMERCIO', '2177'], ['HOURA FAMILY', '2338'],
    ['JWC CONFECCOES', '2248'], ['PORTAL DA COREIA', '553'],
    ['SAZ COMERCIO', '862'], ['STACCATO', '2213'],
    ['NILSON LEE', '2094'], ['TRISSOLARIS', '2220'],
    ['BELLA VIDA', '2264'], ['HOME ART', '2186'],
    ['DMJ CLUTCHS', '2198'], ['LEAO COMERCIAL', '2235'],
    ['PROBELLAS CONFECCOES', '785'], ['TJ COMERCIO', '2137'],
    ['MEGA TEXTIL', '2266'], ['LILY MEIC', '677'],
    ['BJ COMERCIO', '2296'], ['NAMINE CONFECCOES', '2215'],
    ['DREAMERS COMERCIO', '2197'], ['ATLANTA', '2234'],
    ['MEGAVICTOR', '729'], ['CAMALEAO', '2158'],
    ['JOALHERIA ASTRA', '436'], ['STELLA RELOJOARIA', '217'],
    ['GRANO COMERCIO', '2210'], ['FAROL SP', '751'],
    ['APOLLO TEXTIL', '2270'], ['CLINIQUE & CO', '2229'],
    ['MIRAO DISTRIBUIDORA', '2240']
  ];

  for (const [nome, box] of clientesIniciais) {
    await conexao.run(
      'INSERT OR IGNORE INTO clientes (nome, nome_normalizado, box) VALUES (?, ?, ?)',
      nome,
      textoNormalizado(nome),
      box
    );
  }
}


// ============================================================
// FUNÇÕES SQL
// ============================================================

async function sqlGet(
  conexao,
  sql,
  args = []
) {

  return await conexao.get(
    sql,
    ...args
  );

}


async function sqlAll(
  conexao,
  sql,
  args = []
) {

  return await conexao.all(
    sql,
    ...args
  );

}


async function sqlRun(
  conexao,
  sql,
  args = []
) {

  return await conexao.run(
    sql,
    ...args
  );

}


// ============================================================
// EXPRESS
// ============================================================

app.use(

  express.json({

    limit:
      '5mb'

  })

);


app.use(

  express.static(

    path.join(
      __dirname,
      'public'
    )

  )

);


// ============================================================
// LOGIN / SESSÃO
// ============================================================

const COOKIE_SESSAO =
  'hiperion_session';


const DURACAO_SESSAO =
  8 *
  60 *
  60 *
  1000;


// ============================================================
// FUNÇÕES DE LOGIN
// ============================================================

function lerCookies(req) {

  const cabecalho =
    req.headers.cookie ||
    '';


  const cookies =
    {};


  cabecalho
    .split(';')
    .forEach(
      item => {

        const partes =
          item
            .trim()
            .split('=');


        const nome =
          partes.shift();


        const valor =
          partes.join('=');


        if (nome) {

          cookies[nome] =
            decodeURIComponent(
              valor ||
              ''
            );

        }

      }
    );


  return cookies;

}


// ============================================================

function hashToken(token) {

  return crypto
    .createHash(
      'sha256'
    )
    .update(
      token
    )
    .digest(
      'hex'
    );

}


// ============================================================

function verificarSenha(
  senha,
  salt,
  hashSalvo
) {

  try {

    if (
      !senha ||
      !salt ||
      !hashSalvo
    ) {

      return false;

    }


    const hashCalculado =
      crypto.scryptSync(

        senha,

        salt,

        64

      );


    const hashBanco =
      Buffer.from(

        hashSalvo,

        'hex'

      );


    if (
      hashCalculado.length !==
      hashBanco.length
    ) {

      return false;

    }


    return crypto
      .timingSafeEqual(

        hashCalculado,

        hashBanco

      );


  } catch (erro) {

    console.error(
      'Erro ao verificar senha:',
      erro
    );


    return false;

  }

}


// ============================================================

function gerarHashSenha(
  senha
) {

  const salt =
    crypto
      .randomBytes(32)
      .toString(
        'hex'
      );


  const hash =
    crypto
      .scryptSync(

        senha,

        salt,

        64

      )
      .toString(
        'hex'
      );


  return {

    salt,

    hash

  };

}


// ============================================================

async function criarSessao(
  usuarioId
) {

  const database =
    await garantirDb();


  const tokenReal =
    crypto
      .randomBytes(32)
      .toString(
        'hex'
      );


  const tokenBanco =
    hashToken(
      tokenReal
    );


  const expira =
    new Date(

      Date.now() +
      DURACAO_SESSAO

    );


  await sqlRun(

    database,

    `
      INSERT INTO sessoes (

        token,
        usuario_id,
        expira_em

      )

      VALUES (
        ?, ?, ?
      )
    `,

    [

      tokenBanco,

      usuarioId,

      expira
        .toISOString()

    ]

  );


  return {

    token:
      tokenReal,

    expira

  };

}


// ============================================================

async function obterUsuarioLogado(
  req
) {

  try {

    const database =
      await garantirDb();


    const cookies =
      lerCookies(
        req
      );


    const tokenReal =
      cookies[
        COOKIE_SESSAO
      ];


    if (!tokenReal) {

      return null;

    }


    const tokenBanco =
      hashToken(
        tokenReal
      );


    const sessao =
      await sqlGet(

        database,

        `
          SELECT

            s.id
              AS sessao_id,

            s.expira_em,

            u.id,
            u.nome,
            u.departamento,
            u.perfil,
            u.usuario,
            u.ativo

          FROM sessoes s

          INNER JOIN usuarios u

            ON u.id =
               s.usuario_id

          WHERE
            s.token = ?

          LIMIT 1
        `,

        [
          tokenBanco
        ]

      );


    if (!sessao) {

      return null;

    }


    if (
      Number(
        sessao.ativo
      ) !== 1
    ) {

      await sqlRun(

        database,

        `
          DELETE FROM sessoes

          WHERE id = ?
        `,

        [
          sessao.sessao_id
        ]

      );


      return null;

    }


    const expira =
      new Date(
        sessao.expira_em
      );


    if (
      isNaN(
        expira.getTime()
      ) ||

      expira.getTime() <=
      Date.now()
    ) {

      await sqlRun(

        database,

        `
          DELETE FROM sessoes

          WHERE id = ?
        `,

        [
          sessao.sessao_id
        ]

      );


      return null;

    }


    return {

      id:
        Number(
          sessao.id
        ),

      nome:
        sessao.nome,

      departamento:
        sessao.departamento,

      perfil:
        sessao.perfil,

      usuario:
        sessao.usuario

    };


  } catch (erro) {

    console.error(
      'Erro ao verificar sessão:',
      erro
    );


    return null;

  }

}


// ============================================================
// COOKIE
// ============================================================

function criarCookie(
  token,
  maxAge
) {

  let secure =
    '';


  if (
    process.env.VERCEL ||
    process.env.NODE_ENV ===
    'production'
  ) {

    secure =
      '; Secure';

  }


  return (

    `${COOKIE_SESSAO}=` +

    `${encodeURIComponent(
      token
    )}` +

    '; HttpOnly' +

    '; SameSite=Lax' +

    '; Path=/' +

    `; Max-Age=${maxAge}` +

    secure

  );

}


// ============================================================
// LOGIN
// ============================================================

app.post(

  '/api/login',

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const {
        usuario,
        senha
      } =
        req.body;


      if (
        !usuario ||
        !senha
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Usuário e senha são obrigatórios.'

          });

      }


      const login =
        usuario
          .trim()
          .toLowerCase();


      const cadastro =
        await sqlGet(

          database,

          `
            SELECT

              id,
              nome,
              departamento,
              perfil,
              usuario,
              senha_hash,
              senha_salt,
              ativo

            FROM usuarios

            WHERE

              LOWER(usuario) =
              LOWER(?)

              AND ativo = 1

            LIMIT 1
          `,

          [
            login
          ]

        );


      if (
        !cadastro ||

        !verificarSenha(

          senha,

          cadastro.senha_salt,

          cadastro.senha_hash

        )
      ) {

        return res
          .status(401)
          .json({

            erro:
              'Usuário ou senha incorretos.'

          });

      }


      // ==============================================
      // REMOVER SESSÕES EXPIRADAS
      // ==============================================

      await sqlRun(

        database,

        `
          DELETE FROM sessoes

          WHERE expira_em <= ?
        `,

        [

          new Date()
            .toISOString()

        ]

      );


      // ==============================================
      // NOVA SESSÃO
      // ==============================================

      const novaSessao =
        await criarSessao(
          cadastro.id
        );


      await sqlRun(

        database,

        `
          UPDATE usuarios

          SET
            ultimo_login = ?

          WHERE id = ?
        `,

        [

          new Date()
            .toISOString(),

          cadastro.id

        ]

      );


      const maxAgeSegundos =
        Math.floor(

          DURACAO_SESSAO /
          1000

        );


      res.setHeader(

        'Set-Cookie',

        criarCookie(

          novaSessao.token,

          maxAgeSegundos

        )

      );


      res.json({

        ok:
          true,

        usuario: {

          id:
            Number(
              cadastro.id
            ),

          nome:
            cadastro.nome,

          departamento:
            cadastro.departamento,

          perfil:
            cadastro.perfil,

          usuario:
            cadastro.usuario

        }

      });


    } catch (erro) {

      console.error(
        'Erro ao fazer login:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao realizar login.'

        });

    }

  }

);


// ============================================================
// USUÁRIO LOGADO
// ============================================================

app.get(

  '/api/me',

  async (
    req,
    res
  ) => {

    const usuario =
      await obterUsuarioLogado(
        req
      );


    if (!usuario) {

      return res
        .status(401)
        .json({

          autenticado:
            false

        });

    }


    res.json({

      autenticado:
        true,

      usuario

    });

  }

);


// ============================================================
// LOGOUT
// ============================================================

app.post(

  '/api/logout',

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const cookies =
        lerCookies(
          req
        );


      const tokenReal =
        cookies[
          COOKIE_SESSAO
        ];


      if (tokenReal) {

        await sqlRun(

          database,

          `
            DELETE FROM sessoes

            WHERE token = ?
          `,

          [

            hashToken(
              tokenReal
            )

          ]

        );

      }


      res.setHeader(

        'Set-Cookie',

        criarCookie(
          '',
          0
        )

      );


      res.json({

        ok:
          true

      });


    } catch (erro) {

      console.error(
        'Erro ao sair:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao encerrar sessão.'

        });

    }

  }

);


// ============================================================
// PERMISSÕES
// ============================================================

async function exigirLogin(
  req,
  res,
  next
) {

  try {

    const usuario =
      await obterUsuarioLogado(
        req
      );


    if (!usuario) {

      return res
        .status(401)
        .json({

          erro:
            'Sessão inválida ou expirada. Faça login novamente.'

        });

    }


    req.usuarioLogado =
      usuario;


    next();


  } catch (erro) {

    console.error(
      'Erro ao validar login:',
      erro
    );


    res
      .status(500)
      .json({

        erro:
          'Erro ao validar sessão.'

      });

  }

}


// ============================================================

function exigirAdmin(
  req,
  res,
  next
) {

  if (
    req.usuarioLogado
      ?.perfil !==
    'admin' ||

    String(req.usuarioLogado?.usuario || '').trim().toLowerCase() !==
    'admin'
  ) {

    return res
      .status(403)
      .json({

        erro:
          'Acesso permitido somente ao administrador.'

      });

  }


  next();

}


// ============================================================

function exigirEmissor(
  req,
  res,
  next
) {

  const perfil =
    req.usuarioLogado
      ?.perfil;


  if (
    perfil !==
    'admin' &&

    perfil !==
    'emissor' &&

    textoNormalizado(req.usuarioLogado?.departamento) !==
    'LEGALIZACAO'
  ) {

    return res
      .status(403)
      .json({

        erro:
          'Você não possui permissão para esta operação.'

      });

  }


  next();

}


// ============================================================

function exigirEntregador(
  req,
  res,
  next
) {

  const perfil =
    req.usuarioLogado
      ?.perfil;


  if (
    perfil !==
    'admin' &&

    perfil !==
    'entregador' &&

    textoNormalizado(req.usuarioLogado?.departamento) !==
    'LEGALIZACAO'
  ) {

    return res
      .status(403)
      .json({

        erro:
          'Você não possui permissão para esta operação.'

      });

  }


  next();

}

function textoNormalizado(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function podeGerenciarClientes(usuario) {
  return usuario?.perfil === 'admin' ||
    textoNormalizado(usuario?.departamento) === 'LEGALIZACAO';
}

function exigirGerenciaDeClientes(req, res, next) {
  if (!podeGerenciarClientes(req.usuarioLogado)) {
    return res.status(403).json({
      erro: 'Somente a Legalização e administradores podem alterar empresas.'
    });
  }
  next();
}


// ============================================================
// TODA API DAQUI PARA BAIXO EXIGE LOGIN
// ============================================================

app.use(

  '/api',

  exigirLogin

);

// Dados operacionais nunca devem ser reaproveitados pelo cache do navegador
// ou por uma camada intermediária da hospedagem.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});


// ============================================================
// TESTE TURSO
// ============================================================

app.get(

  '/teste',

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const resultado =
        await sqlGet(

          database,

          `
            SELECT
              1 AS ok
          `

        );


      res.json({

        ok:
          true,

        servidor:
          'Hiperion Turso funcionando',

        banco:

          Number(
            resultado?.ok ||
            0
          ) === 1

            ? 'conectado'

            : 'erro'

      });


    } catch (erro) {

      console.error(
        erro
      );


      res
        .status(500)
        .json({

          ok:
            false,

          erro:
            'Falha na conexão com o Turso.'

        });

    }

  }

);


// ============================================================
// CLIENTES / EMPRESAS
// ============================================================

app.get('/api/clientes', async (req, res) => {
  try {
    const database = await garantirDb();
    const incluirInativos = req.query.inativos === '1' &&
      podeGerenciarClientes(req.usuarioLogado);
    const clientes = await sqlAll(database, `
      SELECT id, nome, box, endereco, numero, complemento,
             bairro, cidade, uf, cep, observacao, ativo,
             criado_em, atualizado_em
      FROM clientes
      ${incluirInativos ? '' : 'WHERE ativo = 1'}
      ORDER BY nome COLLATE NOCASE
    `);
    res.json({
      clientes,
      pode_gerenciar: podeGerenciarClientes(req.usuarioLogado)
    });
  } catch (erro) {
    console.error('Erro ao listar clientes:', erro);
    res.status(500).json({ erro: 'Erro ao buscar empresas.' });
  }
});

app.post('/api/clientes', exigirGerenciaDeClientes, async (req, res) => {
  try {
    const database = await garantirDb();
    const nome = String(req.body.nome || '').replace(/\s+/g, ' ').trim();
    if (!nome) return res.status(400).json({ erro: 'Nome da empresa é obrigatório.' });
    const valor = campo => String(req.body[campo] || '').trim() || null;
    const resultado = await sqlRun(database, `
      INSERT INTO clientes (
        nome, nome_normalizado, box, endereco, numero, complemento,
        bairro, cidade, uf, cep, observacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      nome, textoNormalizado(nome), valor('box'), valor('endereco'),
      valor('numero'), valor('complemento'), valor('bairro'), valor('cidade'),
      valor('uf')?.toUpperCase() || null, valor('cep'), valor('observacao')
    ]);
    res.status(201).json({ ok: true, id: Number(resultado?.lastInsertRowid || 0) });
  } catch (erro) {
    if (/unique/i.test(String(erro?.message || erro))) {
      return res.status(409).json({ erro: 'Esta empresa já está cadastrada.' });
    }
    console.error('Erro ao cadastrar cliente:', erro);
    res.status(500).json({ erro: 'Erro ao cadastrar empresa.' });
  }
});

app.put('/api/clientes/:id', exigirGerenciaDeClientes, async (req, res) => {
  try {
    const database = await garantirDb();
    const id = Number(req.params.id);
    const nome = String(req.body.nome || '').replace(/\s+/g, ' ').trim();
    if (!Number.isInteger(id) || !nome) {
      return res.status(400).json({ erro: 'Cadastro inválido.' });
    }
    const valor = campo => String(req.body[campo] || '').trim() || null;
    const existente = await sqlGet(database, 'SELECT id FROM clientes WHERE id = ?', [id]);
    if (!existente) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    const resultado = await sqlRun(database, `
      UPDATE clientes SET
        nome = ?, nome_normalizado = ?, box = ?, endereco = ?, numero = ?,
        complemento = ?, bairro = ?, cidade = ?, uf = ?, cep = ?,
        observacao = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      nome, textoNormalizado(nome), valor('box'), valor('endereco'),
      valor('numero'), valor('complemento'), valor('bairro'), valor('cidade'),
      valor('uf')?.toUpperCase() || null, valor('cep'), valor('observacao'), id
    ]);
    if (Number(resultado?.changes || 0) !== 1) {
      throw new Error('A alteração da empresa não foi confirmada pelo banco.');
    }
    const cliente = await sqlGet(database, `
      SELECT id, nome, box, endereco, numero, complemento,
             bairro, cidade, uf, cep, observacao, ativo,
             criado_em, atualizado_em
      FROM clientes
      WHERE id = ?
    `, [id]);
    if (!cliente) {
      throw new Error('A empresa não pôde ser relida após a alteração.');
    }
    res.json({ ok: true, cliente });
  } catch (erro) {
    if (/unique/i.test(String(erro?.message || erro))) {
      return res.status(409).json({ erro: 'Já existe outra empresa com esse nome.' });
    }
    console.error('Erro ao editar cliente:', erro);
    res.status(500).json({ erro: 'Erro ao editar empresa.' });
  }
});

app.patch('/api/clientes/:id/ativo', exigirGerenciaDeClientes, async (req, res) => {
  try {
    const database = await garantirDb();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ erro: 'Cadastro inválido.' });
    const existente = await sqlGet(database, 'SELECT id FROM clientes WHERE id = ?', [id]);
    if (!existente) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    await sqlRun(
      database,
      'UPDATE clientes SET ativo = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [req.body.ativo ? 1 : 0, id]
    );
    res.json({ ok: true });
  } catch (erro) {
    console.error('Erro ao alterar cliente:', erro);
    res.status(500).json({ erro: 'Erro ao alterar empresa.' });
  }
});


// ============================================================
// LISTAR USUÁRIOS
// ============================================================

app.get(

  '/api/usuarios',

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const usuarios =
        await sqlAll(

          database,

          `
            SELECT

              id,
              nome,
              departamento,
              perfil,
              ativo,
              criado_em,
              usuario,
              ultimo_login,

              CASE

                WHEN

                  senha_hash
                    IS NOT NULL

                  AND

                  senha_hash <> ''

                THEN 1

                ELSE 0

              END

              AS senha_configurada

            FROM usuarios

            WHERE
              ativo = 1

            ORDER BY
              nome
          `

        );


      res.json(
        usuarios
      );


    } catch (erro) {

      console.error(
        'Erro ao buscar usuários:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao buscar usuários.'

        });

    }

  }

);


// ============================================================
// CRIAR USUÁRIO
// ============================================================

app.post(

  '/api/usuarios',

  exigirAdmin,

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const {

        nome,
        departamento,
        perfil,
        usuario,
        senha

      } =
        req.body;


      if (
        !nome ||
        !departamento ||
        !perfil ||
        !usuario ||
        !senha
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Nome, departamento, perfil, login e senha são obrigatórios.'

          });

      }


      const perfisValidos =
        [

          'admin',
          'emissor',
          'entregador'

        ];


      if (
        !perfisValidos
          .includes(
            perfil
          )
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Perfil inválido.'

          });

      }


      const login =
        usuario
          .trim()
          .toLowerCase();

      if (perfil === 'admin' && login !== 'admin') {
        return res.status(400).json({
          erro: 'O perfil Administrador geral é exclusivo da conta principal.'
        });
      }


      if (
        !/^[a-z0-9._-]{3,30}$/
          .test(
            login
          )
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Login inválido. Use de 3 a 30 caracteres: letras minúsculas, números, ponto, traço ou underline.'

          });

      }


      if (
        senha.length <
        6
      ) {

        return res
          .status(400)
          .json({

            erro:
              'A senha precisa ter pelo menos 6 caracteres.'

          });

      }


      const loginExistente =
        await sqlGet(

          database,

          `
            SELECT
              id,
              ativo

            FROM usuarios

            WHERE

              LOWER(usuario) =
              LOWER(?)

            LIMIT 1
          `,

          [
            login
          ]

        );


      if (
        loginExistente
      ) {

        return res
          .status(409)
          .json({

            erro:

              Number(
                loginExistente.ativo
              ) === 1

                ? `O login "${login}" já está sendo utilizado.`

                : `O login "${login}" pertence a um usuário removido anteriormente.`

          });

      }


      const credencial =
        gerarHashSenha(
          senha
        );


      const resultado =
        await sqlRun(

          database,

          `
            INSERT INTO usuarios (

              nome,
              departamento,
              perfil,
              usuario,
              senha_hash,
              senha_salt,
              ativo

            )

            VALUES (
              ?, ?, ?, ?, ?, ?, 1
            )
          `,

          [

            nome.trim(),

            departamento.trim(),

            perfil,

            login,

            credencial.hash,

            credencial.salt

          ]

        );


      let usuarioId =
        Number(
          resultado
            ?.lastInsertRowid ||
          0
        );


      let usuarioCriado;


      if (usuarioId) {

        usuarioCriado =
          await sqlGet(

            database,

            `
              SELECT

                id,
                nome,
                departamento,
                perfil,
                usuario,
                ativo,
                criado_em

              FROM usuarios

              WHERE id = ?
            `,

            [
              usuarioId
            ]

          );

      } else {

        usuarioCriado =
          await sqlGet(

            database,

            `
              SELECT

                id,
                nome,
                departamento,
                perfil,
                usuario,
                ativo,
                criado_em

              FROM usuarios

              WHERE
                LOWER(usuario) =
                LOWER(?)

              LIMIT 1
            `,

            [
              login
            ]

          );

      }


      res
        .status(201)
        .json(
          usuarioCriado
        );


    } catch (erro) {

      console.error(
        'Erro ao cadastrar usuário:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao cadastrar usuário.'

        });

    }

  }

);


// ============================================================
// EDITAR USUÁRIO
// ============================================================

app.put(

  '/api/usuarios/:id',

  exigirAdmin,

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const id =
        Number(
          req.params.id
        );


      const {

        nome,
        departamento,
        perfil,
        usuario

      } =
        req.body;


      if (
        !Number.isInteger(
          id
        ) ||

        id <= 0
      ) {

        return res
          .status(400)
          .json({

            erro:
              'ID de usuário inválido.'

          });

      }


      if (
        !nome ||
        !departamento ||
        !perfil ||
        !usuario
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Nome, departamento, perfil e login são obrigatórios.'

          });

      }


      const perfisValidos =
        [

          'admin',
          'emissor',
          'entregador'

        ];


      if (
        !perfisValidos
          .includes(
            perfil
          )
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Perfil inválido.'

          });

      }


      const login =
        usuario
          .trim()
          .toLowerCase();

      if (perfil === 'admin' && login !== 'admin') {
        return res.status(400).json({
          erro: 'O perfil Administrador geral é exclusivo da conta principal.'
        });
      }


      if (
        !/^[a-z0-9._-]{3,30}$/
          .test(
            login
          )
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Login inválido. Use de 3 a 30 caracteres.'

          });

      }


      const usuarioExistente =
        await sqlGet(

          database,

          `
            SELECT
              id,
              usuario,
              perfil

            FROM usuarios

            WHERE

              id = ?

              AND ativo = 1
          `,

          [
            id
          ]

        );


      if (
        !usuarioExistente
      ) {

        return res
          .status(404)
          .json({

            erro:
              'Usuário não encontrado.'

          });

      }

      if (
        String(usuarioExistente.usuario || '').trim().toLowerCase() === 'admin' &&
        (login !== 'admin' || perfil !== 'admin')
      ) {
        return res.status(400).json({
          erro: 'A conta principal deve permanecer como Administrador geral.'
        });
      }


      const duplicado =
        await sqlGet(

          database,

          `
            SELECT
              id

            FROM usuarios

            WHERE

              LOWER(usuario) =
              LOWER(?)

              AND id <> ?

            LIMIT 1
          `,

          [
            login,
            id
          ]

        );


      if (
        duplicado
      ) {

        return res
          .status(409)
          .json({

            erro:
              `O login "${login}" já está sendo utilizado.`

          });

      }


      await sqlRun(

        database,

        `
          UPDATE usuarios

          SET

            nome = ?,
            departamento = ?,
            perfil = ?,
            usuario = ?

          WHERE id = ?
        `,

        [

          nome.trim(),

          departamento.trim(),

          perfil,

          login,

          id

        ]

      );


      const atualizado =
        await sqlGet(

          database,

          `
            SELECT

              id,
              nome,
              departamento,
              perfil,
              usuario,
              ativo,
              criado_em,
              ultimo_login

            FROM usuarios

            WHERE id = ?
          `,

          [
            id
          ]

        );


      res.json(
        atualizado
      );


    } catch (erro) {

      console.error(
        'Erro ao editar usuário:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao editar usuário.'

        });

    }

  }

);


// ============================================================
// REDEFINIR SENHA
// ============================================================

app.put(

  '/api/usuarios/:id/senha',

  exigirAdmin,

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const id =
        Number(
          req.params.id
        );


      const {
        senha
      } =
        req.body;


      if (
        !Number.isInteger(
          id
        ) ||

        id <= 0
      ) {

        return res
          .status(400)
          .json({

            erro:
              'ID de usuário inválido.'

          });

      }


      if (
        !senha ||
        senha.length <
        6
      ) {

        return res
          .status(400)
          .json({

            erro:
              'A nova senha precisa ter pelo menos 6 caracteres.'

          });

      }


      const usuario =
        await sqlGet(

          database,

          `
            SELECT

              id,
              nome,
              ativo

            FROM usuarios

            WHERE id = ?
          `,

          [
            id
          ]

        );


      if (
        !usuario ||

        Number(
          usuario.ativo
        ) !== 1
      ) {

        return res
          .status(404)
          .json({

            erro:
              'Usuário não encontrado.'

          });

      }


      const credencial =
        gerarHashSenha(
          senha
        );


      await sqlRun(

        database,

        `
          UPDATE usuarios

          SET

            senha_hash = ?,
            senha_salt = ?

          WHERE id = ?
        `,

        [

          credencial.hash,

          credencial.salt,

          id

        ]

      );


      await sqlRun(

        database,

        `
          DELETE FROM sessoes

          WHERE usuario_id = ?
        `,

        [
          id
        ]

      );


      res.json({

        ok:
          true,

        mensagem:
          `Senha de "${usuario.nome}" redefinida com sucesso.`

      });


    } catch (erro) {

      console.error(
        'Erro ao redefinir senha:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao redefinir senha.'

        });

    }

  }

);


// ============================================================
// REMOVER USUÁRIO
// ============================================================

app.delete(

  '/api/usuarios/:id',

  exigirAdmin,

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const id =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(
          id
        ) ||

        id <= 0
      ) {

        return res
          .status(400)
          .json({

            erro:
              'ID de usuário inválido.'

          });

      }


      if (
        Number(
          req.usuarioLogado.id
        ) === id
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Você não pode remover o próprio usuário enquanto está logado.'

          });

      }


      const usuarioExistente =
        await sqlGet(

          database,

          `
            SELECT

              id,
              nome

            FROM usuarios

            WHERE

              id = ?

              AND ativo = 1
          `,

          [
            id
          ]

        );


      if (
        !usuarioExistente
      ) {

        return res
          .status(404)
          .json({

            erro:
              'Usuário não encontrado.'

          });

      }


      await sqlRun(

        database,

        `
          UPDATE usuarios

          SET
            ativo = 0

          WHERE id = ?
        `,

        [
          id
        ]

      );


      await sqlRun(

        database,

        `
          DELETE FROM sessoes

          WHERE usuario_id = ?
        `,

        [
          id
        ]

      );


      res.json({

        ok:
          true,

        mensagem:
          `Usuário "${usuarioExistente.nome}" removido do acesso.`

      });


    } catch (erro) {

      console.error(
        'Erro ao remover usuário:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao remover usuário.'

        });

    }

  }

);


// ============================================================
// FUNÇÕES DOS ITENS
// ============================================================

function normalizarItensDoProtocolo(
  body
) {

  let itens =
    [];


  if (
    Array.isArray(
      body.itens
    )
  ) {

    itens =
      body.itens

        .map(

          (
            item,
            indice
          ) => ({

            descricao:
              String(

                item?.descricao ||
                ''

              ).trim(),

            competencia:
              item?.competencia
                ? String(item.competencia).trim()
                : null,

            vencimento:

              item?.vencimento ===
              undefined ||

              item?.vencimento ===
              null ||

              item?.vencimento ===
              ''

                ? null

                : String(
                    item.vencimento
                  ).trim(),

            ordem:
              indice + 1

          })

        )

        .filter(

          item =>
            item.descricao

        );

  }


  if (
    itens.length === 0 &&
    body.descricao
  ) {

    itens.push({

      descricao:
        String(
          body.descricao
        ).trim(),

      competencia: null,

      vencimento:

        body.vencimento ===
        undefined ||

        body.vencimento ===
        null ||

        body.vencimento ===
        ''

          ? null

          : String(
              body.vencimento
            ).trim(),

      ordem:
        1

    });

  }


  return itens;

}


// ============================================================

function vencimentoValido(
  valor
) {

  if (!valor) {

    return true;

  }


  return /^\d{4}-\d{2}-\d{2}$/
    .test(
      valor
    );

}


// ============================================================

async function buscarItensDoProtocolo(
  protocoloId,
  conexao = null
) {

  const database =
    conexao ||
    await garantirDb();


  return await sqlAll(

    database,

    `
      SELECT

        id,
        protocolo_id,
        descricao,
        competencia,
        vencimento,
        ordem,
        criado_em

      FROM protocolo_itens

      WHERE
        protocolo_id = ?

      ORDER BY

        ordem,
        id
    `,

    [
      protocoloId
    ]

  );

}


// ============================================================

async function anexarItens(
  protocolo,
  conexao = null
) {

  if (!protocolo) {

    return protocolo;

  }


  return {

    ...protocolo,

    itens:
      await buscarItensDoProtocolo(

        protocolo.id,

        conexao

      )

  };

}


// ============================================================

async function anexarItensEmLista(
  protocolos
) {

  const resultado =
    [];


  for (
    const protocolo
    of protocolos
  ) {

    resultado.push(

      await anexarItens(
        protocolo
      )

    );

  }


  return resultado;

}


// ============================================================
// LISTAR PROTOCOLOS
// ============================================================

app.get(

  '/api/protocolos',

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const protocolos =
        await sqlAll(

          database,

          `
            SELECT

              id,
              numero,
              cliente,
              cliente_id,
              cliente_box,
              endereco_empresa,
              departamento,
              descricao,
              vencimento,
              emissor,
              entregador,
              observacao,
              status,
              recebido_por,
              assinatura,
              criado_em,
              entregue_em,
              motivo_cancelamento,
              cancelado_por,
              cancelado_em,
              excluido,
              excluido_em,
              excluido_por

            FROM protocolos

            WHERE

              COALESCE(
                excluido,
                0
              ) = 0

            ORDER BY

              numero DESC
          `

        );


      res.json(

        await anexarItensEmLista(
          protocolos
        )

      );


    } catch (erro) {

      console.error(
        'Erro ao buscar protocolos:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao buscar protocolos.'

        });

    }

  }

);


// ============================================================
// PRÓXIMO NÚMERO
// ============================================================

app.get(

  '/api/protocolos/proximo-numero',

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const resultado =
        await sqlGet(

          database,

          `
            SELECT

              MAX(numero)
              AS ultimo

            FROM protocolos
          `

        );


      const ultimo =
        Number(

          resultado?.ultimo ||
          0

        );


      res.json({

        ultimo,

        proximo:
          ultimo + 1

      });


    } catch (erro) {

      console.error(
        'Erro ao buscar próximo protocolo:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao buscar próximo número.'

        });

    }

  }

);


// ============================================================
// CRIAR PROTOCOLO
// ============================================================

app.post(

  '/api/protocolos',

  exigirEmissor,

  async (
    req,
    res
  ) => {

    const {

      numero,
      cliente,
      cliente_id,
      cliente_box,
      departamento,
      entregador,
      observacao

    } =
      req.body;


    const itens =
      normalizarItensDoProtocolo(
        req.body
      );

    let clienteCadastro = null;

    try {
      const database = await garantirDb();
      clienteCadastro = Number(cliente_id)
        ? await sqlGet(database, `
            SELECT id, nome, box, endereco, numero, complemento,
                   bairro, cidade, uf, cep
            FROM clientes
            WHERE id = ? AND ativo = 1
          `, [Number(cliente_id)])
        : null;
    } catch (erro) {
      console.error('Erro ao validar empresa do protocolo:', erro);
    }

    if (!clienteCadastro) {
      return res.status(400).json({
        erro: 'Selecione uma empresa ativa do cadastro.'
      });
    }

    const enderecoCadastro = [
      [clienteCadastro.endereco, clienteCadastro.numero, clienteCadastro.complemento]
        .filter(Boolean).join(', '),
      [clienteCadastro.bairro, clienteCadastro.cidade, clienteCadastro.uf]
        .filter(Boolean).join(' - '),
      clienteCadastro.cep ? `CEP ${clienteCadastro.cep}` : ''
    ].filter(Boolean).join(' · ') || null;


    if (
      !cliente ||
      !departamento ||
      !entregador ||
      itens.length === 0
    ) {

      return res
        .status(400)
        .json({

          erro:
            'Cliente, departamento, entregador e pelo menos um item/documento são obrigatórios.'

        });

    }


    for (
      const item
      of itens
    ) {

      if (
        !vencimentoValido(
          item.vencimento
        )
      ) {

        return res
          .status(400)
          .json({

            erro:
              `Vencimento inválido no item "${item.descricao}".`

          });

      }

    }


    let numeroManual =
      null;


    if (
      numero !== undefined &&
      numero !== null &&
      numero !== ''
    ) {

      numeroManual =
        Number(
          numero
        );


      if (
        !Number.isInteger(
          numeroManual
        ) ||

        numeroManual <= 0
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Número do protocolo inválido.'

          });

      }

    }


    try {

      const database =
        await garantirDb();


      let protocoloId =
        null;


      let numeroFinal =
        null;


      const transacao =
        database.transactionAsync(

          async (
            tx
          ) => {

            // ===============================================
            // NÚMERO MANUAL
            // ===============================================

            if (
              numeroManual !==
              null
            ) {

              numeroFinal =
                numeroManual;


              const duplicado =
                await sqlGet(

                  tx,

                  `
                    SELECT
                      id

                    FROM protocolos

                    WHERE
                      numero = ?
                  `,

                  [
                    numeroFinal
                  ]

                );


              if (
                duplicado
              ) {

                const erro =
                  new Error(
                    `O protocolo ${String(
                      numeroFinal
                    ).padStart(
                      6,
                      '0'
                    )} já existe.`
                  );


                erro.statusCode =
                  409;


                throw erro;

              }

            }


            // ===============================================
            // NÚMERO AUTOMÁTICO
            // ===============================================

            else {

              const resultadoNumero =
                await sqlGet(

                  tx,

                  `
                    SELECT

                      MAX(numero)
                      AS ultimo

                    FROM protocolos
                  `

                );


              numeroFinal =
                Number(

                  resultadoNumero
                    ?.ultimo ||
                  0

                ) + 1;

            }


            const emissor =
              req.usuarioLogado
                .nome;


            const primeiroItem =
              itens[0];


            const resultado =
              await sqlRun(

                tx,

                `
                  INSERT INTO protocolos (

                    numero,
                    cliente,
                    cliente_id,
                    cliente_box,
                    endereco_empresa,
                    departamento,
                    descricao,
                    vencimento,
                    emissor,
                    entregador,
                    observacao,
                    status

                  )

                  VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                  )
                `,

                [

                  numeroFinal,

                  clienteCadastro.nome,

                  Number(clienteCadastro.id),

                  clienteCadastro.box || null,

                  enderecoCadastro,

                  String(
                    departamento
                  ).trim(),

                  primeiroItem
                    .descricao,

                  primeiroItem
                    .vencimento,

                  emissor,

                  String(
                    entregador
                  ).trim(),

                  observacao
                    ?.trim() ||
                    null,

                  'Aguardando entrega'

                ]

              );


            protocoloId =
              Number(

                resultado
                  ?.lastInsertRowid ||
                0

              );


            if (
              !protocoloId
            ) {

              const criado =
                await sqlGet(

                  tx,

                  `
                    SELECT
                      id

                    FROM protocolos

                    WHERE
                      numero = ?

                    LIMIT 1
                  `,

                  [
                    numeroFinal
                  ]

                );


              protocoloId =
                Number(
                  criado?.id ||
                  0
                );

            }


            if (
              !protocoloId
            ) {

              throw new Error(
                'Não foi possível identificar o protocolo criado.'
              );

            }


            // ===============================================
            // ITENS
            // ===============================================

            for (
              let indice = 0;
              indice <
              itens.length;
              indice++
            ) {

              const item =
                itens[indice];


              await sqlRun(

                tx,

                `
                  INSERT INTO protocolo_itens (

                    protocolo_id,
                    descricao,
                    competencia,
                    vencimento,
                    ordem

                  )

                  VALUES (
                    ?, ?, ?, ?, ?
                  )
                `,

                [

                  protocoloId,

                  item.descricao,

                  item.competencia,

                  item.vencimento,

                  indice + 1

                ]

              );

            }

          }

        );


      await transacao
        .immediate();


      const protocoloCriado =
        await sqlGet(

          database,

          `
            SELECT *

            FROM protocolos

            WHERE id = ?
          `,

          [
            protocoloId
          ]

        );


      res
        .status(201)
        .json(

          await anexarItens(
            protocoloCriado
          )

        );


    } catch (erro) {

      console.error(
        'Erro ao criar protocolo:',
        erro
      );


      if (
        erro?.statusCode ===
        409
      ) {

        return res
          .status(409)
          .json({

            erro:
              erro.message

          });

      }


      if (
        String(
          erro?.message ||
          ''
        ).includes(
          'UNIQUE constraint failed'
        )
      ) {

        return res
          .status(409)
          .json({

            erro:
              'Já existe um protocolo com esse número.'

          });

      }


      res
        .status(500)
        .json({

          erro:
            'Erro ao criar protocolo.'

        });

    }

  }

);


// ============================================================
// INICIAR ENTREGA
// ============================================================

app.put(

  '/api/protocolos/:id/em-entrega',

  exigirEntregador,

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const id =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(
          id
        ) ||

        id <= 0
      ) {

        return res
          .status(400)
          .json({

            erro:
              'ID do protocolo inválido.'

          });

      }


      const protocolo =
        await sqlGet(

          database,

          `
            SELECT *

            FROM protocolos

            WHERE

              id = ?

              AND

              COALESCE(
                excluido,
                0
              ) = 0
          `,

          [
            id
          ]

        );


      if (
        !protocolo
      ) {

        return res
          .status(404)
          .json({

            erro:
              'Protocolo não encontrado.'

          });

      }


      if (
        req.usuarioLogado
          .perfil ===
        'entregador' &&

        protocolo
          .entregador !==
        req.usuarioLogado
          .nome
      ) {

        return res
          .status(403)
          .json({

            erro:
              'Esta entrega está atribuída a outro usuário.'

          });

      }


      if (
        protocolo.status ===
        'Em entrega'
      ) {

        return res.json(

          await anexarItens(
            protocolo
          )

        );

      }


      if (
        protocolo.status ===
        'Entregue'
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Este protocolo já foi entregue.'

          });

      }


      if (
        protocolo.status ===
        'Cancelado'
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Este protocolo foi cancelado.'

          });

      }


      await sqlRun(

        database,

        `
          UPDATE protocolos

          SET
            status = 'Em entrega'

          WHERE id = ?
        `,

        [
          id
        ]

      );


      const atualizado =
        await sqlGet(

          database,

          `
            SELECT *

            FROM protocolos

            WHERE id = ?
          `,

          [
            id
          ]

        );


      res.json(

        await anexarItens(
          atualizado
        )

      );


    } catch (erro) {

      console.error(
        'Erro ao iniciar entrega:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro interno ao iniciar entrega.'

        });

    }

  }

);


// ============================================================
// CONFIRMAR ENTREGA
// ============================================================

app.put(

  '/api/protocolos/:id/entregar',

  exigirEntregador,

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const id =
        Number(
          req.params.id
        );


      const {

        recebido_por,
        assinatura,
        entregue_em_local

      } =
        req.body;


      if (
        !Number.isInteger(
          id
        ) ||

        id <= 0
      ) {

        return res
          .status(400)
          .json({

            erro:
              'ID do protocolo inválido.'

          });

      }


      if (
        !recebido_por ||
        !assinatura
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Nome de quem recebeu e assinatura são obrigatórios.'

          });

      }


      const protocolo =
        await sqlGet(

          database,

          `
            SELECT *

            FROM protocolos

            WHERE

              id = ?

              AND

              COALESCE(
                excluido,
                0
              ) = 0
          `,

          [
            id
          ]

        );


      if (
        !protocolo
      ) {

        return res
          .status(404)
          .json({

            erro:
              'Protocolo não encontrado.'

          });

      }


      if (
        req.usuarioLogado
          .perfil ===
        'entregador' &&

        protocolo
          .entregador !==
        req.usuarioLogado
          .nome
      ) {

        return res
          .status(403)
          .json({

            erro:
              'Esta entrega está atribuída a outro usuário.'

          });

      }


      if (
        protocolo.status ===
        'Cancelado'
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Protocolo cancelado não pode ser entregue.'

          });

      }


      if (
        protocolo.status ===
        'Entregue'
      ) {

        return res.json(

          await anexarItens(
            protocolo
          )

        );

      }


      let entregueEm =
        new Date()
          .toISOString();


      if (
        entregue_em_local
      ) {

        const dataLocal =
          new Date(
            entregue_em_local
          );


        if (
          !isNaN(
            dataLocal.getTime()
          )
        ) {

          entregueEm =
            dataLocal
              .toISOString();

        }

      }


      await sqlRun(

        database,

        `
          UPDATE protocolos

          SET

            status =
              'Entregue',

            recebido_por = ?,

            assinatura = ?,

            entregue_em = ?

          WHERE id = ?
        `,

        [

          String(
            recebido_por
          ).trim(),

          assinatura,

          entregueEm,

          id

        ]

      );


      const atualizado =
        await sqlGet(

          database,

          `
            SELECT *

            FROM protocolos

            WHERE id = ?
          `,

          [
            id
          ]

        );


      res.json(

        await anexarItens(
          atualizado
        )

      );


    } catch (erro) {

      console.error(
        'Erro ao confirmar entrega:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro interno ao confirmar entrega.'

        });

    }

  }

);


// ============================================================
// CANCELAR PROTOCOLO
// ============================================================

app.put(

  '/api/protocolos/:id/cancelar',

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const id =
        Number(
          req.params.id
        );


      const {
        motivo
      } =
        req.body;


      if (
        !Number.isInteger(
          id
        ) ||

        id <= 0
      ) {

        return res
          .status(400)
          .json({

            erro:
              'ID do protocolo inválido.'

          });

      }


      const protocolo =
        await sqlGet(

          database,

          `
            SELECT *

            FROM protocolos

            WHERE

              id = ?

              AND

              COALESCE(
                excluido,
                0
              ) = 0
          `,

          [
            id
          ]

        );


      if (
        !protocolo
      ) {

        return res
          .status(404)
          .json({

            erro:
              'Protocolo não encontrado.'

          });

      }


      if (
        protocolo.status ===
        'Cancelado'
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Este protocolo já está cancelado.'

          });

      }


      if (
        protocolo.status ===
        'Entregue'
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Um protocolo já entregue não pode ser cancelado.'

          });

      }


      await sqlRun(

        database,

        `
          UPDATE protocolos

          SET

            status =
              'Cancelado',

            motivo_cancelamento = ?,

            cancelado_por = ?,

            cancelado_em = ?

          WHERE id = ?
        `,

        [

          motivo
            ?.trim() ||
          'Sem motivo informado',

          req.usuarioLogado
            .nome,

          new Date()
            .toISOString(),

          id

        ]

      );


      const atualizado =
        await sqlGet(

          database,

          `
            SELECT *

            FROM protocolos

            WHERE id = ?
          `,

          [
            id
          ]

        );


      res.json(

        await anexarItens(
          atualizado
        )

      );


    } catch (erro) {

      console.error(
        'Erro ao cancelar protocolo:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao cancelar protocolo.'

        });

    }

  }

);


// ============================================================
// EXCLUSÃO LÓGICA
// ============================================================

app.put(

  '/api/protocolos/:id/excluir',

  exigirAdmin,

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const id =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(
          id
        ) ||

        id <= 0
      ) {

        return res
          .status(400)
          .json({

            erro:
              'ID do protocolo inválido.'

          });

      }


      const protocolo =
        await sqlGet(

          database,

          `
            SELECT *

            FROM protocolos

            WHERE id = ?
          `,

          [
            id
          ]

        );


      if (
        !protocolo
      ) {

        return res
          .status(404)
          .json({

            erro:
              'Protocolo não encontrado.'

          });

      }


      if (
        Number(
          protocolo.excluido ||
          0
        ) === 1
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Este protocolo já está excluído.'

          });

      }


      await sqlRun(

        database,

        `
          UPDATE protocolos

          SET

            excluido = 1,

            excluido_em = ?,

            excluido_por = ?

          WHERE id = ?
        `,

        [

          new Date()
            .toISOString(),

          req.usuarioLogado
            .nome,

          id

        ]

      );


      res.json({

        ok:
          true,

        mensagem:

          `Protocolo ${String(
            protocolo.numero
          ).padStart(
            6,
            '0'
          )} excluído.`

      });


    } catch (erro) {

      console.error(
        'Erro ao excluir protocolo:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao excluir protocolo.'

        });

    }

  }

);


// ============================================================
// PROTOCOLOS EXCLUÍDOS
// ============================================================

app.get(

  '/api/protocolos-excluidos',

  exigirAdmin,

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const protocolos =
        await sqlAll(

          database,

          `
            SELECT

              id,
              numero,
              cliente,
              cliente_id,
              cliente_box,
              endereco_empresa,
              departamento,
              descricao,
              vencimento,
              emissor,
              entregador,
              observacao,
              status,
              recebido_por,
              assinatura,
              criado_em,
              entregue_em,
              motivo_cancelamento,
              cancelado_por,
              cancelado_em,
              excluido,
              excluido_em,
              excluido_por

            FROM protocolos

            WHERE

              COALESCE(
                excluido,
                0
              ) = 1

            ORDER BY

              numero DESC
          `

        );


      res.json(

        await anexarItensEmLista(
          protocolos
        )

      );


    } catch (erro) {

      console.error(
        'Erro ao buscar protocolos excluídos:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao buscar protocolos excluídos.'

        });

    }

  }

);


// ============================================================
// RESTAURAR PROTOCOLO
// ============================================================

app.put(

  '/api/protocolos/:id/restaurar',

  exigirAdmin,

  async (
    req,
    res
  ) => {

    try {

      const database =
        await garantirDb();


      const id =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(
          id
        ) ||

        id <= 0
      ) {

        return res
          .status(400)
          .json({

            erro:
              'ID do protocolo inválido.'

          });

      }


      const protocolo =
        await sqlGet(

          database,

          `
            SELECT *

            FROM protocolos

            WHERE id = ?
          `,

          [
            id
          ]

        );


      if (
        !protocolo
      ) {

        return res
          .status(404)
          .json({

            erro:
              'Protocolo não encontrado.'

          });

      }


      if (
        Number(
          protocolo.excluido ||
          0
        ) !== 1
      ) {

        return res
          .status(400)
          .json({

            erro:
              'Este protocolo não está excluído.'

          });

      }


      await sqlRun(

        database,

        `
          UPDATE protocolos

          SET

            excluido = 0,

            excluido_em =
              NULL,

            excluido_por =
              NULL

          WHERE id = ?
        `,

        [
          id
        ]

      );


      const restaurado =
        await sqlGet(

          database,

          `
            SELECT *

            FROM protocolos

            WHERE id = ?
          `,

          [
            id
          ]

        );


      res.json(

        await anexarItens(
          restaurado
        )

      );


    } catch (erro) {

      console.error(
        'Erro ao restaurar protocolo:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao restaurar protocolo.'

        });

    }

  }

);


// ============================================================
// EXCLUIR DEFINITIVAMENTE
// ============================================================

app.delete(

  '/api/protocolos/:id/definitivo',

  exigirAdmin,

  async (
    req,
    res
  ) => {

    const id =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(
        id
      ) ||

      id <= 0
    ) {

      return res
        .status(400)
        .json({

          erro:
            'ID do protocolo inválido.'

        });

    }


    try {

      const database =
        await garantirDb();


      const protocolo =
        await sqlGet(

          database,

          `
            SELECT

              id,
              numero,
              cliente,
              status,
              excluido

            FROM protocolos

            WHERE id = ?
          `,

          [
            id
          ]

        );


      if (
        !protocolo
      ) {

        return res
          .status(404)
          .json({

            erro:
              'Protocolo não encontrado.'

          });

      }


      if (
        Number(
          protocolo.excluido ||
          0
        ) !== 1
      ) {

        return res
          .status(400)
          .json({

            erro:
              'O protocolo precisa estar na área de protocolos excluídos antes da exclusão definitiva.'

          });

      }


      const transacao =
        database.transactionAsync(

          async (
            tx
          ) => {

            await sqlRun(

              tx,

              `
                DELETE FROM protocolo_itens

                WHERE
                  protocolo_id = ?
              `,

              [
                id
              ]

            );


            const resultado =
              await sqlRun(

                tx,

                `
                  DELETE FROM protocolos

                  WHERE

                    id = ?

                    AND

                    COALESCE(
                      excluido,
                      0
                    ) = 1
                `,

                [
                  id
                ]

              );


            const alteracoes =
              Number(

                resultado
                  ?.changes ||

                resultado
                  ?.rowsAffected ||

                0

              );


            if (
              alteracoes !==
              1
            ) {

              throw new Error(
                'O protocolo não pôde ser excluído definitivamente.'
              );

            }

          }

        );


      await transacao
        .immediate();


      res.json({

        ok:
          true,

        numero:
          protocolo.numero,

        mensagem:

          `Protocolo ${String(
            protocolo.numero
          ).padStart(
            6,
            '0'
          )} excluído definitivamente.`

      });


    } catch (erro) {

      console.error(
        'Erro ao excluir protocolo definitivamente:',
        erro
      );


      res
        .status(500)
        .json({

          erro:
            'Erro ao excluir protocolo definitivamente.'

        });

    }

  }

);


// ============================================================
// INICIAR SERVIDOR
// ============================================================

async function iniciarServidor() {

  try {

    const database =
      await garantirDb();


    await sqlGet(

      database,

      `
        SELECT
          1 AS ok
      `

    );


    app.listen(

      PORT,

      () => {

        console.log('');
        console.log(
          '======================================'
        );

        console.log(
          ' HIPERION PROTOCOLOS - TURSO'
        );

        console.log(
          '======================================'
        );

        console.log('');

        console.log(
          `Servidor: http://localhost:${PORT}`
        );

        console.log(
          'Banco: Turso conectado'
        );

        console.log('');

      }

    );


  } catch (erro) {

    console.error('');
    console.error(
      'ERRO AO INICIAR HIPERION TURSO:'
    );
    console.error('');

    console.error(
      erro
    );

    console.error('');

    process.exit(1);

  }

}


// ============================================================
// LOCAL
// ============================================================

if (
  require.main ===
  module
) {

  iniciarServidor();

}


// ============================================================
// VERCEL
// ============================================================

module.exports =
  app;
