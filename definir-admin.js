const crypto = require('crypto');
const db = require('./banco/db');

function perguntarSenha(texto) {

  return new Promise((resolve) => {

    process.stdout.write(texto);

    let senha = '';

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function finalizar() {

      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', receber);

      process.stdout.write('\n');

      resolve(senha);
    }

    function receber(tecla) {

      // CTRL + C
      if (tecla === '\u0003') {

        process.stdout.write('\nOperação cancelada.\n');

        process.stdin.setRawMode(false);

        process.exit();

      }

      // ENTER
      if (
        tecla === '\r' ||
        tecla === '\n'
      ) {

        finalizar();
        return;

      }

      // BACKSPACE
      if (
        tecla === '\u0008' ||
        tecla === '\u007f'
      ) {

        if (senha.length > 0) {

          senha =
            senha.slice(0, -1);

          process.stdout.write(
            '\b \b'
          );

        }

        return;

      }

      senha += tecla;

      process.stdout.write('*');

    }

    process.stdin.on(
      'data',
      receber
    );

  });

}


async function iniciar() {

  try {

    console.log('');
    console.log(
      '=============================='
    );

    console.log(
      ' HIPERION - CRIAR LOGIN ADMIN'
    );

    console.log(
      '=============================='
    );

    console.log('');


    const admin = db
      .prepare(`
        SELECT
          id,
          nome,
          departamento,
          perfil
        FROM usuarios
        WHERE perfil = 'admin'
          AND ativo = 1
        ORDER BY id
        LIMIT 1
      `)
      .get();


    if (!admin) {

      console.log(
        'Nenhum administrador ativo foi encontrado.'
      );

      process.exit();

    }


    console.log(
      `Administrador encontrado: ${admin.nome}`
    );

    console.log(
      `Departamento: ${admin.departamento}`
    );

    console.log('');


    const usuario = 'admin';


    console.log(
      `Login que será criado: ${usuario}`
    );

    console.log('');


    const senha =
      await perguntarSenha(
        'Digite a senha: '
      );


    if (senha.length < 6) {

      console.log('');
      console.log(
        'A senha precisa ter pelo menos 6 caracteres.'
      );

      process.exit();

    }


    const confirmar =
      await perguntarSenha(
        'Digite a senha novamente: '
      );


    if (senha !== confirmar) {

      console.log('');
      console.log(
        'As senhas não são iguais.'
      );

      process.exit();

    }


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


    db.prepare(`
      UPDATE usuarios
      SET
        usuario = ?,
        senha_hash = ?,
        senha_salt = ?
      WHERE id = ?
    `).run(
      usuario,
      hash,
      salt,
      admin.id
    );


    console.log('');
    console.log(
      '✅ Login do administrador criado com sucesso.'
    );

    console.log('');
    console.log(
      'Login: admin'
    );

    console.log(
      'Senha: armazenada de forma protegida.'
    );

    console.log('');

  } catch (erro) {

    console.error(
      'Erro ao configurar administrador:',
      erro
    );

  }

}


iniciar();