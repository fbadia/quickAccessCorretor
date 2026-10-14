import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const nullableString = { type: SchemaType.STRING, nullable: true };
const nullableDate = { type: SchemaType.STRING, format: "date", nullable: true };
const nullableInt = { type: SchemaType.INTEGER, nullable: true };

/**
 * Schema fechado (Structured Outputs) para apólices e endossos — ADR-007 / Story 1.2.
 * Os dois formatos são unificados num único objeto porque o responseSchema do Gemini
 * não suporta anyOf; campos do outro tipo de documento vêm null.
 */
export const DOCUMENT_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    document_type: { type: SchemaType.STRING, format: "enum", enum: ["policy", "endorsement"] },
    seguradora: nullableString,
    segurado: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: { nome: nullableString, cpf_cnpj: nullableString },
      required: ["nome", "cpf_cnpj"],
    },
    apolice: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: { numero: nullableString, inicio_vigencia: nullableDate, fim_vigencia: nullableDate },
      required: ["numero", "inicio_vigencia", "fim_vigencia"],
    },
    veiculo: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: { placa: nullableString, marca_modelo: nullableString, ano: nullableInt },
      required: ["placa", "marca_modelo", "ano"],
    },
    policy_number: nullableString,
    endorsement_number: nullableString,
    endorsement_type: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["vehicle_change", "insured_change", "coverage_change", "other"],
      nullable: true,
    },
    issued_at: nullableDate,
    changes: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        insured_name: nullableString,
        cpf_cnpj: nullableString,
        plate: nullableString,
        brand_model: nullableString,
        year: nullableInt,
        start_date: nullableDate,
        end_date: nullableDate,
      },
      required: ["insured_name", "cpf_cnpj", "plate", "brand_model", "year", "start_date", "end_date"],
    },
  },
  // Todos os campos são obrigatórios (aceitando null): com campos opcionais o Gemini
  // tende a omiti-los e devolver só document_type + nome, o que gerava apólices
  // "SEM-NUMERO" sem vigência.
  required: [
    "document_type", "seguradora", "segurado", "apolice", "veiculo",
    "policy_number", "endorsement_number", "endorsement_type", "issued_at", "changes",
  ],
};

/**
 * Envia o PDF para o Gemini identificar se é uma apólice ou um endosso,
 * e extrai as informações estruturadas correspondentes.
 *
 * @param {Buffer} pdfBuffer Buffer do arquivo PDF.
 * @param {string} apiKey Chave de API do Gemini.
 * @returns {Promise<Object>} Dados estruturados com `document_type` e campos específicos.
 */
