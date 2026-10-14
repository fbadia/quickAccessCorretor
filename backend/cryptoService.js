import crypto from "crypto";

/**
 * Módulo Criptográfico — SeguroNaMão (ADR-007 / LGPD)
 * 
 * Implementa criptografia autenticada AES-256-GCM para:
 * 1. Arquivos PDF armazenados no Supabase Storage (Envelope Binário com Magic Header)
 * 2. Dados textuais PII (Nome, CPF/CNPJ, Placa) no banco de dados (ALE)
 * 3. Blind Index determinístico via HMAC-SHA256 para buscas exatas seguras
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recomendado para GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const MAGIC_HEADER = Buffer.from("SNM1", "utf8"); // SeguroNaMão v1 Magic Header (4 bytes)
const TEXT_PREFIX = "enc:v1:";

/**
 * Converte e valida uma chave criptográfica de 256 bits (32 bytes).
 * @param {string|Buffer} keyInput Chave em string hex (64 chars) ou Buffer de 32 bytes.
 * @returns {Buffer} Buffer de 32 bytes.
 */
export function parseKey(keyInput) {
  if (!keyInput) {
    throw new Error("Chave criptográfica não fornecida.");
  }

  if (Buffer.isBuffer(keyInput)) {
    if (keyInput.length !== 32) {
      throw new Error(`Tamanho de chave inválido: esperado 32 bytes, recebido ${keyInput.length} bytes.`);
    }
    return keyInput;
  }

  const trimmed = keyInput.trim();
  // Se for hexadecimal de 64 caracteres
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  // Se a chave for fornecida como string genérica, deriva 32 bytes via SHA-256
  return crypto.createHash("sha256").update(trimmed).digest();
}

/**
 * Criptografa um Buffer (ex: arquivo PDF) utilizando AES-256-GCM.
 * Retorna um envelope binário auto-contido: [HEADER 4B][IV 12B][TAG 16B][CIPHERTEXT]
 * 
 * @param {Buffer} buffer Conteúdo original do arquivo.
 * @param {string|Buffer} key Chave AES-256 (32 bytes ou hex de 64 chars).
 * @returns {Buffer} Buffer criptografado com envelope.
 */
export function encryptBuffer(buffer, key) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("O argumento 'buffer' deve ser uma instância de Buffer.");
  }

  const keyBuffer = parseKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Envelope binário: MAGIC_HEADER (4) + IV (12) + AUTH_TAG (16) + CIPHERTEXT
  return Buffer.concat([MAGIC_HEADER, iv, authTag, ciphertext]);
}

/**
 * Verifica se um Buffer está criptografado no formato envelope SNM1.
 * @param {Buffer} buffer Buffer a inspecionar.
 * @returns {boolean}
 */
export function isEncryptedBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < MAGIC_HEADER.length + IV_LENGTH + AUTH_TAG_LENGTH) {
    return false;
  }
  return buffer.subarray(0, MAGIC_HEADER.length).equals(MAGIC_HEADER);
}

/**
 * Descriptografa um Buffer criptografado com encryptBuffer.
 * Se o buffer não for cifrado mas for um PDF válido (%PDF), retorna o próprio buffer (compatibilidade regressiva).
 * 
 * @param {Buffer} encryptedBuffer Buffer do arquivo recebido do Storage.
 * @param {string|Buffer} key Chave AES-256 correspondente.
 * @returns {Buffer} Buffer do arquivo descriptografado original.
 */
export function decryptBuffer(encryptedBuffer, key) {
  if (!Buffer.isBuffer(encryptedBuffer)) {
    throw new TypeError("O argumento 'encryptedBuffer' deve ser uma instância de Buffer.");
  }

  // Compatibilidade com arquivos legados não-criptografados
  if (!isEncryptedBuffer(encryptedBuffer)) {
    if (encryptedBuffer.subarray(0, 4).toString("utf8") === "%PDF") {
      console.warn("[Crypto] Arquivo legado não-criptografado detectado no storage. Retornando buffer original.");
      return encryptedBuffer;
    }
    throw new Error("Arquivo corrompido ou em formato inválido para descriptografia.");
  }

  const keyBuffer = parseKey(key);

  let offset = MAGIC_HEADER.length;
  const iv = encryptedBuffer.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const authTag = encryptedBuffer.subarray(offset, offset + AUTH_TAG_LENGTH);
  offset += AUTH_TAG_LENGTH;
  const ciphertext = encryptedBuffer.subarray(offset);

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new Error(`Falha na descriptografia do arquivo: integridade violada ou chave incorreta (${err.message})`);
  }
}

/**
 * Criptografa uma string de texto (PII) usando AES-256-GCM.
 * Formato retornado: "enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>"
 * 
 * @param {string} text Texto puro a criptografar.
 * @param {string|Buffer} key Chave AES-256.
 * @returns {string} String codificada.
 */
