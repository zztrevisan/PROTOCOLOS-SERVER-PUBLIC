const crypto = require('crypto');
const readline = require('readline');


// ============================================================
// CARREGAR .ENV
// ============================================================

try {

  process.loadEnvFile('.env');

} catch (erro) {

  console.error('');
  console.error(
    'Não foi possível carregar o arquivo .env.'
  );
  console.error('');

  process.exit(1);

}


// ============================================================
// VARIÁVEIS TURSO
// ============================================================

const databaseUrl =
  process.env
    .TURSO_DATABASE_URL
    ?.trim();


const authToken =
  process.env
    .TURSO_AUTH_TOKEN
    ?.trim();


if (
  !databaseUrl ||
  !authToken
) {

  console.error('');
  console.error(
    'TURSO_DATABASE_URL ou TURSO_AUTH_TOKEN não encontrados.'
  );
  console.error('');

  process.exit(1);

}


// ============================================================
// READLINE
// ============================================================

const rl =
  readline.createInterface({

    input:
      process.stdin,

    output:
      process.stdout

  });


function perguntar(
  pergunta
) {

  return new Promise(
    resolve => {

      rl.question(
        pergunta,
        resposta => {

          resolve(
            resposta
          );

        }
      );

    }
  );

}


// ============================================================
// HASH DA SENHA
// MESMO SISTEMA UTILIZADO PELO HIPERION
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
// INICIAR
// ============================================================

async function iniciar() {

  try {

    const {
      connect
    } =
      await import(
        '@tursodatabase/serverless'
      );


    const db =
      connect({

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
      ' HIPERION - CRIAR ADMIN TURSO'
    );

    console.log(
      '======================================'
    );

    console.log('');

    console.log(
      'Este usuário será criado somente no banco Turso de teste.'
    );

    console.log('');


    // ========================================================
    // NOME
    // ========================================================

    let nome =
      await perguntar(
        'Nome [Administrador Teste]: '
      );


    nome =
      nome.trim() ||
      'Administrador Teste';


    // ========================================================
    // LOGIN
    // ========================================================

    let usuario =
      await perguntar(
        'Login [admin]: '
      );


    usuario =
      usuario
        .trim()
        .toLowerCase() ||
      'admin';


    if (
      !/^[a-z0-9._-]{3,30}$/
        .test(
          usuario
        )
    ) {

      console.error('');
      console.error(
        'Login inválido.'
      );

      console.error(
        'Use de 3 a 30 caracteres: letras, números, ponto, traço ou underline.'
      );

      console.error('');

      rl.close();

      return;

    }


    // ========================================================
    // SENHA
    // ========================================================

    const senha =
      await perguntar(
        'Senha de teste (mínimo 6 caracteres): '
      );


    if (
      !senha ||
      senha.length < 6
    ) {

      console.error('');
      console.error(
        'A senha precisa ter pelo menos 6 caracteres.'
      );
      console.error('');

      rl.close();

      return;

    }


    const confirmarSenha =
      await perguntar(
        'Digite a senha novamente: '
      );


    if (
      senha !==
      confirmarSenha
    ) {

      console.error('');
      console.error(
        'As senhas não conferem.'
      );
      console.error('');

      rl.close();

      return;

    }


    // ========================================================
    // VERIFICAR SE LOGIN JÁ EXISTE
    // ========================================================

    const existente =
      await db.get(

        `
          SELECT

            id,
            nome,
            usuario,
            ativo

          FROM usuarios

          WHERE

            LOWER(usuario) =
            LOWER(?)

          LIMIT 1
        `,

        usuario

      );


    const credencial =
      gerarHashSenha(
        senha
      );


    // ========================================================
    // SE JÁ EXISTIR, ATUALIZA
    // ========================================================

    if (
      existente
    ) {

      console.log('');
      console.log(
        `O login "${usuario}" já existe no Turso.`
      );

      console.log(
        'Atualizando esse cadastro para administrador...'
      );


      await db.run(

        `
          UPDATE usuarios

          SET

            nome = ?,

            departamento =
              'Administrativo',

            perfil =
              'admin',

            senha_hash = ?,

            senha_salt = ?,

            ativo = 1

          WHERE id = ?
        `,

        nome,

        credencial.hash,

        credencial.salt,

        existente.id

      );


      await db.run(

        `
          DELETE FROM sessoes

          WHERE usuario_id = ?
        `,

        existente.id

      );


      console.log('');
      console.log(
        'Administrador atualizado com sucesso.'
      );

      console.log('');
      console.log(
        `ID: ${existente.id}`
      );

      console.log(
        `Nome: ${nome}`
      );

      console.log(
        `Login: ${usuario}`
      );

      console.log(
        'Perfil: admin'
      );

      console.log('');

      rl.close();

      return;

    }


    // ========================================================
    // CRIAR NOVO ADMINISTRADOR
    // ========================================================

    await db.run(

      `
        INSERT INTO usuarios (

          nome,

          departamento,

          perfil,

          ativo,

          usuario,

          senha_hash,

          senha_salt

        )

        VALUES (

          ?,

          'Administrativo',

          'admin',

          1,

          ?,

          ?,

          ?

        )
      `,

      nome,

      usuario,

      credencial.hash,

      credencial.salt

    );


    // ========================================================
    // CONFIRMAR CADASTRO
    // ========================================================

    const criado =
      await db.get(

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

        usuario

      );


    console.log('');
    console.log(
      '======================================'
    );

    console.log(
      ' ADMINISTRADOR CRIADO COM SUCESSO'
    );

    console.log(
      '======================================'
    );

    console.log('');

    console.log(
      `ID: ${criado.id}`
    );

    console.log(
      `Nome: ${criado.nome}`
    );

    console.log(
      `Departamento: ${criado.departamento}`
    );

    console.log(
      `Perfil: ${criado.perfil}`
    );

    console.log(
      `Login: ${criado.usuario}`
    );

    console.log('');

    console.log(
      'A senha foi gravada criptografada no Turso.'
    );

    console.log('');


  } catch (erro) {

    console.error('');
    console.error(
      'ERRO AO CRIAR ADMINISTRADOR:'
    );

    console.error('');

    console.error(
      erro
    );

    console.error('');

  } finally {

    rl.close();

  }

}


iniciar();