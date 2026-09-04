# Ciclos mensais, onboarding e recorrências

Atualização posterior: consulte `NOTIFICACOES-E-PARCELAS.md` para geração antecipada por quantidade/data final, edição em cascata e notificações. Essas regras substituem a geração exclusivamente sob demanda descrita na entrega inicial abaixo.

Implementação local. As alterações desta entrega não foram publicadas.

## Modelagem implementada

Autenticação continua no **Supabase Auth**. Os dados financeiros continuam no **D1 do Sites**: não foram criadas tabelas financeiras no Supabase. `user_id` é o identificador verificado pelo servidor, nunca recebido do formulário. Senhas não são armazenadas nas tabelas financeiras.

| Tabela | Papel e chaves |
| --- | --- |
| `financial_users` | Perfil, salário padrão em centavos, primeiro mês, data de conclusão do onboarding, moeda BRL e fuso America/Sao_Paulo. PK: user_id. |
| `salary_defaults` | Histórico do salário padrão por competência efetiva. Único: usuário + mês de vigência. Evita usar salário novo ao abrir um mês passado. |
| `monthly_cycles` | Um ciclo por usuário/mês, com o salário inicial fotografado no momento da abertura. Único: usuário + competência YYYY-MM. |
| `categories` | Catálogo por usuário. Único: usuário + nome. |
| `recurrence_templates` | Modelo de receita/despesa, valor, categoria, início, dia, intervalo em meses, data final inclusiva e corte das repetições futuras. |
| `ledger_entries` | Instâncias financeiras independentes: nome/categoria/valor/situação/data copiados, referência opcional à série e marca de exclusão. Único: usuário + mês + source_key. |

O salário aparece como uma receita com `source_key=salary`. O valor editável e usado nos totais é o lançamento de salário daquele ciclo. A alteração global atualiza as previsões e snapshots exclusivamente futuros; mês atual e passado ficam intactos. O histórico e os totais nunca consultam o salário global atual para recalcular meses antigos.

Os valores novos usam inteiros em centavos. Nome/categoria/valor de cada ocorrência são cópias, não joins dinâmicos com configurações. As relações com identidade externa e os escopos de usuário são aplicados pelo serviço. As tabelas legadas `profiles` e `entries` foram preservadas.

## Regras e decisões de comportamento

- Concluir cadastro grava perfil, padrões, categorias e primeiro ciclo/salário em um `D1.batch` transacional. A interface usa botão `type=submit`, bloqueio durante envio, erro visível e só fecha o onboarding após resposta de sucesso. Como o onboarding é um modal da rota `/`, a transição ao dashboard ocorre nessa mesma rota, sem uma navegação desnecessária.
- Quando o salário padrão muda nas Configurações, uma transação atualiza padrões, snapshots e lançamentos salariais existentes a partir do próximo mês. O mês atual e todos os anteriores ficam intactos, abertos ou ainda não criados. Não ressuscita salários excluídos nem altera bônus/receitas comuns. Salvar o mesmo salário sem mudança não sobrescreve edições manuais futuras. Para alterações pontuais existe “Salário deste mês”.
- A abertura de mês é explícita (`POST /api/months`) e idempotente. Reabrir não sobrescreve valores, situações ou exclusões. Uma consulta anual ou por datas não cria ciclos nem projeta salários automaticamente.
- Ao abrir um mês passado ainda inexistente, aplica-se o padrão vigente naquela competência. Se não há padrão conhecido anterior ao mês, o salário inicial é zero; o usuário pode preenchê-lo manualmente. Nunca se inventa um salário histórico usando o valor atual.
- Recorrência funciona igualmente para despesas e receitas: pontual, sem fim, ou até data final, com intervalo de 1 a 120 meses. O valor informado é **por ocorrência/parcela**, não o total dividido.
- A situação inicial escolhida vale para a primeira ocorrência; as seguintes começam pendentes. Dia 31 em fevereiro vira 28/29, sem deslocar ocorrências para outro mês.
- Uma nova série preenche ciclos posteriores já abertos e gera as demais ocorrências quando esses meses forem abertos. Mudanças pontuais de valor e pagamento nunca modificam o template nem outras ocorrências.
- Exclusão pontual é lógica (`deleted_at`): a chave única continua existindo e impede a recriação ao abrir o mês novamente.
- Exclusão “este mês e futuras” grava `stopped_from`, exclui logicamente as instâncias a partir do mês selecionado e impede gerações posteriores. Meses anteriores permanecem intactos. Não há tela de restauração; o salário pode ser reposto pelo editor explícito do mês.
- Reenvios de criação usam `requestId` estável para evitar duplicação por clique/retry. Atualizações e exclusões são sempre limitadas ao usuário autenticado.

