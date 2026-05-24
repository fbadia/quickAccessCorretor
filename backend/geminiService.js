import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Envia o PDF da apólice para o Gemini 1.5 Flash extrair as informações estruturadas.
 * @param {Buffer} pdfBuffer Buffer do arquivo PDF da apólice.
 * @param {string} apiKey Chave de API do Gemini.
 * @returns {Promise<Object>} Dados estruturados da apólice.
 */
export async function extractPolicyData(pdfBuffer, apiKey) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não foi configurada.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Converter o Buffer do PDF para a estrutura de dados inline do Gemini API
  const pdfPart = {
    inlineData: {
      data: pdfBuffer.toString("base64"),
      mimeType: "application/pdf"
    }
  };

  const prompt = `
    Você é um especialista em extração de dados de apólices de seguros brasileiras (foco em automóvel).
    Analise o PDF da apólice anexada e extraia exatamente as informações abaixo.
    Retorne APENAS um objeto JSON válido, sem qualquer marcação markdown extra.
    
    Esquema JSON esperado:
    {
      "segurado": {
        "nome": "NOME COMPLETO DO SEGURADO",
        "cpf_cnpj": "CPF ou CNPJ formatado (ex: 123.456.789-00 ou 12.345.678/0001-99)"
      },
      "seguradora": "Nome comercial da Seguradora (escolha entre: Porto Seguro, Yelum, Bradesco Seguros, HDI Seguros, Allianz Seguros. Se for outra, use o nome oficial identificado)",
      "apolice": {
        "numero": "Número da apólice (remova caracteres especiais como pontos, barras ou traços, mantenha apenas números/letras)",
        "inicio_vigencia": "Data de início da vigência no formato YYYY-MM-DD",
        "fim_vigencia": "Data de fim da vigência no formato YYYY-MM-DD"
      },
      "veiculo": {
        "placa": "Placa do veículo (limpa, sem hifens, espaços ou pontuações, em caixa alta. Ex: ABC1D23 ou XYZ4321)",
        "marca_modelo": "Marca e Modelo do veículo (ex: JEEP COMPASS LONGITUDE T270)",
        "ano": 2022
      }
    }

    Orientações adicionais:
    1. Certifique-se de que a placa seja extraída com precisão. Caso não encontre a placa, tente identificar pelo número do chassi ou deixe nulo se indisponível.
    2. A data de vigência é crucial para saber se o seguro está ativo. Formate sempre como YYYY-MM-DD.
    3. Para a seguradora Yelum, lembre-se de que ela pode aparecer como "Yelum", "Yelum Seguros", "Liberty Seguros" ou "Liberty". Normalize para "Yelum".
  `;

  let modelName = "gemini-1.5-flash";
  let responseText;

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent([prompt, pdfPart]);
    responseText = result.response.text();
  } catch (error) {
    const isModelNotFoundError = error.message && (
      error.message.includes("not found") || 
      error.message.includes("404") ||
      error.message.includes("not supported")
    );

    if (isModelNotFoundError) {
      console.warn(`[Gemini] Modelo ${modelName} indisponível. Tentando fallback para a versão mais barata (gemini-flash-lite-latest)...`);
      modelName = "gemini-flash-lite-latest";
      
      try {
        const fallbackModel = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json",
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
    const extractedData = JSON.parse(responseText);
    return extractedData;
  } catch (parseError) {
    console.error("Erro ao parsear JSON retornado pelo Gemini:", parseError, "Resposta:", responseText);
    throw new Error(`Resposta do Gemini inválida ou mal-formatada: ${parseError.message}`);
  }
}
