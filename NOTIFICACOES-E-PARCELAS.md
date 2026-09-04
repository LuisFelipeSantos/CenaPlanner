# Parcelas e notificações — entrega local

## Alterações implementadas

- Logo com fundo verde aplicada no login e dashboard. A versão com o lobo menor (`logo-lobo-menor.jpg`, original ql1tpn) é a preferencial; a versão maior (`logo-lobo-maior.jpg`, original 64eiit) fica disponível como alternativa. Os arquivos originais foram preservados sem alteração do desenho.
- Label `Valor`; repetição por quantidade usa `Repetir quantas vezes?`.
- `repeat=count` aceita `repetitionCount` de 1 a 120, incluindo a primeira ocorrência. Todas são persistidas imediatamente, com datas mensais, série comum e valores/situações independentes. Não é necessário abrir os meses futuros.
- `repeat=until` também materializa imediatamente as ocorrências até a data final, limitado a 120. `repeat=forever` continua criando ocorrências sob demanda: uma série infinita não pode ser materializada integralmente.
- A materialização de parcelas futuras **não abre ciclos salariais futuros**: o snapshot do salário continua sendo feito apenas na abertura explícita do mês.
- Edição de recorrência pede `single` ou `future` na interface. O segundo modo atualiza as ocorrências não excluídas a partir da competência escolhida e grava uma regra de valor efetiva nessa competência. Ocorrências anteriores, inclusive ainda não materializadas de séries legadas, mantêm o valor anterior.
- Vencimento é `dueDate` separado de `date`. Aceita null para despesas; receitas não aceitam vencimento. Nas repetições, preserva dia e deslocamento mensal do vencimento. Dias inexistentes são ajustados ao último dia do mês.

## Schema

Migrações 0006 e 0007. A nova 0007 adiciona chave normalizada e arquivamento de categorias e remove os campos de telefone/canal descontinuado. Migrações históricas permanecem intactas.

| Tabela | Alterações |
| --- | --- |
| `ledger_entries` | `due_date` nullable; índice por vencimento e situação. Datas legadas permanecem sem vencimento: não se inventou essa informação. |
| `recurrence_templates` | `repetition_count`, `notification_due_day`, `due_month_offset`. O antigo `due_day` continua representando o dia da data contábil para compatibilidade. |
| `recurrence_values` | Valor por série e competência efetiva; chave única usuário+série+competência. |
| `notification_preferences` | E-mail da sessão verificada, in-app ligado por padrão e e-mail desligado por padrão. Só existem os dois canais. |
| `notification_jobs` | Notificação/outbox por despesa+vencimento+antecedência+canal; leitura, tentativas, próximo retry, lease e estado de entrega. |

### Exemplos de API

```json
{
  "name": "Seguro", "category": "Carro", "amount": 150,
  "type": "expense", "status": "pendente",
  "date": "2026-12-01", "dueDate": "2026-12-15",
  "repeat": "count", "repetitionCount": 6,
  "requestId": "uuid-estavel-do-formulario"
}
```

POST `/api/entries` cria dezembro até maio imediatamente. `amount` é o valor de cada parcela, não um valor total a dividir.

PATCH `/api/entries` recebe `{id, amount, scope:"single"|"future"}`. Exclusões continuam usando DELETE com os mesmos escopos e tombstones, sem ressuscitar registros.

## Sininho e preferências

- GET `/api/notifications`: lista até 100 alertas e contagem total de não lidos, restritos à sessão.
- POST `/api/notifications`: verifica as despesas do próprio usuário; não envia mensagens externas. O frontend verifica ao entrar e a cada minuto.
- PATCH `/api/notifications`: `{id}` marca a notificação do próprio usuário como lida.
- GET/POST `/api/notifications/preferences`: consulta/altera `{inApp,emailEnabled}`. O e-mail não é aceito do formulário; vem de `getAppUser()`.
- Alertas D-7, D-3, D-1 e D0 respeitam a data em America/Sao_Paulo e as preferências. Pagas/excluídas/sem vencimento não entram. Preferências desligadas ocultam o sininho. Jobs externos revalidam preferências, situação e vencimento imediatamente antes do despacho.
- A chave única evita duplicação em releituras. Entregas externas usam lease de 2 minutos, timeout de 15 segundos, até 5 tentativas e backoff. Sem provedor, estado `blocked`, nunca `sent`. Alertas externos vencidos para sua janela são cancelados, evitando lembretes atrasados.

## Background e envios externos: base pronta, não ativada

O processador está em `app/notification-service.ts`. O endpoint administrativo é POST `/api/internal/notifications`, protegido por segredo exclusivo, sem utilizar sessão de usuário. Não responde com informações financeiras. Sem segredo configurado retorna 503; credencial incorreta retorna 401.