## Endpoints

Todos exigem sessão autenticada. Respostas não são armazenadas em cache. Escritas rejeitam Origin externo. Valores e datas são validados no servidor; falhas não expõem SQL, dados financeiros ou credenciais.

| Método / rota | Dados / resultado |
| --- | --- |
| GET `/api/profile` | Perfil financeiro ou null para onboarding. |
| POST `/api/profile` | `{name, monthlySalary, initialPeriod?}`. Onboarding ou atualização do padrão global. Retorna perfil persistido. |
| POST `/api/months` | `{period:"2026-09"}`. Abre/recupera ciclo e materializa recorrências idempotentemente. |
| PATCH `/api/months` | `{period:"2026-09", amount:2500}`. Altera/restaura apenas o salário desse mês. |
| GET `/api/entries?year=2026&month=9` | Instâncias existentes do mês. Sem month, consulta o ano. |
| GET `/api/entries?from=2026-01-01&to=2026-12-31&category=Moradia` | Intervalo inclusivo e categoria exata opcional. |
| POST `/api/entries` | Exemplo abaixo. |
| PATCH `/api/entries` | `{id, amount}` para valor pontual ou `{id, status}` para situação. |
| DELETE `/api/entries` | `{id, scope:"single"}` ou `{id, scope:"future"}`. |

```json
{
  "requestId": "uuid-gerado-no-cliente",
  "name": "Curso",
  "category": "Educação",
  "amount": 150,
  "type": "expense",
  "status": "pendente",
  "date": "2026-09-15",
  "repeat": "until",
  "intervalMonths": 1,
  "endDate": "2027-02-15"
}
```

`repeat`: once / forever / until. `type`: expense / income. `status`: pendente / pago / vencido. Códigos: 400 validação, 401 sessão, 403 origem, 404 registro alheio/inexistente, 409 onboarding pendente, 503 indisponibilidade.

## Migração e preservação

Schema: `db/schema.ts`. Migração aditiva: `drizzle/0005_sad_luke_cage.sql` e metadados correspondentes. Aplicada **somente ao D1 local** nesta entrega. Nenhuma tabela antiga foi apagada. Não há DDL em handlers de requisição.

Perfis legados são importados uma única vez por usuário. Cada lançamento antigo recebe chave `legacy:<id>`; o importador não inventa vínculos de série, porque o antigo campo booleano `recurring` não registrava sua identidade. Assim, os antigos lançamentos recorrentes importados são instâncias avulsas; novas séries devem ser cadastradas explicitamente.

Limitação histórica: o modelo anterior não armazenava salários mensais. Na importação, os meses que já tinham lançamentos recebem o salário legado disponível como baseline. Não é possível recuperar salários antigos diferentes que nunca foram gravados. Esses valores podem ser corrigidos manualmente em cada mês.

Antes de publicar, preserve backup e aplique a nova migração pelo fluxo normal do Sites junto ao código validado. As migrações anteriores e seus metadados são imutáveis. Não reexecute a migração nova num banco em que ela já tenha sido aplicada manualmente.

## Validação

```sh
node --experimental-strip-types --test tests/auth.test.mjs tests/finance.test.mjs
pnpm exec tsc --noEmit
pnpm run build
```

Os testes financeiros executam o serviço real e todas as migrações em SQLite isolado, usando um adaptador para a interface D1 (incluindo transações). Cobrem onboarding, rollback, snapshots globais/pontuais, reabertura idempotente, virada de ano, meses curtos, receitas/despesas recorrentes, intervalo e fim inclusivo, exclusões e não regeneração, isolamento entre usuários, validação e importação legada. Nenhum teste insere despesas fictícias na conta real do usuário.

Para validação manual: concluir onboarding; cadastrar uma receita e uma despesa; abrir outro mês; alterar padrão e conferir o mês anterior; editar seu salário pontualmente; excluir uma ocorrência e reabrir o mês; excluir a série a partir de um mês e verificar passado/futuro. A entrega local não equivale a uma publicação.
