# CenaPlanner

Controle financeiro pessoal com visão mensal e anual, receitas, despesas, recorrências e relatórios por categoria. O objetivo é acompanhar o que entrou, o que foi gasto e o que ainda falta pagar, preservando o histórico de cada mês.

## Funcionalidades

- Cadastro e login com e-mail e senha pelo Supabase Auth.
- Onboarding com nome, salário padrão e primeiro ciclo mensal.
- Navegação entre meses e anos, com edição pontual do salário de cada mês.
- Receitas e despesas avulsas, recorrentes ou com quantidade/data final de repetição.
- Edição e exclusão de uma ocorrência ou dela e das próximas da mesma série.
- Vencimento opcional para despesas, destacado em vermelho.
- Categorias reutilizáveis, seleção pesquisável e criação por texto livre.
- Gestão de categorias com filtros **Apenas ativas**, **Apenas inativas** e **Todas**; abertura padrão em ativas.
- Dashboard anual com receitas, despesas, saldo e distribuição por categoria.
- Relatórios por intervalo de datas e seleção de múltiplas categorias.
- Sininho com alertas e marcação de leitura; estrutura de envio por e-mail com preferências e controle de duplicidade.

> **Estado atual:** suporta Cloudflare Workers/D1 e também Node.js/PostgreSQL no Render. Consulte [o guia do Render](RENDER.md) para configurar o serviço e migrar os dados. O envio ao GitHub não transfere os dados automaticamente. E-mail e agendamento precisam de configuração externa antes de operar em produção.

## Arquitetura

| Camada | Tecnologia / responsabilidade |
| --- | --- |
| Interface | React 19, Tailwind CSS, Base UI/shadcn e Recharts |
| Aplicação e APIs | Vinext sobre Vite, executando no ambiente Cloudflare Workers |
| Autenticação | Supabase Auth; sessão validada no servidor |
| Dados financeiros | Cloudflare D1 (SQLite), com binding `DB` |
| Schema e migrações | Drizzle e SQL versionado em `drizzle/` |
| Notificações | Outbox no D1 e worker de agendamento separado |

**Supabase é usado para autenticação, não como banco financeiro nesta versão.** Não há conexão PostgreSQL por host, porta ou senha implementada.

## Executar localmente

### Pré-requisitos

- Node.js **22.13 ou superior** (os testes usam `node:sqlite`).
- Git e pnpm disponíveis no terminal.
- Projeto Supabase com autenticação por e-mail/senha configurada.
- Configuração do D1 local e aplicação das migrações descritas abaixo.

```sh
git clone https://github.com/LuisFelipeSantos/CenaPlanner.git
cd CenaPlanner
pnpm install --frozen-lockfile
```

Copie `.env.example` para `.env` **somente se o arquivo ainda não existir** e preencha os valores. No PowerShell:

```powershell
if (-not (Test-Path -LiteralPath .env)) {
  Copy-Item -LiteralPath .env.example -Destination .env
}
```

### Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `SUPABASE_URL` | Origem HTTPS do projeto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Chave pública do projeto, usada pelo servidor na autenticação |
| `LOCAL_D1_DATABASE_NAME` | Nome do banco D1 no ambiente local |
| `LOCAL_D1_DATABASE_ID` | UUID da configuração D1 local; preserve o valor em bases existentes |
| `NOTIFICATION_CRON_SECRET` | Segredo exclusivo para autenticar o agendador |
| `NOTIFICATION_GATEWAY_TOKEN` | Token do gateway de e-mail |
| `EMAIL_GATEWAY_URL` | Endpoint HTTPS do gateway de e-mail |
| `SITE_ORIGIN` | Origem HTTPS publicada, acessível ao agendador |

As quatro primeiras são necessárias para o ambiente local. As demais pertencem à ativação de notificações externas. Deixe os recursos externos desativados até configurar e testar o gateway e o agendamento.

Nunca publique o `.env`. Na hospedagem, configure variáveis e segredos no ambiente do servidor. Alterar essas variáveis não migra os dados entre bancos.

### Banco de dados

O schema está em [`db/schema.ts`](db/schema.ts), e as migrações SQL estão em [`drizzle/`](drizzle/). A configuração local do binding `DB` vem de [`vite.config.ts`](vite.config.ts).

- Em um banco novo, aplique as migrações `0000` a `0007`, em ordem, pelo fluxo D1/Wrangler com a configuração do banco de destino.
- Em um banco existente, faça backup e confira quais migrações já foram aplicadas. **Não execute novamente arquivos já aplicados nem altere migrações antigas.**
- O projeto não fornece um comando `db:migrate` pronto: a configuração de destino precisa ser conferida antes de executar migrações. `db:generate` apenas gera arquivos, não aplica tabelas.
- Para produção, use o fluxo da hospedagem e seu banco de produção. O banco local não acompanha o código enviado ao GitHub.

Depois de configurar o ambiente e preparar o banco:

```sh
pnpm dev
```

Abra o endereço informado pelo terminal (normalmente `http://localhost:3000`). Cadastre uma conta, confirme o e-mail se essa opção estiver habilitada no Supabase e conclua a preparação da conta.

