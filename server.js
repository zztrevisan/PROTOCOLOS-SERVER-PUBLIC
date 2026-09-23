const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('./banco/db');

const app = express();
const PORT = 3000;

// Assinaturas em base64 podem ultrapassar
// o limite padrão do Express.
app.use(
  express.json({
    limit: '5mb'
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
  8 * 60 * 60 * 1000;


// ============================================================
// FUNÇÕES DE LOGIN
// ============================================================

function lerCookies(req) {

  const cabecalho =
    req.headers.cookie || '';

  const cookies = {};

  cabecalho
    .split(';')
    .forEach(item => {

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
            valor || ''
          );

      }

    });

  return cookies;
}


function hashToken(token) {

  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

}


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


function gerarHashSenha(senha) {

  const salt =
    crypto
      .randomBytes(32)
      .toString('hex');

  const hash =
    crypto
      .scryptSync(
        senha,
        salt,
        64
      )
      .toString('hex');

  return {
    salt,
    hash
  };

}


function criarSessao(usuarioId) {

  const tokenReal =
    crypto
      .randomBytes(32)
      .toString('hex');

  const tokenBanco =
    hashToken(tokenReal);

  const expira =
    new Date(
      Date.now() +
      DURACAO_SESSAO
    );

  db.prepare(`
    INSERT INTO sessoes (
      token,
      usuario_id,
      expira_em
    )
    VALUES (?, ?, ?)
  `).run(
    tokenBanco,
    usuarioId,
    expira.toISOString()
  );

  return {
    token:
      tokenReal,

    expira
  };

}


function obterUsuarioLogado(req) {

  try {

    const cookies =
      lerCookies(req);

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
      db.prepare(`
        SELECT
          s.id AS sessao_id,
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

        WHERE s.token = ?

        LIMIT 1
      `).get(
        tokenBanco
      );

    if (!sessao) {

      return null;

    }

    if (
      Number(
        sessao.ativo
      ) !== 1
    ) {

      db.prepare(`
        DELETE FROM sessoes
        WHERE id = ?
      `).run(
        sessao.sessao_id
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

      db.prepare(`
        DELETE FROM sessoes
        WHERE id = ?
      `).run(
        sessao.sessao_id
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
// LOGIN
// ============================================================

app.post(
  '/api/login',
  (req, res) => {

    try {

      const {
        usuario,
        senha
      } = req.body;

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
        db.prepare(`
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
        `).get(
          login
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

      const sessoes =
        db.prepare(`
          SELECT
            id,
            expira_em

          FROM sessoes
        `).all();

      for (
        const sessao
        of sessoes
      ) {

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

          db.prepare(`
            DELETE FROM sessoes
            WHERE id = ?
          `).run(
            sessao.id
          );

        }

      }

      const novaSessao =
        criarSessao(
          cadastro.id
        );

      db.prepare(`
        UPDATE usuarios

        SET
          ultimo_login = ?

        WHERE id = ?
      `).run(

        new Date()
          .toISOString(),

        cadastro.id

      );

      const maxAgeSegundos =
        Math.floor(
          DURACAO_SESSAO /
          1000
        );

      res.setHeader(

        'Set-Cookie',

        `${COOKIE_SESSAO}=${encodeURIComponent(
          novaSessao.token
        )}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSegundos}`

      );

      res.json({

        ok: true,

        usuario: {

          id:
            cadastro.id,

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

      res.status(500).json({

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
  (req, res) => {

    const usuario =
      obterUsuarioLogado(
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
  (req, res) => {

    try {

      const cookies =
        lerCookies(req);

      const tokenReal =
        cookies[
          COOKIE_SESSAO
        ];

      if (tokenReal) {

        db.prepare(`
          DELETE FROM sessoes

          WHERE token = ?
        `).run(

          hashToken(
            tokenReal
          )

        );

      }

      res.setHeader(

        'Set-Cookie',

        `${COOKIE_SESSAO}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`

      );

      res.json({
        ok: true
      });

    } catch (erro) {

      console.error(
        'Erro ao sair:',
        erro
      );

      res.status(500).json({

        erro:
          'Erro ao encerrar sessão.'

      });

    }

  }
);


// ============================================================
// PERMISSÕES
// ============================================================

function exigirLogin(
  req,
  res,
  next
) {

  const usuario =
    obterUsuarioLogado(
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

}


function exigirAdmin(
  req,
  res,
  next
) {

  if (
    req.usuarioLogado
      ?.perfil !==
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
      'emissor'
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
      'entregador'
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
// TODA API ABAIXO EXIGE LOGIN
// ============================================================

app.use(
  '/api',
  exigirLogin
);


// ============================================================
// TESTE DO SERVIDOR
// ============================================================

app.get(
  '/teste',
  (req, res) => {

    res.send(
      'Servidor Hiperion funcionando!'
    );

  }
);

// ============================================================
// CLIENTES / EMPRESAS
// Consulta global; manutenção exclusiva da Legalização e Admin.
// ============================================================

app.get('/api/clientes', (req, res) => {
  try {
    const incluirInativos = req.query.inativos === '1' &&
      podeGerenciarClientes(req.usuarioLogado);

    const clientes = db.prepare(`
      SELECT id, nome, box, endereco, numero, complemento,
             bairro, cidade, uf, cep, observacao, ativo,
             criado_em, atualizado_em
      FROM clientes
      ${incluirInativos ? '' : 'WHERE ativo = 1'}
      ORDER BY nome COLLATE NOCASE
    `).all();

    res.json({
      clientes,
      pode_gerenciar: podeGerenciarClientes(req.usuarioLogado)
    });
  } catch (erro) {
    console.error('Erro ao listar clientes:', erro);
    res.status(500).json({ erro: 'Erro ao buscar empresas.' });
  }
});

app.post('/api/clientes', exigirGerenciaDeClientes, (req, res) => {
  try {
    const nome = String(req.body.nome || '').replace(/\s+/g, ' ').trim();
    if (!nome) return res.status(400).json({ erro: 'Nome da empresa é obrigatório.' });

    const valor = campo => {
      const texto = String(req.body[campo] || '').trim();
      return texto || null;
    };

    const resultado = db.prepare(`
      INSERT INTO clientes (
        nome, nome_normalizado, box, endereco, numero, complemento,
        bairro, cidade, uf, cep, observacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nome, textoNormalizado(nome), valor('box'), valor('endereco'),
      valor('numero'), valor('complemento'), valor('bairro'),
      valor('cidade'), valor('uf')?.toUpperCase() || null,
      valor('cep'), valor('observacao')
    );

    res.status(201).json({ ok: true, id: Number(resultado.lastInsertRowid) });
  } catch (erro) {
    if (String(erro.message).includes('UNIQUE')) {
      return res.status(409).json({ erro: 'Esta empresa já está cadastrada.' });
    }
    console.error('Erro ao cadastrar cliente:', erro);
    res.status(500).json({ erro: 'Erro ao cadastrar empresa.' });
  }
});

app.put('/api/clientes/:id', exigirGerenciaDeClientes, (req, res) => {
  try {
    const id = Number(req.params.id);
    const nome = String(req.body.nome || '').replace(/\s+/g, ' ').trim();
    if (!Number.isInteger(id) || !nome) {
      return res.status(400).json({ erro: 'Cadastro inválido.' });
    }
    const valor = campo => String(req.body[campo] || '').trim() || null;
    const resultado = db.prepare(`
      UPDATE clientes SET
        nome = ?, nome_normalizado = ?, box = ?, endereco = ?, numero = ?,
        complemento = ?, bairro = ?, cidade = ?, uf = ?, cep = ?,
        observacao = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nome, textoNormalizado(nome), valor('box'), valor('endereco'),
      valor('numero'), valor('complemento'), valor('bairro'),
      valor('cidade'), valor('uf')?.toUpperCase() || null,
      valor('cep'), valor('observacao'), id
    );
    if (!resultado.changes) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    res.json({ ok: true });
  } catch (erro) {
    if (String(erro.message).includes('UNIQUE')) {
      return res.status(409).json({ erro: 'Já existe outra empresa com esse nome.' });
    }
    console.error('Erro ao editar cliente:', erro);
    res.status(500).json({ erro: 'Erro ao editar empresa.' });
  }
});

app.patch('/api/clientes/:id/ativo', exigirGerenciaDeClientes, (req, res) => {
  try {
    const id = Number(req.params.id);
    const ativo = req.body.ativo ? 1 : 0;
    const resultado = db.prepare(`
      UPDATE clientes SET ativo = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?
    `).run(ativo, id);
    if (!resultado.changes) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    res.json({ ok: true });
  } catch (erro) {
    console.error('Erro ao alterar cliente:', erro);
    res.status(500).json({ erro: 'Erro ao alterar empresa.' });
  }
});


// ============================================================
// USUÁRIOS
// ============================================================

app.get(
  '/api/usuarios',
  (req, res) => {

    try {

      const usuarios =
        db.prepare(`
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

          WHERE ativo = 1

          ORDER BY nome
        `).all();

      res.json(
        usuarios
      );

    } catch (erro) {

      console.error(
        'Erro ao buscar usuários:',
        erro
      );

      res.status(500).json({

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
  (req, res) => {

    try {

      const {
        nome,
        departamento,
        perfil,
        usuario,
        senha
      } = req.body;

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

      const perfisValidos = [

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
        db.prepare(`
          SELECT id

          FROM usuarios

          WHERE
            LOWER(usuario) =
            LOWER(?)

          LIMIT 1
        `).get(
          login
        );

      if (
        loginExistente
      ) {

        return res
          .status(409)
          .json({

            erro:
              `O login "${login}" já está sendo utilizado.`

          });

      }

      const credencial =
        gerarHashSenha(
          senha
        );

      const resultado =
        db.prepare(`
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
        `).run(

          nome.trim(),

          departamento.trim(),

          perfil,

          login,

          credencial.hash,

          credencial.salt

        );

      const usuarioCriado =
        db.prepare(`
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
        `).get(
          resultado
            .lastInsertRowid
        );

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

      res.status(500).json({

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
  (req, res) => {

    try {

      const id =
        Number(
          req.params.id
        );

      const {
        nome,
        departamento,
        perfil,
        usuario
      } = req.body;

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

      const perfisValidos = [

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
        db.prepare(`
          SELECT id

          FROM usuarios

          WHERE id = ?

            AND ativo = 1
        `).get(
          id
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

      const duplicado =
        db.prepare(`
          SELECT id

          FROM usuarios

          WHERE
            LOWER(usuario) =
            LOWER(?)

            AND id <> ?

          LIMIT 1
        `).get(
          login,
          id
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

      db.prepare(`
        UPDATE usuarios

        SET
          nome = ?,
          departamento = ?,
          perfil = ?,
          usuario = ?

        WHERE id = ?
      `).run(

        nome.trim(),

        departamento.trim(),

        perfil,

        login,

        id

      );

      const atualizado =
        db.prepare(`
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
        `).get(
          id
        );

      res.json(
        atualizado
      );

    } catch (erro) {

      console.error(
        'Erro ao editar usuário:',
        erro
      );

      res.status(500).json({

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
  (req, res) => {

    try {

      const id =
        Number(
          req.params.id
        );

      const {
        senha
      } = req.body;

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
        db.prepare(`
          SELECT
            id,
            nome,
            ativo

          FROM usuarios

          WHERE id = ?
        `).get(
          id
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

      db.prepare(`
        UPDATE usuarios

        SET
          senha_hash = ?,
          senha_salt = ?

        WHERE id = ?
      `).run(

        credencial.hash,

        credencial.salt,

        id

      );

      db.prepare(`
        DELETE FROM sessoes

        WHERE
          usuario_id = ?
      `).run(
        id
      );

      res.json({

        ok: true,

        mensagem:
          `Senha de "${usuario.nome}" redefinida com sucesso.`

      });

    } catch (erro) {

      console.error(
        'Erro ao redefinir senha:',
        erro
      );

      res.status(500).json({

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
  (req, res) => {

    try {

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
        db.prepare(`
          SELECT
            id,
            nome

          FROM usuarios

          WHERE id = ?

            AND ativo = 1
        `).get(
          id
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

      db.prepare(`
        UPDATE usuarios

        SET
          ativo = 0

        WHERE id = ?
      `).run(
        id
      );

      db.prepare(`
        DELETE FROM sessoes

        WHERE
          usuario_id = ?
      `).run(
        id
      );

      res.json({

        ok: true,

        mensagem:
          `Usuário "${usuarioExistente.nome}" removido do acesso.`

      });

    } catch (erro) {

      console.error(
        'Erro ao remover usuário:',
        erro
      );

      res.status(500).json({

        erro:
          'Erro ao remover usuário.'

      });

    }

  }
);


// ============================================================
// FUNÇÕES DE ITENS / DOCUMENTOS
// ============================================================

function normalizarItensDoProtocolo(
  body
) {

  let itens = [];

  // Formato novo da V17
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

  // Compatibilidade temporária
  // com o HTML antigo.
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


function buscarItensDoProtocolo(
  protocoloId
) {

  return db.prepare(`
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
  `).all(
    protocoloId
  );

}


function anexarItens(
  protocolo
) {

  if (!protocolo) {

    return protocolo;

  }

  return {

    ...protocolo,

    itens:
      buscarItensDoProtocolo(
        protocolo.id
      )

  };

}


function anexarItensEmLista(
  protocolos
) {

  return protocolos
    .map(
      anexarItens
    );

}


// ============================================================
// LISTAR PROTOCOLOS
// ============================================================

app.get(
  '/api/protocolos',
  (req, res) => {

    try {

      const protocolos =
        db.prepare(`
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
        `).all();

      res.json(
        anexarItensEmLista(
          protocolos
        )
      );

    } catch (erro) {

      console.error(
        'Erro ao buscar protocolos:',
        erro
      );

      res.status(500).json({

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
  (req, res) => {

    try {

      const resultado =
        db.prepare(`
          SELECT
            MAX(numero)
            AS ultimo

          FROM protocolos
        `).get();

      const ultimo =
        resultado?.ultimo ||
        0;

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

      res.status(500).json({

        erro:
          'Erro ao buscar próximo número.'

      });

    }

  }
);


// ============================================================
// CRIAR PROTOCOLO COM VÁRIOS ITENS
// ============================================================

app.post(
  '/api/protocolos',
  exigirEmissor,
  (req, res) => {

    const {
      numero,
      cliente,
      cliente_id,
      cliente_box,
      endereco_empresa,
      departamento,
      entregador,
      observacao
    } = req.body;

    const itens =
      normalizarItensDoProtocolo(
        req.body
      );

    const clienteCadastro = Number(cliente_id)
      ? db.prepare(`
          SELECT id, nome, box, endereco, numero, complemento,
                 bairro, cidade, uf, cep
          FROM clientes
          WHERE id = ? AND ativo = 1
        `).get(Number(cliente_id))
      : null;

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

    let transacaoAberta =
      false;

    try {

      // Protocolo e itens serão
      // gravados juntos.
      db.exec(
        'BEGIN IMMEDIATE'
      );

      transacaoAberta =
        true;

      let numeroFinal;

      // ==================================
      // NÚMERO MANUAL
      // ==================================

      if (
        numero !==
          undefined &&

        numero !==
          null &&

        numero !==
          ''
      ) {

        numeroFinal =
          Number(
            numero
          );

        if (
          !Number.isInteger(
            numeroFinal
          ) ||

          numeroFinal <=
            0
        ) {

          db.exec(
            'ROLLBACK'
          );

          transacaoAberta =
            false;

          return res
            .status(400)
            .json({

              erro:
                'Número do protocolo inválido.'

            });

        }

        const duplicado =
          db.prepare(`
            SELECT id

            FROM protocolos

            WHERE
              numero = ?
          `).get(
            numeroFinal
          );

        if (
          duplicado
        ) {

          db.exec(
            'ROLLBACK'
          );

          transacaoAberta =
            false;

          return res
            .status(409)
            .json({

              erro:
                `O protocolo ${String(
                  numeroFinal
                ).padStart(
                  6,
                  '0'
                )} já existe.`

            });

        }

      }

      // ==================================
      // NÚMERO AUTOMÁTICO
      // ==================================

      else {

        const resultadoNumero =
          db.prepare(`
            SELECT
              MAX(numero)
              AS ultimo

            FROM protocolos
          `).get();

        numeroFinal =
          (
            resultadoNumero
              ?.ultimo ||
            0
          ) + 1;

      }

      const emissor =
        req.usuarioLogado.nome;

      // O primeiro item também fica
      // gravado nos campos antigos.
      // Isso mantém compatibilidade
      // com o HTML/cache atual.
      const primeiroItem =
        itens[0];

      const resultado =
        db.prepare(`
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
        `).run(

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

        );

      const protocoloId =
        Number(
          resultado
            .lastInsertRowid
        );

      const inserirItem =
        db.prepare(`
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
        `);

      itens.forEach(
        (
          item,
          indice
        ) => {

          inserirItem.run(

            protocoloId,

            item.descricao,

            item.competencia,

            item.vencimento,

            indice + 1

          );

        }
      );

      db.exec(
        'COMMIT'
      );

      transacaoAberta =
        false;

      const protocoloCriado =
        db.prepare(`
          SELECT *

          FROM protocolos

          WHERE id = ?
        `).get(
          protocoloId
        );

      res
        .status(201)
        .json(

          anexarItens(
            protocoloCriado
          )

        );

    } catch (erro) {

      if (
        transacaoAberta
      ) {

        try {

          db.exec(
            'ROLLBACK'
          );

        } catch (_) {}

      }

      console.error(
        'Erro ao criar protocolo:',
        erro
      );

      if (
        String(
          erro?.message ||
          ''
        ).includes(
          'UNIQUE constraint failed: protocolos.numero'
        )
      ) {

        return res
          .status(409)
          .json({

            erro:
              'Já existe um protocolo com esse número.'

          });

      }

      res.status(500).json({

        erro:
          'Erro ao criar protocolo.'

      });

    }

  }
);


// ============================================================
// INICIAR / ABRIR ENTREGA
// ============================================================

app.put(
  '/api/protocolos/:id/em-entrega',
  exigirEntregador,
  (req, res) => {

    try {

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
        db.prepare(`
          SELECT *

          FROM protocolos

          WHERE
            id = ?

            AND
            COALESCE(
              excluido,
              0
            ) = 0
        `).get(
          id
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

          anexarItens(
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

      db.prepare(`
        UPDATE protocolos

        SET
          status =
            'Em entrega'

        WHERE id = ?
      `).run(
        id
      );

      const atualizado =
        db.prepare(`
          SELECT *

          FROM protocolos

          WHERE id = ?
        `).get(
          id
        );

      res.json(

        anexarItens(
          atualizado
        )

      );

    } catch (erro) {

      console.error(
        'Erro ao iniciar entrega:',
        erro
      );

      res.status(500).json({

        erro:
          'Erro interno ao iniciar entrega.'

      });

    }

  }
);


// ============================================================
// CONFIRMAR ENTREGA + ASSINATURA
// ============================================================

app.put(
  '/api/protocolos/:id/entregar',
  exigirEntregador,
  (req, res) => {

    try {

      const id =
        Number(
          req.params.id
        );

      const {
        recebido_por,
        assinatura,
        entregue_em_local
      } = req.body;

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
        db.prepare(`
          SELECT *

          FROM protocolos

          WHERE
            id = ?

            AND
            COALESCE(
              excluido,
              0
            ) = 0
        `).get(
          id
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

      // Importante para sincronização:
      // se já chegou uma vez,
      // devolvemos o protocolo.
      if (
        protocolo.status ===
        'Entregue'
      ) {

        return res.json(

          anexarItens(
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
            dataLocal
              .getTime()
          )
        ) {

          entregueEm =
            dataLocal
              .toISOString();

        }

      }

      db.prepare(`
        UPDATE protocolos

        SET
          status =
            'Entregue',

          recebido_por = ?,

          assinatura = ?,

          entregue_em = ?

        WHERE id = ?
      `).run(

        String(
          recebido_por
        ).trim(),

        assinatura,

        entregueEm,

        id

      );

      const atualizado =
        db.prepare(`
          SELECT *

          FROM protocolos

          WHERE id = ?
        `).get(
          id
        );

      res.json(

        anexarItens(
          atualizado
        )

      );

    } catch (erro) {

      console.error(
        'Erro ao confirmar entrega:',
        erro
      );

      res.status(500).json({

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
  (req, res) => {

    try {

      const id =
        Number(
          req.params.id
        );

      const {
        motivo
      } = req.body;

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
        db.prepare(`
          SELECT *

          FROM protocolos

          WHERE
            id = ?

            AND
            COALESCE(
              excluido,
              0
            ) = 0
        `).get(
          id
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

      db.prepare(`
        UPDATE protocolos

        SET
          status =
            'Cancelado',

          motivo_cancelamento = ?,

          cancelado_por = ?,

          cancelado_em = ?

        WHERE id = ?
      `).run(

        motivo?.trim() ||
          'Sem motivo informado',

        req.usuarioLogado
          .nome,

        new Date()
          .toISOString(),

        id

      );

      const atualizado =
        db.prepare(`
          SELECT *

          FROM protocolos

          WHERE id = ?
        `).get(
          id
        );

      res.json(

        anexarItens(
          atualizado
        )

      );

    } catch (erro) {

      console.error(
        'Erro ao cancelar protocolo:',
        erro
      );

      res.status(500).json({

        erro:
          'Erro ao cancelar protocolo.'

      });

    }

  }
);


// ============================================================
// EXCLUIR PROTOCOLO
// ============================================================

app.put(
  '/api/protocolos/:id/excluir',
  exigirAdmin,
  (req, res) => {

    try {

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
        db.prepare(`
          SELECT *

          FROM protocolos

          WHERE id = ?
        `).get(
          id
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

      db.prepare(`
        UPDATE protocolos

        SET
          excluido = 1,

          excluido_em = ?,

          excluido_por = ?

        WHERE id = ?
      `).run(

        new Date()
          .toISOString(),

        req.usuarioLogado
          .nome,

        id

      );

      res.json({

        ok: true,

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

      res.status(500).json({

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
  (req, res) => {

    try {

      const protocolos =
        db.prepare(`
          SELECT
            id,
            numero,
            cliente,
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
        `).all();

      res.json(

        anexarItensEmLista(
          protocolos
        )

      );

    } catch (erro) {

      console.error(
        'Erro ao buscar protocolos excluídos:',
        erro
      );

      res.status(500).json({

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
  (req, res) => {

    try {

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
        db.prepare(`
          SELECT *

          FROM protocolos

          WHERE id = ?
        `).get(
          id
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

      db.prepare(`
        UPDATE protocolos

        SET
          excluido = 0,

          excluido_em =
            NULL,

          excluido_por =
            NULL

        WHERE id = ?
      `).run(
        id
      );

      const restaurado =
        db.prepare(`
          SELECT *

          FROM protocolos

          WHERE id = ?
        `).get(
          id
        );

      res.json(

        anexarItens(
          restaurado
        )

      );

    } catch (erro) {

      console.error(
        'Erro ao restaurar protocolo:',
        erro
      );

      res.status(500).json({

        erro:
          'Erro ao restaurar protocolo.'

      });

    }

  }
);
// ============================================================
// EXCLUIR PROTOCOLO DEFINITIVAMENTE
// SOMENTE ADMINISTRADOR
// ============================================================

app.delete(
  '/api/protocolos/:id/definitivo',
  exigirAdmin,
  (req, res) => {

    const id = Number(
      req.params.id
    );

    // ----------------------------------------
    // VALIDAR ID
    // ----------------------------------------

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {

      return res
        .status(400)
        .json({
          erro:
            'ID do protocolo inválido.'
        });

    }

    let transacaoAberta = false;

    try {

      // ----------------------------------------
      // LOCALIZAR PROTOCOLO
      // ----------------------------------------

      const protocolo =
        db.prepare(`
          SELECT
            id,
            numero,
            cliente,
            status,
            excluido

          FROM protocolos

          WHERE id = ?
        `).get(id);

      if (!protocolo) {

        return res
          .status(404)
          .json({
            erro:
              'Protocolo não encontrado.'
          });

      }

      // ----------------------------------------
      // SEGURANÇA
      //
      // Só permitimos apagar definitivamente
      // algo que já tenha sido excluído antes.
      // ----------------------------------------

      if (
        Number(
          protocolo.excluido || 0
        ) !== 1
      ) {

        return res
          .status(400)
          .json({
            erro:
              'O protocolo precisa estar na área de protocolos excluídos antes da exclusão definitiva.'
          });

      }

      // ----------------------------------------
      // TRANSAÇÃO
      // ----------------------------------------

      db.exec(
        'BEGIN IMMEDIATE'
      );

      transacaoAberta = true;

      // ----------------------------------------
      // APAGAR ITENS DO PROTOCOLO
      // ----------------------------------------

      db.prepare(`
        DELETE FROM protocolo_itens
        WHERE protocolo_id = ?
      `).run(id);

      // ----------------------------------------
      // APAGAR PROTOCOLO
      // ----------------------------------------

      const resultado =
        db.prepare(`
          DELETE FROM protocolos
          WHERE
            id = ?
            AND COALESCE(excluido, 0) = 1
        `).run(id);

      if (
        Number(
          resultado.changes || 0
        ) !== 1
      ) {

        throw new Error(
          'O protocolo não pôde ser excluído definitivamente.'
        );

      }

      db.exec(
        'COMMIT'
      );

      transacaoAberta = false;

      // ----------------------------------------
      // RESPOSTA
      // ----------------------------------------

      res.json({

        ok: true,

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

      if (transacaoAberta) {

        try {

          db.exec(
            'ROLLBACK'
          );

        } catch (_) {}

      }

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
// INICIA O SERVIDOR
// ============================================================

app.listen(
  PORT,
  () => {

    console.log(
      `Hiperion Protocolos rodando em http://localhost:${PORT}`
    );

  }
);
