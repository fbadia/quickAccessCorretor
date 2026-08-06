# ADR-003 — Google Gemini 1.5 Flash para extração de dados de PDFs

**Data:** 2026-05 (estimada)
**Status:** ✅ Aceita
**Contexto:** Estratégia de extração de dados estruturados de apólices em PDF

---

## Contexto

O problema central do produto é transformar PDFs de apólices (Yelum, Porto Seguro, Bradesco, HDI, Allianz) em dados estruturados sem precisar de parsers específicos por seguradora. Cada seguradora tem layouts, fontes e formatações completamente diferentes.

## Decisão

Usar **Google Gemini 1.5 Flash** para analisar o PDF inteiro (como dado multimodal) e retornar JSON estruturado com um único prompt. O modelo também detecta automaticamente se o documento é uma **apólice** ou um **endosso**.

### Estratégia de fallback

Se o modelo primário (`gemini-1.5-flash`) não estiver disponível, o sistema tenta automaticamente `gemini-flash-lite-latest` antes de retornar erro.

### Deduplicação

SHA-256 do arquivo PDF é calculado antes de chamar a API. Duplicatas são rejeitadas sem custo de API.

## Alternativas Consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Parsers específicos por seguradora | Inviável: cada seguradora usa layout/fonte diferente; manutenção explosiva |
| AWS Textract | Sem compreensão semântica; exige pós-processamento manual por tipo |
| GPT-4o Vision | Custo mais alto; latência maior; sem SDK nativo para Node.js tão maduro |
| pdfjs + regex | Funciona apenas para PDFs com texto selecionável; falha em PDFs escaneados |
| Google Document AI | Mais caro; requer configuração de processor por tipo de documento |

## Consequências

**Positivas:**
- Um único código funciona para todas as seguradoras, presentes e futuras
- Detecta automaticamente apólice vs. endosso
- Trata PDFs escaneados e PDFs com texto
- Prompt ajustável sem deploy de código

**Negativas / Trade-offs:**
- Custo por chamada de API (mitigado pela deduplicação SHA-256)
- Latência de 3–8s por PDF processado
- Resultado depende da qualidade do PDF — PDFs muito corrompidos podem falhar
- `GEMINI_API_KEY` é um secret crítico do backend

## Padrão resultante

O prompt instrui o modelo a retornar **exclusivamente JSON** sem markdown, com dois schemas possíveis:
- `document_type: "policy"` — apólice nova
- `document_type: "endorsement"` — alteração de apólice existente

```javascript
// geminiService.js
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  generationConfig: { responseMimeType: "application/json" }
});
const result = await model.generateContent([prompt, pdfPart]);
```