O worker `workers/notification-scheduler.ts` implementa `scheduled()`, com configuração em `workers/wrangler.notifications.jsonc`: varredura diária às 09h de São Paulo (12h UTC) e nova tentativa de entrega a cada 5 minutos, sem repetir a varredura diária. Ele pagina a varredura e drena a outbox com limites de execução. A implementação segue o contrato oficial de [Scheduled handlers](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/) e usa [batch do D1](https://developers.cloudflare.com/d1/worker-api/d1-database/) para operações transacionais.

A configuração do cron está no projeto, mas não foi instalada em produção. Nenhum serviço externo foi contratado nem mensagens reais enviadas nesta entrega. Para ativar:

1. Escolher/configurar o provedor transacional de e-mail, com remetente verificado.
2. Implementar gateways HTTPS server-to-server conforme `app/notification-delivery.ts`. O contrato recebe `{channel,to,message,idempotencyKey}` com `Idempotency-Key` e Bearer token. Gateways **devem deduplicar essa chave**: sem isso a entrega é at-least-once, não exatamente uma vez. HTTP 2xx significa aceite do gateway, não prova de leitura pelo destinatário.
3. Configurar secrets no servidor: `NOTIFICATION_CRON_SECRET`, `NOTIFICATION_GATEWAY_TOKEN`; URL `EMAIL_GATEWAY_URL`. Nunca colocar estes segredos em componentes do navegador.
4. Publicar a migração/código após validação. Configurar `SITE_ORIGIN` e o segredo no scheduler e instalar o Cron Trigger separadamente.
5. Verificar que o scheduler consegue acessar o endpoint pelo caminho autenticado suportado pela hospedagem. O acesso privado atual do Sites pode barrar chamadas externas antes do handler; **não tornar o site público nem remover proteções para contornar isso**. Nesse caso, integrar o agendador por binding/worker autorizado da plataforma.
6. Validar envios com destinatários de teste autorizados e observar jobs `failed`/`blocked`/tentativas esgotadas. Para volumes acima do limite de 50 páginas por execução, persistir cursor em fila e monitorar atrasos.

As preferências externas podem ser salvas, mas a interface informa explicitamente que o envio depende dessa configuração. A base não equivale a e-mail operacional.

## Testes

`node --experimental-strip-types --test tests/*.test.mjs`

Validação desta entrega: 50 testes aprovados, TypeScript sem erros, lint dos módulos alterados aprovado e build concluído. No navegador local foram verificados combobox (seleção e texto livre), filtros múltiplos, relatório por datas, gráficos anuais, vencimento vermelho e preferências com os dois canais. Nenhum envio real de e-mail foi realizado.

Testes usam SQLite isolado com migrações reais e remetentes simulados. Cobrem geração antecipada, mudança de ano, cascata temporal, vencimento opcional, D-7/D-3/D-1/D0, leitura e isolamento, opt-out, categorias normalizadas, bloqueio sem provedor, cancelamento pós-pagamento, deduplicação, retry e fuso. Não foram criadas despesas de teste na conta real.


## Categorias e relatórios

- GET /api/categories retorna catálogo normalizado (nome, key e archived), incluindo categorias históricas. POST recebe {name, archived?: boolean} para cadastrar, reativar ou arquivar.
- Categorias são compartilhadas entre receitas e despesas do mesmo usuário. A chave usa NFKC, trim, espaços consecutivos reduzidos a um e minúsculas pt-BR. Nomes equivalentes aparecem uma vez na seleção e nos gráficos.
- A coluna categories.normalized_key é única por usuário para novos registros; registros antigos continuam intactos. A leitura agrega equivalências antigas sem backfill destrutivo. Arquivar não altera lançamentos nem remove categorias dos filtros históricos.
- Lançamentos e templates mantêm o nome como snapshot. O formulário aceita sugestão existente ou texto novo. A edição de categoria/vencimento afeta somente a ocorrência selecionada; o diálogo de alcance controla o valor.
- GET /api/entries aceita from/to inclusivos pela data contábil entry_date e parâmetros category repetidos (união das categorias selecionadas). O período e usuário são filtrados no banco; a comparação normalizada é feita no serviço para abranger registros antigos sem modificar o histórico.
- Dashboard anual: 12 meses, receitas, despesas, saldo e distribuição por categoria. Relatório por período: mesmos totais por categoria e listagem completa. Totais incluem pendentes e parcelas já registradas; não são equivalentes apenas ao fluxo já pago/recebido. Valores somados em centavos inteiros.
- Todos os vencimentos exibidos em lançamentos e sininho ficam vermelhos, inclusive datas futuras.
- A configuração dos gatilhos segue [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/). Os gatilhos usam UTC; o serviço avalia as datas em America/Sao_Paulo.

## Validação e ativação

Rodar os testes em SQLite isolado, verificar TypeScript e gerar build antes de publicar. Aplicar a migração 0007 apenas uma vez por banco. As colunas removidas só podem ser recuperadas de backup anterior; nenhum lançamento financeiro é removido.
Para rollback da interface, não reaplicar uma versão que ainda exige as colunas removidas: usar correção progressiva ou restaurar backup com planejamento.
Monitorar jobs failed/blocked e exceções do worker. Não ativar o scheduler antes de verificar segredo, gateway idempotente e alcance autenticado do endpoint.