export async function extractDocumentData(pdfBuffer, apiKey) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não foi configurada.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const pdfPart = {
    inlineData: {
      data: pdfBuffer.toString("base64"),
      mimeType: "application/pdf"
    }
  };

  const prompt = `
    Você é um especialista em extração de dados de documentos de seguros automotivos brasileiros.
    Analise o PDF anexado e determine se ele é uma APÓLICE NOVA ou um ENDOSSO.

    DEFINIÇÕES:
    - APÓLICE: documento original que cria um contrato de seguro para um veículo.
    - ENDOSSO: documento que registra uma ALTERAÇÃO em uma apólice já existente (troca de veículo, mudança de dados do segurado, ajuste de cobertura etc.).

    Retorne APENAS um objeto JSON válido, sem markdown, seguindo EXATAMENTE um dos dois esquemas abaixo:

    === SE FOR APÓLICE (document_type = "policy") ===
    {
      "document_type": "policy",
      "segurado": {
        "nome": "NOME COMPLETO DO SEGURADO",
        "cpf_cnpj": "CPF ou CNPJ formatado (ex: 123.456.789-00 ou 12.345.678/0001-99)"
      },
      "seguradora": "Nome comercial da Seguradora (escolha entre: Porto Seguro, Yelum, Bradesco Seguros, HDI Seguros, Allianz Seguros. Se for outra, use o nome oficial identificado)",
      "apolice": {
        "numero": "Número da apólice (remova caracteres especiais como pontos, barras ou traços, mantenha apenas letras e números em maiúsculas)",
        "inicio_vigencia": "YYYY-MM-DD",
        "fim_vigencia": "YYYY-MM-DD"
      },
      "veiculo": {
        "placa": "Placa limpa, sem hifens ou espaços, em caixa alta (ex: ABC1D23 ou XYZ4321)",
        "marca_modelo": "Marca e Modelo (ex: JEEP COMPASS LONGITUDE T270)",
        "ano": 2022
      }
    }

    === SE FOR ENDOSSO (document_type = "endorsement") ===
    {
      "document_type": "endorsement",
      "policy_number": "Número da APÓLICE BASE que este endosso altera (remova caracteres especiais, mantenha apenas letras e números em maiúsculas — mesma normalização do número de apólice)",
      "endorsement_number": "Número do endosso (ex: 0001, 002 etc.)",
      "endorsement_type": "vehicle_change | insured_change | coverage_change | other",
      "issued_at": "Data de emissão do endosso no formato YYYY-MM-DD",
      "seguradora": "Nome comercial da Seguradora (mesma lista acima)",
      "changes": {
        "insured_name": "Novo nome do segurado, ou null se não alterado",
        "cpf_cnpj": "Novo CPF/CNPJ formatado, ou null se não alterado",
        "plate": "Nova placa limpa em caixa alta, ou null se não alterada",
        "brand_model": "Nova marca/modelo, ou null se não alterado",
        "year": null,
        "start_date": "Nova data de início no formato YYYY-MM-DD, ou null",
        "end_date": "Nova data de fim no formato YYYY-MM-DD, ou null"
      }
    }

    ORIENTAÇÕES:
    1. Para identificar ENDOSSO: procure termos como "endosso", "aditivo", "alteração de apólice", "endossamento" no cabeçalho ou título do documento.
    2. Para o campo "endorsement_type", use:
       - "vehicle_change": se houver troca de veículo (placa, modelo ou chassi diferente)
       - "insured_change": se houver alteração nos dados do segurado (nome, CPF, endereço)
       - "coverage_change": se houver alteração de cobertura, franquia ou valor segurado
       - "other": para qualquer outra alteração
    3. Para "policy_number" e "apolice.numero": aplique a MESMA normalização — remova pontos, barras, traços e espaços. Mantenha apenas letras e números, em MAIÚSCULAS.
    4. Para a seguradora Yelum: ela pode aparecer como "Yelum", "Yelum Seguros", "Liberty Seguros" ou "Liberty". Normalize para "Yelum".
    5. Em "changes", preencha APENAS os campos que foram de fato alterados pelo endosso. Deixe null nos demais.
    6. Se não conseguir determinar com certeza se é apólice ou endosso, prefira classificar como "policy".
  `;

  let modelName = "gemini-flash-latest";
  let responseText;

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: DOCUMENT_RESPONSE_SCHEMA,
      },
    });

    const result = await model.generateContent([prompt, pdfPart]);
    responseText = result.response.text();
  } catch (error) {
    // Modelo indisponível (404 / descontinuado) ou sobrecarregado (503 / 429): tenta o fallback.
    const isModelUnavailableError = error.message && (
      error.message.includes("not found") ||
      error.message.includes("404") ||
      error.message.includes("not supported") ||
      error.message.includes("503") ||
      error.message.includes("429")
    );

    if (isModelUnavailableError) {
      console.warn(`[Gemini] Modelo ${modelName} indisponível. Tentando fallback para gemini-flash-lite-latest...`);
      modelName = "gemini-flash-lite-latest";

      try {
        const fallbackModel = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: DOCUMENT_RESPONSE_SCHEMA,
          },
        });

        const result = await fallbackModel.generateContent([prompt, pdfPart]);
        responseText = result.response.text();
      } catch (fallbackError) {
        console.error(`[Gemini] Falha também no modelo de fallback ${modelName}:`, fallbackError);
        throw new Error(`Falha na extração de dados com Gemini (ambos os modelos falharam): ${fallbackError.message}`);
      }
    } else {
      console.error("Erro na chamada da API do Gemini:", error);
      throw new Error(`Falha na extração de dados com Gemini: ${error.message}`);
    }
  }

  try {
    const parsedData = JSON.parse(responseText);

    if (!parsedData.document_type) {
      // Fallback de segurança: se o Gemini não retornou document_type, assume policy
      console.warn("[Gemini] Campo document_type ausente na resposta. Assumindo 'policy'.");
      parsedData.document_type = "policy";
    }

    console.log(`[Gemini] Documento identificado como: ${parsedData.document_type}`);
    // Minimização de Dados (LGPD / ADR-007): remove campos não homologados ou excedentes
    const extractedData = sanitizeExtractedData(parsedData);
    return extractedData;
  } catch (parseError) {
    console.error("Erro ao parsear JSON retornado pelo Gemini:", parseError, "Resposta:", responseText);
    throw new Error(`Resposta do Gemini inválida ou mal-formatada: ${parseError.message}`);
  }
}

