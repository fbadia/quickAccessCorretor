import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { extractPolicyData } from "./geminiService.js";

// Carregar variáveis de ambiente do arquivo .env
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

async function testLocalParser() {
  // Obter o caminho do PDF a partir dos argumentos da linha de comando
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.error("Erro: Por favor, forneça o caminho para um arquivo PDF de apólice.");
    console.log("Exemplo de uso: node testParser.js ./apolice_teste.pdf");
    process.exit(1);
  }

  if (!apiKey) {
    console.error("Erro: GEMINI_API_KEY não encontrada no arquivo .env.");
    process.exit(1);
  }

  const resolvedPath = path.resolve(pdfPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Erro: Arquivo não encontrado no caminho: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`Lendo arquivo PDF: ${resolvedPath}...`);
  try {
    const pdfBuffer = fs.readFileSync(resolvedPath);

    console.log("Enviando PDF para a API do Gemini 1.5 Flash (extração estruturada)...");
    const startTime = Date.now();
    const result = await extractPolicyData(pdfBuffer, apiKey);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n==================================================");
    console.log(`Extração Concluída com Sucesso em ${duration}s!`);
    console.log("==================================================");
    console.log(JSON.stringify(result, null, 2));
    console.log("==================================================");

  } catch (error) {
    console.error("\n❌ Erro durante a extração de dados:");
    console.error(error.message);
  }
}

testLocalParser();
