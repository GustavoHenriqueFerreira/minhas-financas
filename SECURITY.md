# Política de segurança

## Versões suportadas

Este projeto mantém uma única linha ativa. Correções de segurança são destinadas à versão atual publicada e à branch `main`.

| Versão | Suporte |
| --- | --- |
| `1.x` | Sim |
| `< 1.0` | Não |

## Relato responsável

Não divulgue uma vulnerabilidade em Issues, Discussions, Pull Requests ou outros canais públicos.

Use o recurso privado **Report a vulnerability** na área [Security Advisories](https://github.com/GustavoHenriqueFerreira/minhas-financas/security/advisories) do repositório. Inclua, quando possível:

- descrição do impacto;
- componente e versão afetados;
- passos mínimos para reprodução;
- pré-condições necessárias;
- sugestão de correção ou mitigação;
- evidências estritamente sanitizadas.

Nunca envie credenciais, tokens, chaves do Supabase, conteúdo de `.env.local`, backups ou dados financeiros reais. Se a reprodução depender de dados, crie um exemplo mínimo totalmente fictício.

## Escopo das proteções

O projeto utiliza Supabase Auth, sessões por cookies, APIs autenticadas, RLS, isolamento por `user_id`, validação de origem em operações mutáveis, limites de payload, cabeçalhos de segurança e cache restrito no service worker. A aplicação não usa uma chave `service_role`.

Essas medidas formam camadas de proteção, mas não garantem ausência de vulnerabilidades. Relatos responsáveis ajudam a corrigir falhas antes da divulgação pública.

Problemas gerais de uso que não envolvam segurança podem ser enviados pelos templates de Issue do repositório.
