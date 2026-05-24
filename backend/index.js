import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { getDriveClient, listPdfFiles, downloadFile } from "./driveService.js";
import { extractPolicyData } from "./geminiService.js";
import { getSupabaseClient, isFileProcessed, savePolicyData, seedInsurers } from "./dbService.js";

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Estado de sincronização na memória (para o MVP)
let syncState = {
  status: "idle", // idle, running, completed, failed
  lastRun: null,
  totalFiles: 0,
  processedFiles: 0,
  successCount: 0,
  failCount: 0,
  skippedCount: 0,
  errors: []
};

// Inicializar clientes
let supabase;
let drive;

try {
  supabase = getSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    drive = getDriveClient(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else {
    console.warn("GOOGLE_SERVICE_ACCOUNT_JSON não configurado. Sincronização automática indisponível.");
  }

  // Executar seed das seguradoras
  seedInsurers(supabase);
} catch (error) {
  console.error("Erro na inicialização dos clientes de serviços:", error.message);
}

/**
 * Função principal que realiza a rotina de sincronização de arquivos.
 */
async function runSyncJob() {
  if (syncState.status === "running") {
    console.log("Sincronização já está em execução.");
    return;
  }

  if (!drive || !supabase) {
    console.error("Clientes Drive ou Supabase não configurados corretamente.");
    return;
  }

  syncState = {
    status: "running",
    lastRun: new Date().toISOString(),
    totalFiles: 0,
    processedFiles: 0,
    successCount: 0,
    failCount: 0,
    skippedCount: 0,
    errors: []
  };

  try {
    console.log("Iniciando varredura no Google Drive...");
    const files = await listPdfFiles(drive, process.env.GOOGLE_DRIVE_FOLDER_ID);
    syncState.totalFiles = files.length;
    console.log(`Encontrados ${files.length} arquivos PDF na pasta do Google Drive.`);

    for (const file of files) {
      syncState.processedFiles++;
      const fileId = file.id;
      const fileName = file.name;

      console.log(`[${syncState.processedFiles}/${syncState.totalFiles}] Verificando: ${fileName}`);

      // 1. Verificar se já foi processado
      const processed = await isFileProcessed(supabase, fileId);
      if (processed) {
        console.log(`-> Arquivo já processado anteriormente. Pulando.`);
        syncState.skippedCount++;
        continue;
      }

      try {
        console.log(`-> Baixando arquivo ${fileName}...`);
        const pdfBuffer = await downloadFile(drive, fileId);

        console.log(`-> Enviando para análise do Gemini...`);
        const extractedData = await extractPolicyData(pdfBuffer, process.env.GEMINI_API_KEY);

        console.log(`-> Salvando dados no Supabase...`);
        await savePolicyData(supabase, fileId, extractedData);
        
        syncState.successCount++;
      } catch (err) {
        console.error(`Erro ao processar o arquivo ${fileName}:`, err.message);
        syncState.failCount++;
        syncState.errors.push({
          file: fileName,
          error: err.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    syncState.status = "completed";
    console.log(`Sincronização concluída. Sucessos: ${syncState.successCount}, Falhas: ${syncState.failCount}, Pulados: ${syncState.skippedCount}`);
  } catch (error) {
    console.error("Falha geral na sincronização:", error);
    syncState.status = "failed";
    syncState.errors.push({
      file: "system",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// -----------------------------------------------------
// ROTAS HTTP
// -----------------------------------------------------

// Rota de Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Servidor QuickAccessCorretor está ativo e operando.",
    timestamp: new Date().toISOString()
  });
});

// Retorna o status da sincronização
app.get("/sync/status", (req, res) => {
  res.json(syncState);
});

// Força o início de uma sincronização manual (Background)
app.post("/sync", (req, res) => {
  if (syncState.status === "running") {
    return res.status(409).json({
      message: "Uma sincronização já está em andamento.",
      status: syncState.status
    });
  }

  // Rodar de forma assíncrona para não travar a requisição HTTP
  runSyncJob();

  res.status(202).json({
    message: "Sincronização iniciada com sucesso em segundo plano.",
    status: "running"
  });
});

// Inicialização do Servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);

  // Configurar polling automático (ex: a cada 10 minutos)
  const intervalMinutes = 10;
  console.log(`Polling automático ativado: varrendo a pasta a cada ${intervalMinutes} minutos.`);
  setInterval(() => {
    console.log("Executando sincronização agendada...");
    runSyncJob();
  }, intervalMinutes * 60 * 1000);
});
