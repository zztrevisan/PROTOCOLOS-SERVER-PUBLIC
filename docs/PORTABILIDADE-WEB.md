# Portabilidade web

A hospedagem web permite executar a aplicação fora da rede interna, mas não muda seu propósito: o Hiperion Protocolos continua sendo uma ferramenta de operação interna.

## Componentes

- Vercel executa `server-turso.js` e distribui os arquivos da PWA;
- Turso fornece o banco compatível com execução serverless;
- `vercel.json` direciona recursos estáticos e requisições da API.

## Configuração

Cadastre no ambiente de hospedagem:

```dotenv
TURSO_DATABASE_URL=libsql://seu-banco.turso.io
TURSO_AUTH_TOKEN=seu-token
NODE_ENV=production
```

Prepare a estrutura do banco em um ambiente controlado:

```powershell
npm ci
npm run prepare:cloud
npm run start:cloud
```

Use credenciais separadas por ambiente. Tokens, exportações, bancos e arquivos `.env` nunca devem ser enviados ao repositório.

## Validação

Antes de disponibilizar uma versão, valide autenticação, permissões, cadastro de empresas, emissão, entrega, cancelamento, restauração, impressão e comportamento em tela móvel.

Se o ambiente interno e o web estiverem ativos ao mesmo tempo, defina qual deles é a fonte oficial. Não permita escrita concorrente em bases independentes sem um processo explícito de sincronização.
