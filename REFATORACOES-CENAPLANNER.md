# Refatorações — ambiente, categorias e salários

## Estado do repositório

O GitHub LuisFelipeSantos/CenaPlanner foi inspecionado: main contém somente README.md, commit 6d6c257208e4286b2ffe4d2afb1a615a5e67674e. O código real permanece no projeto local. Nenhum push ou publicação foi realizado nesta entrega.

Raiz dos caminhos abaixo: C:/Users/luisa/OneDrive/Documentos/projeto controle financeiro/

## Arquivos completos alterados/criados

| Caminho relativo à raiz | Alteração |
| --- | --- |
| .env | Renomeado de .env.local; mantém credenciais existentes e identificadores D1 locais. Privado, não versionar. |
| .env.example | Chaves vazias, instruções de autenticação, D1 local e envio opcional. |
| .gitignore | Exclui ambientes, dependências, logs, bancos locais, builds e ferramentas pessoais. |
| vite.config.ts | Carrega identificadores locais por loadEnv; preserva bindings do Sites e estado D1. |
| app/server-config.ts | Validação centralizada da origem HTTPS e chave de autenticação. |
| app/supabase-auth.ts | Usa configuração validada e Headers corretamente. |
| app/category-controls.tsx | Modos Apenas ativas (padrão), Apenas arquivadas e Todas dentro dos seletores; status visual. |
| app/category-utils.ts | Filtro de visibilidade puro e tipado. |
| app/dashboard.tsx | Botão submit explícito, loading, confirmação de cadastro, limpeza após sucesso e descrição salarial atualizada. |
| app/finance-service.ts | Propagação salarial transacional a partir do mês seguinte. |
| tests/config.test.mjs | Configuração segura e exemplo sem valores. |
| tests/categories-form.test.mjs | Regressão de submit explícito. |
| tests/reports.test.mjs | Visibilidade das categorias. |
| tests/finance.test.mjs | Futuro versus histórico, virada de ano, fuso, exclusões, bônus, usuários e rollback. |
| scripts/check-repository.mjs | Verificação básica de arquivos proibidos e padrões de credenciais sem imprimir valores. Não substitui auditoria de histórico. |
| package.json | Comandos test e check:repository. |
| FINANCEIRO.md | Documentação da regra salarial vigente. |
| REFATORACOES-CENAPLANNER.md | Este guia. |

Não há nova dependência nem nova migração de schema nesta refatoração. O banco financeiro é D1 (binding DB); Supabase é usado para autenticação. Não existe conexão PostgreSQL de host/porta/senha para migrar ao .env. Os metadados .openai/hosting.json continuam no formato exigido pela hospedagem: não são credenciais. Em produção, usar segredos/variáveis da hospedagem; nunca distribuir o .env.

## Categorias

A causa do botão era o tipo padrão button do componente Base UI, que não disparava onSubmit. Agora type=submit chama a API autenticada, bloqueia enquanto salva, limpa o formulário somente no sucesso e exibe a confirmação dentro do modal.

O modo de visibilidade filtra as opções apresentadas, não apaga seleções já feitas nem altera o histórico. Categorias arquivadas mostram identificação visual. O modo Todas permite localizar categorias antigas para relatórios ou novos lançamentos.

## Salários

O limite temporal vem do relógio do servidor em America/Sao_Paulo, não do mês selecionado na interface. Alterar o padrão em dezembro começa em janeiro do ano seguinte.

Uma única transação D1 remove padrões exclusivamente futuros substituídos, salva a nova vigência, atualiza lançamentos source_key=salary e snapshots dos ciclos futuros. O mês atual e o passado permanecem intactos. Tombstones não são removidos. Valores manuais futuros são sobrescritos quando o padrão muda, conforme solicitado; bônus e outras receitas não são salários e ficam intactos. Falha em qualquer etapa reverte toda a transação.

## Instalação e validação

Requer Node >=22.13 e Git no PATH. Em um checkout novo:

```powershell
npm ci
# Apenas se .env ainda não existir:
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
# Preencha .env com as configurações reais. Nunca compartilhe o arquivo.
npm test
npm run check:repository
npx tsc --noEmit
npm run build
npm run dev
```

O projeto atual já tem dependências e .env configurados. Não sobrescreva o .env nem mude o identificador do banco local existente. Não é necessário instalar dotenv: o ambiente usa Vite/Cloudflare.

## Commits recomendados

O checkout local contém também entregas anteriores ainda não commitadas. Não use git add . indiscriminadamente, não substitua origin (hospedagem) e não force push sobre main do GitHub. Primeiro é necessário importar a base limpa para o CenaPlanner preservando seu README e inspecionar tudo que será público. Não envie o histórico de hospedagem sem auditoria de segredos.

Após a base estar versionada, use commits por conjunto funcional; quando um arquivo compartilhar alterações, selecione os hunks com git add -p:

```powershell
git switch -c codex/ambiente-categorias-salario

git add .gitignore .env.example vite.config.ts app/server-config.ts app/supabase-auth.ts scripts/check-repository.mjs package.json tests/config.test.mjs
git diff --cached --check
git diff --cached
git commit -m "chore(security): isolate environment configuration"

git add app/finance-service.ts tests/finance.test.mjs FINANCEIRO.md
git diff --cached --check
git commit -m "fix(finance): propagate salary only to future months"

git add app/category-controls.tsx app/category-utils.ts app/dashboard.tsx tests/categories-form.test.mjs tests/reports.test.mjs REFATORACOES-CENAPLANNER.md
git diff --cached --check
git commit -m "fix(categories): enable registration and status filters"
```

Antes de cada commit, validar os testes aplicáveis. Antes de enviar, executar novamente a verificação de repositório e revisar o diff e o histórico. Estes comandos são recomendações; não foram executados.

Validação local: 58 testes aprovados, TypeScript e lint dos arquivos alterados sem erros, build concluído. No navegador, o cadastro confirmou sucesso sem duplicar Moradia; os três modos exibiram as categorias corretas com status visual. Nenhum salário real foi editado.

## Limites de produção

Código das regras solicitadas implementado; ativação de e-mail/cron e publicação continuam pendentes das configurações externas documentadas em NOTIFICACOES-E-PARCELAS.md. Nenhuma credencial foi exposta e nenhum salário real foi alterado para testar.
