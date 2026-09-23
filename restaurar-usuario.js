const readline = require('readline');
const db = require('./banco/db');

// ============================================================
// HIPERION PROTOCOLOS
// RESTAURAÇÃO DE USUÁRIOS INATIVOS
// ============================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function listarUsuariosInativos() {
  return db.prepare(`
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
    WHERE ativo = 0
    ORDER BY nome
  `).all();
}

function restaurarUsuario(id) {
  const usuario = db.prepare(`
    SELECT
      id,
      nome,
      departamento,
      perfil,
      usuario,
      ativo
    FROM usuarios
    WHERE id = ?
    LIMIT 1
  `).get(id);

  if (!usuario) {
    return {
      ok: false,
      mensagem: 'Usuário não encontrado.'
    };
  }

  if (Number(usuario.ativo) === 1) {
    return {
      ok: false,
      mensagem: 'Este usuário já está ativo.'
    };
  }

  db.prepare(`
    UPDATE usuarios
    SET ativo = 1
    WHERE id = ?
  `).run(id);

  return {
    ok: true,
    usuario
  };
}

function encerrar() {
  console.log('');
  console.log('Operação finalizada.');
  console.log('');

  rl.close();
  process.exit(0);
}

// ============================================================
// INÍCIO
// ============================================================

console.log('');
console.log('==============================================');
console.log(' HIPERION PROTOCOLOS');
console.log(' Restaurar usuário inativo');
console.log('==============================================');
console.log('');

const usuarios = listarUsuariosInativos();

if (usuarios.length === 0) {
  console.log('Nenhum usuário inativo foi encontrado.');
  console.log('');
  encerrar();
}

// ============================================================
// MOSTRAR USUÁRIOS INATIVOS
// ============================================================

console.log('Usuários inativos encontrados:');
console.log('');

usuarios.forEach((usuario, indice) => {
  console.log(
    `${indice + 1} - ${usuario.nome}`
  );

  console.log(
    `    Login: ${usuario.usuario || 'Não definido'}`
  );

  console.log(
    `    Departamento: ${usuario.departamento}`
  );

  console.log(
    `    Perfil: ${usuario.perfil}`
  );

  console.log('');
});

console.log('0 - Cancelar');
console.log('');

// ============================================================
// ESCOLHER USUÁRIO
// ============================================================

rl.question(
  'Digite o número do usuário que deseja restaurar: ',
  resposta => {

    const escolha = Number(
      String(resposta).trim()
    );

    if (
      !Number.isInteger(escolha) ||
      escolha < 0 ||
      escolha > usuarios.length
    ) {
      console.log('');
      console.log('Opção inválida.');
      encerrar();
      return;
    }

    if (escolha === 0) {
      console.log('');
      console.log('Nenhuma alteração realizada.');
      encerrar();
      return;
    }

    const selecionado =
      usuarios[escolha - 1];

    console.log('');
    console.log('Usuário selecionado:');
    console.log('');
    console.log(`Nome: ${selecionado.nome}`);
    console.log(
      `Login: ${selecionado.usuario || 'Não definido'}`
    );
    console.log(
      `Departamento: ${selecionado.departamento}`
    );
    console.log(
      `Perfil: ${selecionado.perfil}`
    );
    console.log('');

    // ========================================================
    // CONFIRMAÇÃO
    // ========================================================

    rl.question(
      'Confirma a restauração deste usuário? (S/N): ',
      confirmacao => {

        const respostaConfirmacao =
          String(confirmacao)
            .trim()
            .toLowerCase();

        if (
          respostaConfirmacao !== 's' &&
          respostaConfirmacao !== 'sim'
        ) {
          console.log('');
          console.log('Restauração cancelada.');
          encerrar();
          return;
        }

        try {
          const resultado =
            restaurarUsuario(
              selecionado.id
            );

          if (!resultado.ok) {
            console.log('');
            console.log(resultado.mensagem);
            encerrar();
            return;
          }

          console.log('');
          console.log(
            'Usuário restaurado com sucesso.'
          );
          console.log('');
          console.log(
            `Nome: ${resultado.usuario.nome}`
          );
          console.log(
            `Login: ${resultado.usuario.usuario || 'Não definido'}`
          );
          console.log('');
          console.log(
            'A senha anterior foi preservada.'
          );
          console.log(
            'Se necessário, redefina a senha pelo painel administrativo.'
          );

          encerrar();

        } catch (erro) {
          console.error('');
          console.error(
            'Erro ao restaurar usuário:'
          );
          console.error(erro);
          console.error('');

          rl.close();
          process.exit(1);
        }
      }
    );
  }
);