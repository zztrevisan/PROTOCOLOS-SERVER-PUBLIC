# Hiperion Protocolos

Aplicação interna para emissão, transporte, entrega e rastreabilidade de documentos. A instalação principal roda na infraestrutura da organização com Node.js e SQLite; quando necessário, a mesma solução pode ser publicada na web com Vercel e Turso.

Este repositório é uma edição pública e sanitizada para demonstração, portfólio e avaliação técnica. Bancos, credenciais, backups e dados operacionais não fazem parte dele.

## O que o sistema resolve

- cadastro de empresas e usuários;
- emissão de protocolos com múltiplos documentos;
- atribuição de responsáveis e separação por perfil;
- confirmação de entrega com nome, assinatura e QR Code;
- cancelamento, exclusão recuperável e histórico;
- impressão de protocolos e etiquetas;
- operação offline nos fluxos suportados pela PWA.

## Modos de execução

| Modo | Uso recomendado | Persistência | Entrada |
| --- | --- | --- | --- |
| Interno | operação cotidiana na rede da organização | SQLite local | `server.js` |
| Web portável | homologação, demonstração ou acesso autorizado pela internet | Turso | `server-turso.js` |

O modo web é uma opção de portabilidade, não o centro da arquitetura. Os dois servidores atendem a mesma interface e preservam os principais fluxos, mas toda alteração deve ser validada nos dois ambientes.

## Executar localmente

Requisitos: Node.js 24 ou superior e npm.

```powershell
npm ci
Copy-Item .env.example .env
npm run start:internal
```

Acesse `http://localhost:3000`. Na primeira execução, o SQLite é criado no caminho definido por `SQLITE_DATABASE_PATH`.

Para desenvolvimento, mantenha o banco fora de pastas sincronizadas. Em produção, use um diretório protegido e persistente no servidor interno.

## Executar com portabilidade web

Crie um banco Turso, preencha `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` no ambiente e execute:

```powershell
npm run prepare:cloud
npm run start:cloud
```

Na Vercel, cadastre as mesmas variáveis no projeto. Nunca envie `.env`, tokens ou dados reais ao GitHub.

## Verificação

```powershell
npm test
```

O comando valida a sintaxe dos arquivos JavaScript sem acessar o banco operacional.

## Documentação

- [Contexto e linguagem do domínio](CONTEXT.md)
- [Arquitetura](docs/ARQUITETURA.md)
- [Fluxos e permissões](docs/FLUXOS.md)
- [Execução interna](docs/EXECUCAO-INTERNA.md)
- [Portabilidade web](docs/PORTABILIDADE-WEB.md)
- [Segurança](docs/SEGURANCA.md)

## Estrutura

```text
public/             interface e recursos da PWA
banco/              inicialização e acesso ao SQLite
scripts/            verificações automatizadas
server.js           servidor interno com SQLite
server-turso.js     servidor portável com Turso
vercel.json         adaptação para hospedagem na Vercel
docs/               documentação técnica e operacional
```

## Licença

Software proprietário de **Guilherme Andrade dos Santos Trevisan**. A publicação do código não concede permissão automática de uso, cópia, modificação ou redistribuição. Consulte [LICENSE](LICENSE).

**Copyright © 2026 Guilherme Andrade dos Santos Trevisan. Todos os direitos reservados.**
