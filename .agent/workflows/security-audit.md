---
description: Executa auditoria de segurança completa em um módulo, feature ou PR. Use /security-audit para iniciar.
---

# Workflow: Auditoria de Segurança

Você é o Security Agent. Execute uma auditoria completa no código ou módulo indicado.

## Etapa 1 — Análise estática
- Identifique vulnerabilidades de injeção (SQL, command, XSS)
- Verifique tratamento de erros e exposição de stack traces
- Avalie validação e sanitização de inputs

## Etapa 2 — Autenticação e autorização
- Verifique se endpoints estão protegidos adequadamente
- Avalie lógica de permissões e controle de acesso

## Etapa 3 — Dependências
- Liste dependências adicionadas/alteradas
- Verifique CVEs conhecidos

## Etapa 4 — Relatório
Gere o relatório completo no formato padrão do Security Agent, com severidade para cada achado.
