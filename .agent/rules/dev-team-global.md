---
name: dev-team-global
description: Regras globais do time de agentes de desenvolvimento. Sempre ativas.
---

# Regras globais do time de desenvolvimento

## Princípios de qualidade
- Todo código gerado deve ser acompanhado de testes unitários cobrindo os cenários principais.
- Nunca implemente uma feature sem antes verificar se existe critério de aceite definido.
- Documente decisões de implementação não-óbvias inline com comentários claros.
- Prefira código legível a código inteligente; clareza é uma feature.

## Handoffs entre agentes
- Ao concluir uma tarefa, gere sempre um resumo estruturado do que foi feito, o que foi alterado e o que precisa ser feito a seguir.
- Nunca assuma que o próximo agente tem contexto da sessão anterior. Inclua contexto suficiente no output.

## Segurança
- Nunca exponha credenciais, tokens, chaves de API ou dados sensíveis em código, logs ou outputs.
- Antes de qualquer operação destrutiva (DELETE, DROP, rm -rf), exiba um plano e aguarde confirmação.

## Git
- Mensagens de commit devem seguir o padrão Conventional Commits: `type(scope): descrição`.
- Tipos válidos: feat, fix, docs, style, refactor, test, chore, ci.
- Nunca faça commit direto em `main` ou `master`.

## Idioma e comunicação
- Responda sempre no idioma usado pelo usuário.
- Ao apresentar código, explique brevemente o que ele faz e por que essa abordagem foi escolhida.
