# Hiperion Protocolos

Sistema web para cadastro, acompanhamento, entrega e arquivamento de protocolos.

## Recursos

- Autenticação por sessão e perfis de acesso
- Cadastro de empresas e usuários
- Criação e acompanhamento de protocolos
- Fluxo de entrega, cancelamento, exclusão e restauração
- Suporte offline no navegador
- Banco local SQLite ou banco remoto Turso
- Implantação compatível com Vercel

## Requisitos

- Node.js 20 ou superior
- Uma conta e um banco no Turso para usar `server-turso.js`

## Configuração

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env`.
3. Preencha `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`.
4. Prepare as tabelas com `node preparar-turso.js`.
5. Crie o administrador com `node criar-admin-turso.js`.
6. Inicie com `npm start`.

O servidor fica disponível em `http://localhost:3000` por padrão.

## Segurança

Nunca publique arquivos `.env`, tokens, senhas, backups ou arquivos de banco de dados. Esses itens estão bloqueados pelo `.gitignore`.

Antes de colocar o sistema em produção, configure as variáveis de ambiente diretamente na plataforma de hospedagem.

## Verificação

Execute `npm test` para validar a sintaxe dos arquivos JavaScript do projeto.

## Licença

ISC.
