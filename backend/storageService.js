/**
 * Servidor de Integração com o Supabase Storage (S3-compatible)
 * Gerencia o upload, download e exclusão de arquivos no bucket 'policies'.
 */

const BUCKET_NAME = "policies";

/**
 * Envia um arquivo PDF para o Supabase Storage dentro da pasta da organização.
 * @param {Object} supabase Cliente do Supabase (com bypass de RLS via Service Role).
 * @param {string} organizationId UUID da organização dona do arquivo.
 * @param {string} fileName Nome original ou higienizado do arquivo.
 * @param {Buffer} fileBuffer Buffer do arquivo.
 * @returns {Promise<string>} O caminho do arquivo gravado no storage (ex: "org_uuid/arquivo.pdf").
 */
export async function uploadFileToStorage(supabase, organizationId, fileName, fileBuffer) {
  if (!organizationId) {
    throw new Error("organizationId é obrigatório para upload de arquivos.");
  }
  if (!fileName || !fileBuffer) {
    throw new Error("Nome do arquivo e buffer do arquivo são obrigatórios.");
  }

  // Sanitizar o nome do arquivo para evitar caracteres especiais problemáticos no caminho S3
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const storagePath = `${organizationId}/${sanitizedFileName}`;

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: "application/pdf",
        upsert: true
      });

    if (error) throw error;

    console.log(`[Storage] Upload concluído com sucesso: ${storagePath}`);
    return storagePath;
  } catch (error) {
    console.error(`[Storage] Erro ao fazer upload de ${fileName}:`, error.message);
    throw new Error(`Falha no upload para o Supabase Storage: ${error.message}`);
  }
}

/**
 * Baixa um arquivo do Supabase Storage.
 * @param {Object} supabase Cliente do Supabase.
 * @param {string} storagePath Caminho completo do arquivo no bucket (ex: "org_uuid/arquivo.pdf").
 * @returns {Promise<Buffer>} Buffer do arquivo baixado.
 */
export async function downloadFileFromStorage(supabase, storagePath) {
  if (!storagePath) {
    throw new Error("storagePath não fornecido para downloadFileFromStorage.");
  }

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(storagePath);

    if (error) throw error;

    // Converter blob/arrayBuffer retornado para Buffer do Node.js
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`[Storage] Erro ao fazer download de ${storagePath}:`, error.message);
    throw new Error(`Falha no download do arquivo do storage: ${error.message}`);
  }
}

/**
 * Exclui um arquivo do Supabase Storage.
 * @param {Object} supabase Cliente do Supabase.
 * @param {string} storagePath Caminho completo do arquivo.
 */
export async function deleteFileFromStorage(supabase, storagePath) {
  if (!storagePath) return;

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (error) throw error;
    console.log(`[Storage] Arquivo excluído com sucesso: ${storagePath}`);
  } catch (error) {
    console.error(`[Storage] Erro ao excluir arquivo ${storagePath}:`, error.message);
  }
}

/**
 * Exclui todos os arquivos pertencentes a uma organização no storage.
 * @param {Object} supabase Cliente do Supabase.
 * @param {string} organizationId UUID da organização.
 */
export async function deleteOrganizationFolderFromStorage(supabase, organizationId) {
  if (!organizationId) return;

  try {
    // Listar todos os arquivos na "pasta" da organização
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(organizationId, { limit: 1000 });

    if (listError) throw listError;

    if (files && files.length > 0) {
      const pathsToDelete = files.map(file => `${organizationId}/${file.name}`);
      const { data, error: removeError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(pathsToDelete);

      if (removeError) throw removeError;
      console.log(`[Storage] ${files.length} arquivos da organização ${organizationId} foram removidos do storage.`);
    }
  } catch (error) {
    console.error(`[Storage] Erro ao limpar arquivos da org ${organizationId}:`, error.message);
  }
}
