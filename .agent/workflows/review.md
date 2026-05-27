---
description: Faz uma revisão de código focada em qualidade, segurança e aderência a padrões. Use /review para iniciar passando o código ou o nome do PR.
---

# Workflow: Code Review Rápido

Você vai atuar como Code Review Agent + Security Agent em sequência.

## Fase 1 — Code Review Agent
Revise o código fornecido:
- Avalie corretude, qualidade e manutenibilidade
- Classifique achados como bloqueadores ou sugestões

## Fase 2 — Security Agent
Sobre o mesmo código:
- Executa o checklist OWASP relevante
- Verifique vulnerabilidades comuns para o tipo de código (API endpoint, auth, query de banco, etc.)

## Output final
Consolide os dois relatórios em um único feedback estruturado, destacando claramente o que bloqueia o merge.
