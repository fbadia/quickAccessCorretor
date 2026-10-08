import assert from "assert";
import crypto from "crypto";
import {
  encryptBuffer,
  decryptBuffer,
  isEncryptedBuffer,
  encryptText,
  decryptText,
  generateBlindIndex,
  parseKey
} from "./cryptoService.js";

console.log("=== INICIANDO TESTES DO CRYPTO SERVICE (LGPD / ADR-007) ===");

// 1. Chave de teste de 32 bytes (256 bits)
const testKey = crypto.randomBytes(32).toString("hex");
const hmacKey = crypto.randomBytes(32).toString("hex");

// Teste 1: Cifragem e Decifragem de Buffer (Simulando PDF)
console.log("\n[1] Testando Cifragem e Decifragem de Buffer...");
const originalPdfBuffer = Buffer.from("%PDF-1.4 Mock de Apólice com dados do segurado João Silva CPF 123.456.789-00");
const encryptedBuffer = encryptBuffer(originalPdfBuffer, testKey);

assert(isEncryptedBuffer(encryptedBuffer), "O buffer cifrado deve conter o magic header SNM1");
assert(!originalPdfBuffer.equals(encryptedBuffer), "O buffer cifrado deve ser diferente do original");

const decryptedBuffer = decryptBuffer(encryptedBuffer, testKey);
assert.strictEqual(decryptedBuffer.toString("utf8"), originalPdfBuffer.toString("utf8"), "O buffer decifrado deve ser idêntico ao original");
console.log("✅ Cifragem e decifragem de buffer validadas com sucesso!");

// Teste 2: Integridade e Proteção contra Adulteração (GCM Auth Tag)
console.log("\n[2] Testando Integridade contra Adulteração...");
const tamperedBuffer = Buffer.from(encryptedBuffer);
tamperedBuffer[tamperedBuffer.length - 1] ^= 0xff; // Inverte o último byte

assert.throws(
  () => decryptBuffer(tamperedBuffer, testKey),
  /integridade violada|chave incorreta/i,
  "Deve lançar erro ao detectar adulteração no ciphertext ou na auth tag"
);

const wrongKey = crypto.randomBytes(32).toString("hex");
assert.throws(
  () => decryptBuffer(encryptedBuffer, wrongKey),
  /integridade violada|chave incorreta/i,
  "Deve lançar erro com chave incorreta"
);
console.log("✅ Validação de integridade e rejeição de chave incorreta aprovadas!");

// Teste 3: Compatibilidade Regressiva com PDFs legados não-criptografados
console.log("\n[3] Testando Compatibilidade Regressiva com PDFs legados...");
const legacyPdfBuffer = Buffer.from("%PDF-1.4 Arquivo legado enviado antes da ADR-007");
assert(!isEncryptedBuffer(legacyPdfBuffer), "PDF legado não deve ser identificado como criptografado");
const handledLegacy = decryptBuffer(legacyPdfBuffer, testKey);
assert.strictEqual(handledLegacy.toString("utf8"), legacyPdfBuffer.toString("utf8"), "PDF legado deve ser retornado intacto");
console.log("✅ Compatibilidade regressiva com arquivos legados funcionando!");

// Teste 4: Cifragem e Decifragem de Textos (PII)
console.log("\n[4] Testando Cifragem e Decifragem de Textos (PII)...");
const sampleName = "Maria Aparecida dos Santos";
const sampleCpf = "123.456.789-00";
const samplePlate = "ABC-1D23";

const encName = encryptText(sampleName, testKey);
const encCpf = encryptText(sampleCpf, testKey);
const encPlate = encryptText(samplePlate, testKey);

assert(encName.startsWith("enc:v1:"), "Nome cifrado deve iniciar com prefixo enc:v1:");
assert.strictEqual(decryptText(encName, testKey), sampleName, "Nome decifrado deve bater exatamente");
assert.strictEqual(decryptText(encCpf, testKey), sampleCpf, "CPF decifrado deve bater exatamente");
assert.strictEqual(decryptText(encPlate, testKey), samplePlate, "Placa decifrada deve bater exatamente");

// Teste com valor nulo ou já em texto limpo
assert.strictEqual(encryptText(null, testKey), null, "Nulo deve permanecer nulo");
assert.strictEqual(decryptText("Nome Não Cifrado", testKey), "Nome Não Cifrado", "Texto limpo deve ser retornado sem erro");
console.log("✅ Cifragem e decifragem de texto aprovadas!");

// Teste 5: Blind Index Determinístico
console.log("\n[5] Testando Blind Indexing para Buscas...");
const bidx1 = generateBlindIndex("ABC-1D23", hmacKey);
const bidx2 = generateBlindIndex("abc1d23", hmacKey);
const bidx3 = generateBlindIndex("  abc-1d23  ", hmacKey);

assert.strictEqual(bidx1, bidx2, "Blind index deve ser insensível a caixa e pontuação");
assert.strictEqual(bidx1, bidx3, "Blind index deve ser insensível a espaços");

const cpfBidx1 = generateBlindIndex("123.456.789-00", hmacKey);
const cpfBidx2 = generateBlindIndex("12345678900", hmacKey);
assert.strictEqual(cpfBidx1, cpfBidx2, "Blind index de CPF formatado e limpo devem coincidir");
console.log("✅ Blind indexing determinístico validado!");

console.log("\n========================================================");
console.log("🎉 TODOS OS TESTES DO CRYPTO SERVICE PASSARAM COM SUCESSO!");
console.log("========================================================");
