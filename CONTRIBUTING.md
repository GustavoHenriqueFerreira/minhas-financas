# Como contribuir

Obrigado pelo interesse em contribuir com o Minhas Finanças. Mantenha cada alteração pequena, revisável e limitada ao objetivo do Pull Request.

## Fluxo de branches

1. Sincronize sua branch `main` com o repositório remoto.
2. Crie uma branch com um destes prefixos:
   - `feat/` para novas funcionalidades;
   - `fix/` para correções;
   - `docs/` para documentação;
   - `chore/` para manutenção e infraestrutura.
3. Faça commits descritivos na branch de trabalho.
4. Abra um Pull Request para `main`.

Não faça commits nem push direto na `main`. Não desative ou contorne as proteções da branch.

## Validações obrigatórias

Instale as dependências com `npm ci` e, antes de abrir ou atualizar um Pull Request, execute:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

O Pull Request também deve aguardar o status check `verify` do GitHub Actions.

## Mudanças no banco

Qualquer alteração de schema, função, índice, permissão ou política RLS deve ser feita por uma nova migration versionada em `supabase/migrations`.

- não edite silenciosamente uma migration já aplicada em produção;
- mantenha RLS e o isolamento por `user_id`;
- documente compatibilidade, implantação e eventual rollback;
- teste migrations em um projeto Supabase isolado, nunca com dados reais de produção;
- não execute migrations automaticamente no CI ou no build da Vercel.

## Dados e credenciais

É proibido incluir em commits, Issues, Pull Requests, logs ou evidências:

- secrets, tokens, senhas ou chaves privadas;
- `.env.local` ou outros arquivos locais de ambiente;
- chaves `service_role` ou credenciais do banco;
- backups, arquivos OFX/QIF ou planilhas financeiras;
- e-mails pessoais, identificadores privados ou dados financeiros reais;
- caminhos locais e informações específicas da máquina do colaborador.

Use somente dados fictícios e sanitizados em testes, exemplos e evidências. Se um segredo for exposto, revogue-o imediatamente e siga o processo de segurança; remover apenas o arquivo do commit não torna o segredo seguro novamente.

## Pull Requests

O Pull Request deve:

- explicar o problema e a solução;
- listar os arquivos ou áreas afetadas;
- registrar os resultados das quatro validações obrigatórias;
- incluir passos de teste e evidências sanitizadas quando aplicável;
- declarar migrations, mudanças de configuração ou riscos relevantes;
- manter o escopo sem refatorações não relacionadas.

Após revisão, aprovação e sucesso do check `verify`, a integração deve ser feita por **squash merge**. Não faça merge sem que as proteções da `main` tenham sido atendidas.

Vulnerabilidades não devem ser discutidas em Issues públicas. Siga [SECURITY.md](SECURITY.md).
