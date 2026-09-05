# Publicação independente no Render

## Estado

Há dois destinos de build: `pnpm build` preserva Cloudflare/D1; `pnpm build:render` usa Node/PostgreSQL. O localhost padrão continua no D1. Não use `pnpm start` no Render, pois ele é o comando legado Wrangler.

## Configuração do Web Service

- Repositório: CenaPlanner, branch que contém a adaptação Node.
- Runtime: Node; versão 22.22.0 ou posterior compatível com Node 22.
- Build: `pnpm install --frozen-lockfile && pnpm build:render`
- Start: `pnpm start:render`
- `PORT`: fornecida pelo Render; o servidor escuta em `0.0.0.0`.
- Variáveis privadas: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
- No plano gratuito do Render, use o gateway HTTPS do Google Apps Script: publique
  `scripts/google-apps-script-email-gateway.gs` como Web App executado pelo proprietário,
  crie a propriedade de script `GATEWAY_TOKEN` e configure `EMAIL_GATEWAY_URL` e
  `NOTIFICATION_GATEWAY_TOKEN` no Render. A URL do gateway sempre tem prioridade.
- `GMAIL_SMTP_USER` e `GMAIL_APP_PASSWORD` só funcionam em instâncias pagas do Render,
  pois o plano gratuito bloqueia conexões SMTP nas portas 25, 465 e 587.
- Adicione `prod-ca-2021.crt` como arquivo secreto e configure `PGSSLROOTCERT=/etc/secrets/prod-ca-2021.crt`.
- Não coloque a senha no repositório nem use prefixos de variáveis públicas.

O certificado é validado; não desabilite TLS. Configure o projeto Supabase de autenticação original para manter os identificadores dos usuários. Revise também a URL do site e redirecionamentos do Supabase Auth após obter o endereço Render.

## Migração

`scripts/backup-local.mjs` produz snapshot consistente com manifesto SHA-256. `scripts/migrate-postgres.mjs` importa esse backup para o schema privado `cenaplanner`, em uma transação. Recusa destino existente, valida usuários em `auth.users`, verifica cada linha, recria índices e reajusta sequências. Não reaplique sobre a base já migrada.

As tabelas têm RLS habilitado sem acesso público. O backend conecta por PostgreSQL e aplica o escopo do usuário autenticado; a Data API pública do Supabase não é usada para finanças. A conexão administrativa deve permanecer exclusivamente no servidor.

O snapshot importado é uma cópia pontual. Novos lançamentos feitos no localhost após o backup NÃO aparecem automaticamente no PostgreSQL. Antes da troca definitiva, interrompa novas escritas no ambiente antigo e faça uma reconciliação planejada. Preserve o D1 e seus backups; nunca sobrescreva uma das bases para tentar sincronizar.

## Validação e rollback

Antes de trocar a URL principal: testar login, onboarding, leitura, edição, pagamento, recorrências, metas e isolamento entre usuários. Validar e-mail/cron separadamente; não estão ativados apenas por publicar o Web Service.

O código e o banco antigos permanecem disponíveis para recuperação. Depois que houver escritas no PostgreSQL, voltar ao D1 sem reconciliar dados perderia as alterações novas. Não use rollback de banco automático.