## Regras financeiras importantes

### Salário e histórico

Ao alterar o salário padrão nas configurações, **o mês atual e os anteriores não mudam**. O novo valor passa a valer a partir do próximo mês, inclusive para previsões salariais futuras já existentes. A atualização é transacional.

Para corrigir um mês específico, navegue até ele e use o editor de salário daquele mês. Reabrir um ciclo não sobrescreve seus valores nem recria lançamentos excluídos.

### Recorrências

- O valor informado é o de cada ocorrência, não um total a dividir.
- Repetições finitas são geradas antecipadamente, com limite de 120 ocorrências; a quantidade inclui a primeira.
- Séries sem fim geram as ocorrências conforme os meses são abertos.
- Cada ocorrência tem valor, data e situação próprios.
- Alterações ou exclusões com alcance futuro começam no mês selecionado, preservando os anteriores.

### Categorias e relatórios

Nomes equivalentes são agrupados ignorando diferenças de maiúsculas/minúsculas e espaços extras. Inativar uma categoria não apaga lançamentos nem altera o histórico. Internamente, o estado de inatividade continua representado pelo campo `archived`.

Os relatórios por período usam a **data do lançamento**, não o vencimento. Totais incluem registros pendentes e ocorrências futuras já cadastradas; não representam exclusivamente dinheiro já pago ou recebido. Consultar um ano não cria automaticamente salários para todos os seus meses.

## Notificações

Os canais são **sininho interno e e-mail**, com alertas D-7, D-3, D-1 e no dia do vencimento para despesas pendentes. Despesas pagas, excluídas ou sem vencimento não devem gerar novos disparos.

O código possui chave de idempotência, controle de tentativas e revalidação antes do envio. Para e-mail funcionar, ainda é necessário configurar um gateway transacional compatível, remetente, segredos e agendador. O gateway também deve deduplicar a chave recebida.

Consulte o [guia de parcelas e notificações](NOTIFICACOES-E-PARCELAS.md) para o contrato do gateway, limites de processamento e cuidados de ativação. O cron versionado **não significa que o serviço esteja instalado ou ativo**.

## Validação

```sh
pnpm test
pnpm run check:repository
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
```

Os testes financeiros usam SQLite isolado e migrações reais, sem escrever na conta do usuário. Cobrem histórico salarial, recorrências, exclusões, notificações, categorias e isolamento de usuários. A verificação de repositório detecta padrões básicos de arquivos privados e credenciais; não substitui revisão humana ou auditoria do histórico Git.

O script `start` usa Wrangler para o ambiente Cloudflare local. No Render, utilize `pnpm build:render` e `pnpm start:render`, conforme [o guia de implantação](RENDER.md).

## Estrutura do projeto

```text
app/
  api/                         Rotas de autenticação, finanças e notificações
  dashboard.tsx                Visões mensais, anuais e relatórios
  finance-service.ts           Regras financeiras e transações
  category-controls.tsx        Seletores e filtros de categorias
  notification-service.ts      Alertas, outbox e tentativas de entrega
  supabase-auth.ts              Sessão e integração com Supabase Auth
components/ui/                 Componentes reutilizáveis
db/                            Schema e acesso ao D1
drizzle/                       Migrações SQL e metadados
workers/                       Agendador de notificações
tests/                         Testes automatizados
scripts/                       Verificações do repositório
public/                        Logos e arquivos públicos
```

## Hospedagem e segurança

A versão Cloudflare utiliza bindings e a integração Sites. A versão Render utiliza o runtime Node.js e PostgreSQL com TLS. Ambos exigem configuração de variáveis e recursos; siga [RENDER.md](RENDER.md) para o Render. Os bancos dos dois ambientes são independentes e não sincronizam automaticamente.

Antes de publicar:

1. Validar build, testes e configuração de autenticação.
2. Preparar o banco de produção com backup e migrações controladas.
3. Configurar segredos fora do Git e verificar acesso por usuário.
4. Testar onboarding, lançamentos, histórico e relatórios em uma conta de teste.
5. Ativar e testar notificações separadamente.
6. Definir backups, monitoramento e processo de recuperação.

Não envie bancos locais, exportações financeiras, tokens ou arquivos `.env` ao repositório. Também não inclua dados reais em screenshots, issues ou logs públicos.

## Contribuir e atualizar

Crie uma branch para a alteração, faça commits pequenos e execute as validações antes de enviar. Não altere migrações aplicadas: gere uma nova quando o schema precisar mudar. Mudanças no código não publicam o site automaticamente enquanto a integração de deploy não estiver configurada.

## Documentação complementar

- [Ciclos mensais, salário e modelagem](FINANCEIRO.md)
- [Parcelas, notificações e relatórios](NOTIFICACOES-E-PARCELAS.md)
- [Histórico da refatoração de ambiente, categorias e salário](REFATORACOES-CENAPLANNER.md)

Esses documentos também registram entregas anteriores; contagens de testes e observações sobre publicação neles se referem à data de cada entrega. Para o comportamento atual, consulte este README, o código e os testes.
