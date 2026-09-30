# Execução interna

## Arquitetura recomendada

```text
Usuários na LAN ou VPN -> HTTPS -> proxy reverso -> Node.js -> SQLite local
```

O processo Node.js e o arquivo SQLite devem permanecer no servidor controlado pela organização.

## Preparação

```powershell
npm ci --omit=dev
Copy-Item .env.example .env
```

Configure pelo menos:

```dotenv
PORT=3000
NODE_ENV=production
SQLITE_DATABASE_PATH=D:/HiperionDados/hiperion.db
```

O diretório do banco precisa existir e ter permissões restritas ao usuário do serviço. Não use OneDrive, pasta sincronizada ou compartilhamento de rede para o arquivo SQLite.

## Inicialização

```powershell
npm test
npm run start:internal
```

Em produção, registre o comando como serviço do sistema, com reinício automático e logs rotacionados. Publique aos usuários por HTTPS através de IIS, Nginx ou outro proxy aprovado pela TI; não exponha diretamente o processo Node.js à internet.

## Backup

Faça cópias consistentes em rotina definida pela TI, armazene-as em outro equipamento e teste periodicamente a restauração. Copiar apenas o arquivo principal enquanto existem gravações ou arquivos WAL pode gerar um backup incompleto.

## Atualização

Antes de atualizar, registre o commit implantado e gere um backup verificável. Depois execute `npm ci --omit=dev`, `npm test`, reinicie o serviço e valide login, emissão e entrega com dados de homologação.