/**
 * Aplica o Princípio da Minimização de Dados (Art. 6º, III da LGPD / ADR-007).
 * Garante que apenas os campos estritamente necessários para o contrato de seguro
 * sejam mantidos, expurgando dados residuais como endereços, dados bancários ou parentes.
 * 
 * @param {Object} data Objeto JSON bruto retornado pela IA.
 * @returns {Object} Objeto minimizado e sanitizado.
 */
export function sanitizeExtractedData(data) {
  if (!data || typeof data !== "object") return {};

  if (data.document_type === "endorsement") {
    return {
      document_type: "endorsement",
      policy_number: data.policy_number ? String(data.policy_number).replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : null,
      endorsement_number: data.endorsement_number ? String(data.endorsement_number).trim() : null,
      endorsement_type: data.endorsement_type || "other",
      issued_at: data.issued_at || null,
      seguradora: data.seguradora ? String(data.seguradora).trim() : "Desconhecida",
      changes: {
        insured_name: data.changes?.insured_name ? String(data.changes.insured_name).trim() : null,
        cpf_cnpj: data.changes?.cpf_cnpj ? String(data.changes.cpf_cnpj).trim() : null,
        plate: data.changes?.plate ? String(data.changes.plate).replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : null,
        brand_model: data.changes?.brand_model ? String(data.changes.brand_model).trim() : null,
        year: data.changes?.year ? parseInt(data.changes.year, 10) || null : null,
        start_date: data.changes?.start_date || null,
        end_date: data.changes?.end_date || null
      }
    };
  }

  // Padrão: policy
  return {
    document_type: "policy",
    segurado: {
      nome: data.segurado?.nome ? String(data.segurado.nome).trim() : "Não Identificado",
      cpf_cnpj: data.segurado?.cpf_cnpj ? String(data.segurado.cpf_cnpj).trim() : ""
    },
    seguradora: data.seguradora ? String(data.seguradora).trim() : "Desconhecida",
    apolice: {
      numero: data.apolice?.numero ? String(data.apolice.numero).replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : "SEM-NUMERO",
      inicio_vigencia: data.apolice?.inicio_vigencia || null,
      fim_vigencia: data.apolice?.fim_vigencia || null
    },
    veiculo: {
      placa: data.veiculo?.placa ? String(data.veiculo.placa).replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : "",
      brand_model: data.veiculo?.marca_modelo || data.veiculo?.brand_model || "Não Especificado",
      ano: data.veiculo?.ano ? parseInt(data.veiculo.ano, 10) || null : null
    }
  };
}

/**
 * @deprecated Use extractDocumentData() no lugar.
 * Mantido por compatibilidade temporária caso haja referências diretas.
 */
export async function extractPolicyData(pdfBuffer, apiKey) {
  return extractDocumentData(pdfBuffer, apiKey);
}
