# Minhas Finanças

O **Minhas Finanças** é uma aplicação web para registrar e acompanhar receitas, despesas, orçamentos, planos de pagamento e benefícios de alimentação. O projeto é multiusuário: cada conta começa vazia e acessa somente os próprios dados.

Aplicação: [minhas-financas-pink.vercel.app](https://minhas-financas-pink.vercel.app)

Para usar a aplicação publicada, cada pessoa deve entrar ou criar sua própria conta. Não compartilhe credenciais nem importe dados em uma conta que não seja sua.

## Funcionalidades

- dashboard responsivo com totais, gráficos, filtros e busca;
- cadastro, edição e exclusão lógica de receitas e despesas;
- categorias personalizadas, com renomeação e fusão de variações;
- orçamentos mensais por categoria;
- planos recorrentes e compras parceladas, com confirmação manual de pagamentos;
- histórico de alterações dos lançamentos;
- carteira de vale-refeição com créditos, despesas e ajustes;
- exportação do histórico em CSV;
- importação de lançamentos por CSV ou XLSX, com prévia e detecção de duplicidades;
- backup completo em JSON e restauração por mesclagem;
- autenticação por e-mail e senha, magic link e recuperação de senha;
- PWA instalável com página offline e cache restrito a recursos estáticos;
- tema escuro por padrão, com preferência persistida no navegador.

## Stack

- Next.js 16, App Router e React 19;
- TypeScript;
- Supabase Auth e Supabase Postgres;
- `@supabase/ssr` para sessões baseadas em cookies;
- Tailwind CSS, componentes shadcn e Recharts;
- testes com o test runner nativo do Node.js;
- ESLint e TypeScript para análise estática;
- GitHub Actions para integração contínua;
- Vercel para hospedagem.

## Arquitetura

O navegador renderiza a interface Next.js e chama as rotas em `app/api`. Cada rota protegida valida a sessão com o Supabase Auth, obtém o identificador do usuário autenticado no servidor e executa as consultas com essa sessão. O Postgres aplica uma segunda camada de isolamento por meio de Row Level Security (RLS).

As migrations versionadas ficam em `supabase/migrations`. A aplicação não depende de um servidor separado, de uma chave administrativa do Supabase nem de acesso direto e privilegiado ao banco.

## Modelo de segurança

- **Supabase Auth:** cadastro, login, magic link, recuperação de senha e sessão por cookies.
- **RLS:** todas as tabelas financeiras têm políticas explícitas para leitura e gravação.
- **Isolamento por `user_id`:** as APIs derivam o proprietário da sessão; um identificador enviado pelo cliente não define a propriedade do registro.
- **Sem `service_role`:** a aplicação usa somente a chave publicável e nunca requer a chave `service_role`.
- **APIs autenticadas:** as rotas financeiras recusam requisições sem uma sessão válida.
- **Defesa em profundidade:** há validação de origem para operações mutáveis, limites de payload, cabeçalhos de segurança e respostas financeiras sem cache.

Essas medidas reduzem riscos, mas não constituem garantia absoluta de segurança. Consulte [SECURITY.md](SECURITY.md) para relatar vulnerabilidades.

## Requisitos locais

- Node.js 22.13 ou mais recente;
- npm;
- um projeto Supabase destinado a desenvolvimento ou testes;
- Git, caso queira contribuir.

Não use o banco de produção para desenvolvimento local.

## Instalação

```bash
git clone https://github.com/GustavoHenriqueFerreira/minhas-financas.git
cd minhas-financas
npm ci
```

Crie o arquivo local de ambiente a partir do modelo:

```bash
cp .env.example .env.local
```

No PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Preencha apenas estas variáveis com os dados do seu projeto Supabase de desenvolvimento:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Não coloque chaves privadas, `service_role`, credenciais de produção ou dados financeiros no arquivo versionado `.env.example`.

## Aplicação das migrations

Execute, na ordem dos nomes dos arquivos, as migrations presentes em `supabase/migrations` usando o SQL Editor de um projeto Supabase de desenvolvimento.

Se você já utiliza a Supabase CLI, também pode vincular seu projeto de desenvolvimento e aplicar as migrations versionadas:

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

Depois, configure no Supabase Auth:

- `http://localhost:3000` como Site URL para desenvolvimento;
- `http://localhost:3000/auth/callback` como Redirect URL;
- o provedor de e-mail necessário para o fluxo que pretende testar.

## Comandos

```bash
npm run dev        # servidor de desenvolvimento
npm test           # testes automatizados
npm run lint       # análise do ESLint
npm run typecheck  # verificação do TypeScript
npm run build      # build de produção
npm start          # executa o build de produção
```

Antes de abrir um Pull Request, execute obrigatoriamente `npm test`, `npm run lint`, `npm run typecheck` e `npm run build`.

## Backup, restauração e importação

O backup completo pode ser baixado em **Configurações** no formato `minhas-financas-backup-v2`. O arquivo contém os registros financeiros da conta ativa, mas não inclui senha, tokens, e-mail ou `user_id`.

A restauração aceita backups v1 e v2. Ela:

- associa os registros à conta autenticada;
- ignora qualquer proprietário presente no arquivo de origem;
- mescla itens ausentes sem substituir toda a conta;
- usa identificadores determinísticos para permitir o reenvio sem duplicar registros já restaurados;
- pode ser retomada com o mesmo arquivo se uma execução for interrompida.

Arquivos de backup contêm informações financeiras. Guarde-os em local seguro e nunca os adicione ao repositório, a Issues ou a Pull Requests.

A importação CSV/XLSX é voltada a lançamentos e exige colunas reconhecíveis para data, tipo, valor, descrição e categoria. A interface mostra uma prévia antes do envio e ignora duplicidades detectadas.

## Contribuição

1. Atualize sua `main` local.
2. Crie uma branch com prefixo `feat/`, `fix/`, `docs/` ou `chore/`.
3. Faça mudanças pequenas e focadas.
4. Execute todas as validações locais.
5. Abra um Pull Request para `main` e aguarde o status check `verify`.
6. Após aprovação, use squash merge.

Commits diretos na `main` não fazem parte do fluxo. Leia [CONTRIBUTING.md](CONTRIBUTING.md) antes de enviar alterações.

## Deploy na Vercel

O projeto pode ser importado na Vercel como uma aplicação Next.js. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no ambiente de produção e ajuste no Supabase a Site URL e a Redirect URL de autenticação para o domínio publicado.

O deploy não precisa de chave `service_role`, acesso administrativo ao banco ou migrations executadas durante o build. Aplique mudanças de banco separadamente, por migrations revisadas e versionadas.

## Limitações atuais e roadmap

Limitações atuais:

- não há sincronização automática com bancos ou cartões;
- não há contas compartilhadas ou colaboração entre usuários;
- os planos exigem confirmação manual para entrar nos totais;
- a experiência offline cobre a interface estática, não operações financeiras;
- o projeto não oferece garantias contábeis, fiscais ou de consultoria financeira.

Possíveis próximos passos:

- ampliar testes de integração em um Supabase isolado de testes;
- melhorar a acessibilidade e a cobertura de fluxos críticos;
- evoluir relatórios e opções de exportação sem comprometer o isolamento dos dados.

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).
