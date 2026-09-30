# Segurança

## Dados protegidos

Credenciais, assinaturas, dados de empresas, bancos SQLite, arquivos WAL, backups, tokens e arquivos `.env` não pertencem ao repositório público.

## Controles

- senhas são armazenadas por derivação criptográfica, nunca em texto puro;
- sessões e permissões são validadas pela API;
- operações administrativas exigem perfil autorizado;
- segredos são fornecidos por variáveis de ambiente;
- o arquivo SQLite fica fora do diretório público da aplicação.

## Implantação

1. Use HTTPS fora de `localhost`.
2. Restrinja a instalação interna à LAN ou VPN.
3. Execute o processo com o mínimo de permissões necessário.
4. Mantenha Node.js e dependências atualizados após homologação.
5. Faça backup e teste restauração.
6. Revogue credenciais temporárias após migrações.
7. Desative contas sem necessidade de acesso.

## Divulgação responsável

Não publique detalhes de uma vulnerabilidade enquanto ela puder afetar uma instalação ativa. Encaminhe o relato de forma privada ao responsável pelo repositório, incluindo impacto, passos de reprodução e uma sugestão de correção quando possível.
