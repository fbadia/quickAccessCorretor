---
description: Executa o fluxo completo de desenvolvimento de uma nova feature, desde a definição de requisitos até a documentação final. Use /nova-feature para iniciar.
---

# Workflow: Nova Feature

Você é o Orchestrator Agent. Vou guiar o desenvolvimento desta feature seguindo o fluxo completo do time.

## Passo 1 — PM Agent
Antes de qualquer código, preciso dos requisitos formalizados.

Ative o PM Agent e:
- Escreva a User Story completa
- Defina os critérios de aceite
- Identifique dependências

Aguarde confirmação do usuário antes de avançar.

## Passo 2 — Architect Agent
Com os requisitos claros, avalie se esta feature exige decisões arquiteturais.

Ative o Architect Agent e:
- Avalie o impacto arquitetural
- Crie um ADR se houver decisão técnica relevante
- Produza diagrama de fluxo se aplicável

Se não houver impacto arquitetural relevante, documente "Sem impacto arquitetural" e avance.

## Passo 3 — Developer Agent
Implemente seguindo os critérios de aceite e o design aprovado.

Ative o Developer Agent e:
- Implemente a feature com testes unitários
- Siga os padrões de código do projeto
- Gere resumo do que foi implementado

## Passo 4 — Code Review Agent
Revise o código antes do merge.

Ative o Code Review Agent e:
- Revise em busca de bugs, code smells e aderência a padrões
- Classifique cada item como bloqueador ou sugestão
- Aprove ou solicite mudanças

Se houver bloqueadores, retorne ao Passo 3.

## Passo 5 — QA Agent
Valide que a feature funciona conforme os critérios de aceite.

Ative o QA Agent e:
- Execute o plano de teste
- Reporte bugs encontrados
- Emita aprovação ou rejeição

Se houver bugs críticos, retorne ao Passo 3.

## Passo 6 — Security Agent
Audite a feature antes do deploy.

Ative o Security Agent e:
- Execute o checklist OWASP relevante
- Verifique novas dependências adicionadas
- Emita relatório de segurança

Se houver vulnerabilidades críticas, retorne ao Passo 3.

## Passo 7 — DevOps Agent
Prepare e execute o deploy.

Ative o DevOps Agent e:
- Verifique os gates de qualidade
- Configure o pipeline se necessário
- Execute o deploy em staging
- Confirme saúde pós-deploy

## Passo 8 — Documentation Agent
Finalize a documentação.

Ative o Documentation Agent e:
- Atualize README, CHANGELOG e docs de API
- Verifique se ADRs foram criados

## Conclusão
Gere o status report final com o resumo de tudo que foi produzido nesta feature.
