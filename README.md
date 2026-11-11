# Minhas Finanças

Aplicativo web multiusuário para registrar receitas, despesas, orçamentos, planos recorrentes ou parcelados e uma carteira de vale-refeição. Cada conta começa vazia e só acessa os próprios dados.

## Funcionalidades

- dashboard responsivo com totais, gráficos, filtros e lançamento rápido;
- receitas, despesas, categorias personalizadas e orçamentos mensais;
- planos recorrentes e parcelados com confirmação idempotente de pagamentos;
- histórico de alterações e exclusão lógica;
- carteira de vale-refeição, créditos, gastos e ajustes;
- exportação e restauração de backup JSON, além de importação CSV/XLSX;
- autenticação por e-mail/senha, magic link e recuperação de senha;
- PWA instalável com suporte offline para os recursos estáticos.

## Stack e arquitetura

- Next.js com App Router e TypeScript;
- Supabase Auth e Supabase Postgres;
- `@supabase/ssr` para sessões por cookies;
- PostgREST com a sessão do usuário — nenhuma chave `service_role` é usada;
- Row Level Security (RLS) em todas as tabelas financeiras;
- Tailwind CSS, componentes shadcn e Recharts;
- implantação compatível com Vercel.

O navegador conversa com rotas em `app/api`. Cada rota valida a sessão com `supabase.auth.getUser()`, deriva `user.id` no servidor e filtra as consultas pelo proprietário. O banco repete essa proteção com RLS. IDs fornecidos pelo navegador nunca definem o proprietário.

## Pré-requisitos

- Node.js 22.13 ou mais recente;
- npm;
- uma conta e um projeto Supabase.

## Criar e configurar o Supabase

1. Crie um projeto no painel do Supabase.
2. Abra **SQL Editor**, crie uma consulta e execute, em ordem, o conteúdo de cada arquivo em `supabase/migrations`.
   Como alternativa, com a Supabase CLI autenticada: `supabase link --project-ref SEU_PROJECT_REF` e `supabase db push`.
3. Em **Project Settings > API**, copie a URL do projeto e a chave publicável (`publishable`; em projetos antigos ela pode aparecer como `anon`).
4. Em **Authentication > URL Configuration**, defina `http://localhost:3000` como Site URL durante o desenvolvimento e inclua `http://localhost:3000/auth/callback` nos Redirect URLs.
5. Mantenha o provedor **Email** habilitado. A confirmação de e-mail pode permanecer ativa. Login social é opcional e pode ser adicionado depois no painel, sem alterar o modelo de dados.

Copie o modelo de ambiente:

```bash
cp .env.example .env.local
```

No PowerShell, use `Copy-Item .env.example .env.local`. Preencha apenas:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICAVEL
```

A chave publicável pode ficar no cliente porque o acesso é limitado por RLS. Nunca coloque a chave `service_role` no frontend ou neste projeto; ela não é necessária para o aplicativo.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000/signup`, crie a primeira conta e confirme o e-mail, se solicitado. A conta nova não recebe dados demonstrativos nem lançamentos automáticos.

## Qualidade

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Os testes locais cobrem regras financeiras, validações, idempotência do mapeamento de importação e as garantias estáticas de autenticação/RLS. Antes de produção, também é recomendável executar testes de integração com duas contas em um projeto Supabase de teste.

## RLS e isolamento

A migration ativa RLS em `transactions`, `transaction_versions`, `plans`, `budgets`, `category_definitions`, `benefit_wallets` e `benefit_movements`. Cada tabela possui políticas explícitas de `SELECT`, `INSERT`, `UPDATE` e `DELETE`; a condição base é `auth.uid() = user_id`, com `WITH CHECK` nas gravações. Chaves estrangeiras compostas garantem que planos, transações, carteiras e movimentações relacionados pertençam à mesma conta.

Usuários anônimos não recebem privilégios nas tabelas. A aplicação usa a chave publicável e a sessão do usuário, portanto o RLS continua valendo em todas as operações.

## Backup e importação

Em **Configurações**, use **Baixar backup completo JSON**. A exportação usa o formato `minhas-financas-backup-v2`, contém somente os dados da conta ativa e não inclui tokens, senha, e-mail ou `user_id`.

Para migrar um backup antigo:

1. entre na conta Supabase que será a proprietária dos dados;
2. escolha **Restaurar backup JSON**;
3. revise a quantidade mostrada na prévia e confirme;
4. aguarde a recarga do dashboard.

O importador aceita `minhas-financas-backup-v1` e v2, ignora qualquer `userId` antigo, gera IDs determinísticos por conta e remapeia relações. Reenviar o mesmo arquivo é idempotente. Não coloque backups reais dentro do repositório.

## Deploy na Vercel

1. publique uma cópia sanitizada em um repositório GitHub novo;
2. importe o repositório na Vercel como projeto Next.js;
3. cadastre `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` nos ambientes desejados;
4. no Supabase, troque a Site URL pela URL definitiva e adicione `https://SEU_DOMINIO/auth/callback` aos Redirect URLs;
5. execute `npm run build` localmente antes de promover a versão.

Não é necessário configurar adaptador Cloudflare, Worker, D1, Vinext ou chave privada do Supabase.

## Nunca versionar

- `.env`, `.env.local` ou qualquer credencial;
- chaves privadas, tokens ou `service_role`;
- backups, OFX, QIF ou planilhas financeiras pessoais;
- exports do banco ou dados de autenticação;
- artefatos `.next`, cobertura e dependências.

O `.gitignore` já cobre esses padrões, mas revise `git status` e faça uma busca por segredos antes de cada publicação.