export function encryptText(text, key) {
  if (text === null || text === undefined || text === "") {
    return text;
  }

  const str = String(text);
  const keyBuffer = parseKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  const ciphertext = Buffer.concat([cipher.update(str, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${TEXT_PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Descriptografa uma string de texto cifrada com encryptText.
 * Se o texto não estiver cifrado (dado legado), retorna o texto original.
 * 
 * @param {string} cipherText String cifrada.
 * @param {string|Buffer} key Chave AES-256.
 * @returns {string} Texto original decifrado.
 */
export function decryptText(cipherText, key) {
  if (typeof cipherText !== "string" || !cipherText.startsWith(TEXT_PREFIX)) {
    return cipherText;
  }

  const parts = cipherText.slice(TEXT_PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Formato de texto cifrado inválido.");
  }

  const [ivHex, tagHex, dataHex] = parts;
  const keyBuffer = parseKey(key);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(dataHex, "hex");

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
  } catch (err) {
    throw new Error(`Falha na decifração de texto: ${err.message}`);
  }
}

/**
 * Gera um Blind Index determinístico via HMAC-SHA256 para buscas exatas seguras.
 * @param {string} text Valor original (ex: placa ou CPF).
 * @param {string|Buffer} hmacKey Chave HMAC secreta.
 * @returns {string} Hash SHA-256 em hexadecimal.
 */
export function generateBlindIndex(text, hmacKey) {
  if (!text) return null;
  if (!hmacKey) throw new Error("hmacKey é obrigatória para gerar blind index.");

  // Normalização estrita para garantir correspondência determinística:
  // Remove caracteres especiais, caixa alta/baixa e espaços
  const normalized = String(text)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  return crypto.createHmac("sha256", parseKey(hmacKey)).update(normalized).digest("hex");
}

// Campos com dados pessoais dentro do JSON extraído pelo Gemini (raw_extracted_data).
const EXTRACTED_PII_FIELDS = [
  ["segurado", "nome"],
  ["segurado", "cpf_cnpj"],
  ["veiculo", "placa"],
  ["changes", "insured_name"],
  ["changes", "cpf_cnpj"],
  ["changes", "plate"],
];

function mapExtractedPii(data, fn) {
  if (!data || typeof data !== "object") return data;
  const copy = structuredClone(data);
  for (const [group, field] of EXTRACTED_PII_FIELDS) {
    const value = copy[group]?.[field];
    if (value !== null && value !== undefined && value !== "") {
      copy[group][field] = fn(value);
    }
  }
  return copy;
}

/**
 * Cifra os campos pessoais do JSON extraído antes de gravá-lo em raw_extracted_data,
 * para que a coluna JSONB não exponha nome, CPF/CNPJ e placa num dump (ADR-007).
 * Valores já cifrados não são cifrados de novo.
 */
export function protectExtractedData(data, dbKey) {
  if (!dbKey) return data;
  return mapExtractedPii(data, v => (typeof v === "string" && v.startsWith(TEXT_PREFIX) ? v : encryptText(v, dbKey)));
}

/**
 * Inverso de protectExtractedData. Valores legados em texto claro passam inalterados.
 */
export function revealExtractedData(data, dbKey) {
  if (!dbKey) return data;
  return mapExtractedPii(data, v => decryptText(v, dbKey));
}

/**
 * Lê as chaves de criptografia do ambiente. Cada uma tem um único propósito:
 * a chave HMAC nunca reaproveita a chave AES do banco.
 * @returns {{ storageKey?: string, dbKey?: string, hmacKey?: string }}
 */
export function getEncryptionKeys() {
  return {
    storageKey: process.env.STORAGE_ENCRYPTION_KEY,
    dbKey: process.env.DB_ENCRYPTION_KEY,
    hmacKey: process.env.SEARCH_HMAC_KEY,
  };
}

/**
 * Valida a configuração de criptografia na inicialização do servidor.
 * - Configuração parcial é sempre inválida: com DB_ENCRYPTION_KEY sem SEARCH_HMAC_KEY,
 *   por exemplo, a deduplicação por blind index deixaria de funcionar.
 * - Em produção as três chaves são obrigatórias (ADR-007).
 * @param {boolean} isProduction
 */
export function assertEncryptionConfig(isProduction) {
  const keys = getEncryptionKeys();
  const names = { storageKey: "STORAGE_ENCRYPTION_KEY", dbKey: "DB_ENCRYPTION_KEY", hmacKey: "SEARCH_HMAC_KEY" };
  const missing = Object.keys(names).filter(k => !keys[k]).map(k => names[k]);

  if (missing.length === 0) {
    Object.values(keys).forEach(parseKey);
    return;
  }
  if (isProduction || missing.length < 3) {
    throw new Error(`Configuração de criptografia incompleta (ADR-007). Variáveis ausentes: ${missing.join(", ")}.`);
  }
  console.warn("[Crypto] ATENÇÃO: nenhuma chave de criptografia configurada. Dados serão gravados em texto claro (apenas para desenvolvimento local).");
}
