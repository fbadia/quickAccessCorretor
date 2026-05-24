import { google } from "googleapis";
import { Readable } from "stream";

/**
 * Inicializa e autentica o cliente da API do Google Drive usando uma conta de serviço.
 * @param {string} serviceAccountJsonString JSON completo da conta de serviço como string.
 * @returns {Object} Instância configurada do cliente Google Drive.
 */
export function getDriveClient(serviceAccountJsonString) {
  if (!serviceAccountJsonString) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não foi configurada.");
  }

  try {
    const credentials = JSON.parse(serviceAccountJsonString);
    
    // Substituir quebras de linha na chave privada caso existam (comum em envs)
    const privateKey = credentials.private_key.replace(/\\n/g, "\n");

    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      privateKey,
      ["https://www.googleapis.com/auth/drive.readonly"]
    );

    return google.drive({ version: "v3", auth });
  } catch (error) {
    console.error("Erro ao inicializar Google Auth:", error);
    throw new Error(`Falha na autenticação do Google Drive: ${error.message}`);
  }
}

/**
 * Lista todos os arquivos PDF dentro de uma pasta específica no Google Drive.
 * @param {Object} drive Cliente autenticado do Google Drive.
 * @param {string} folderId ID da pasta no Google Drive.
 * @returns {Promise<Array>} Lista de objetos contendo { id, name }.
 */
export async function listPdfFiles(drive, folderId) {
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID não configurado.");
  }

  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/pdf' and trashed = false`,
      fields: "files(id, name, createdTime)",
      spaces: "drive",
      pageSize: 100 // MVP processa até 100 por lote
    });

    return response.data.files || [];
  } catch (error) {
    console.error("Erro ao listar arquivos do Google Drive:", error);
    throw new Error(`Erro ao acessar a pasta do Drive: ${error.message}`);
  }
}

/**
 * Faz download de um arquivo do Google Drive e retorna seu conteúdo como um Buffer.
 * @param {Object} drive Cliente autenticado do Google Drive.
 * @param {string} fileId ID do arquivo a ser baixado.
 * @returns {Promise<Buffer>} Buffer do arquivo baixado.
 */
export async function downloadFile(drive, fileId) {
  try {
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    return new Promise((resolve, reject) => {
      const chunks = [];
      response.data
        .on("data", (chunk) => chunks.push(chunk))
        .on("end", () => resolve(Buffer.concat(chunks)))
        .on("error", (err) => {
          console.error(`Erro no stream de download do arquivo ${fileId}:`, err);
          reject(err);
        });
    });
  } catch (error) {
    console.error(`Erro ao fazer download do arquivo ${fileId} do Google Drive:`, error);
    throw new Error(`Falha no download do arquivo: ${error.message}`);
  }
}
