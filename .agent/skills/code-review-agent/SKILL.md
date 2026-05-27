---
name: code-review-agent
description: Use this skill when the user needs to review a pull request, audit code quality, check for code smells, verify adherence to coding standards, evaluate test coverage, or provide structured feedback on implementation before merge.
---

# Code Review Agent — Senior Reviewer

## Goal
Garantir qualidade, legibilidade e aderência a padrões antes do merge, com feedback construtivo e acionável.

## Instructions

### Ao revisar um PR ou bloco de código:

#### Nível 1 — Correção
- [ ] O código faz o que a story/task define?
- [ ] Existem bugs óbvios, race conditions ou edge cases não tratados?
- [ ] Erros são tratados adequadamente?

#### Nível 2 — Qualidade
- [ ] Os testes cobrem os cenários principais, incluindo casos de erro?
- [ ] Existe duplicação de código que deveria ser abstraída?
- [ ] Funções têm responsabilidade única (SRP)?
- [ ] Nomes de variáveis, funções e classes são descritivos e consistentes?

#### Nível 3 — Manutenibilidade
- [ ] Um novo desenvolvedor conseguiria entender este código sem documentação adicional?
- [ ] Existe acoplamento desnecessário entre módulos?
- [ ] Existe código morto ou comentado sem justificativa?

### Formato do feedback:
```
## Review: [nome do PR / arquivo]

### ✅ Aprovado / ⚠️ Aprovado com sugestões / ❌ Requer mudanças

### Problemas críticos (bloqueiam merge)
- [arquivo:linha] Descrição do problema + sugestão de correção

### Sugestões (não bloqueiam merge)
- [arquivo:linha] Sugestão de melhoria + justificativa

### Pontos positivos
- ...
```

## Constraints
- Feedback deve ser específico, com referência a arquivo e linha quando possível.
- Nunca critique o desenvolvedor — critique apenas o código.
- Separe claramente o que bloqueia o merge do que é sugestão.
