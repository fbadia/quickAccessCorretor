/**
 * Backfill LGPD (ADR-007 / Story 1.4) — cifra os dados pessoais gravados antes da criptografia.
 *
 * Cobre:
 *   - clients.name, clients.cpf_cnpj (+ cpf_bidx)
 *   - vehicles.plate (+ plate_bidx)
 *   - policies.raw_extracted_data e endorsements.raw_extracted_data (campos pessoais do JSON)
 *   - nomes de arquivo no Storage: PDFs antigos usavam o nome original (ex.
 *     "Apolice-Fulano-ABC1D23-Porto.pdf"), que expõe nome e placa no bucket e em
 *     storage_path. São renomeados para {orgId}/{file_hash}.pdf (ou legacy-{id}.pdf).
 *
 * Idempotente: valores já cifrados (enc:v1:) e valores anonimizados são ignorados, então pode
 * ser executado mais de uma vez com segurança.
 *
 * Uso (na pasta backend/, com as três chaves no .env):
 *   node encryptLegacyData.js           # simulação: só mostra o que seria alterado
 *   node encryptLegacyData.js --apply   # grava as alterações
 *
 * Nunca imprime dados pessoais — apenas IDs e contagens.
 */
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { getSupabaseClient } from "./dbService.js";
import {
  assertEncryptionConfig,
  getEncryptionKeys,
  encryptText,
  generateBlindIndex,
  protectExtractedData,
} from "./cryptoService.js";

// Lê o .env ao lado deste arquivo, independentemente da pasta de onde o processo foi iniciado.
// Em container não há .env e as variáveis vêm do ambiente (dotenv ignora o arquivo ausente).
dotenv.config({ path: fileURLToPath(new URL(".env", import.meta.url)) });

const APPLY = process.argv.includes("--apply");
const PAGE_SIZE = 500;
const ANONYMIZED_VALUES = new Set(["ANONIMIZADO", "TITULAR ANONIMIZADO", "TITULAR ANONIMIZADO (LGPD)"]);

const isEncrypted = (v) => typeof v === "string" && v.startsWith("enc:v1:");
const needsEncryption = (v) => typeof v === "string" && v !== "" && !isEncrypted(v) && !ANONYMIZED_VALUES.has(v);

async function fetchAll(supabase, table, columns) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao ler ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function applyUpdates(supabase, table, updates, stats) {
  for (const { id, patch } of updates) {
    if (!APPLY) continue;
    const { error } = await supabase.from(table).update(patch).eq("id", id);
    if (error) {
      stats.errors++;
      console.error(`  ✗ ${table} ${id}: ${error.message}`);
    } else {
      stats.written++;
    }
  }
}

async function backfillClients(supabase, { dbKey, hmacKey }) {
  const rows = await fetchAll(supabase, "clients", "id, name, cpf_cnpj, cpf_bidx, organization_id");
  const updates = [];
  const bidxByOrg = new Map();

  for (const row of rows) {
    const patch = {};
    if (needsEncryption(row.name)) patch.name = encryptText(row.name, dbKey);
    if (needsEncryption(row.cpf_cnpj)) {
      patch.cpf_cnpj = encryptText(row.cpf_cnpj, dbKey);
      if (!row.cpf_bidx) patch.cpf_bidx = generateBlindIndex(row.cpf_cnpj, hmacKey);
    }

    // Detecta CPFs duplicados na mesma organização (o blind index deixaria de ser único)
    const bidx = patch.cpf_bidx || row.cpf_bidx;
    if (bidx) {
      const key = `${row.organization_id}:${bidx}`;
      if (bidxByOrg.has(key)) console.warn(`  ⚠ clients ${row.id}: mesmo CPF/CNPJ do cliente ${bidxByOrg.get(key)} na organização`);
      else bidxByOrg.set(key, row.id);
    }

    if (Object.keys(patch).length) updates.push({ id: row.id, patch });
  }
  return { table: "clients", total: rows.length, updates };
}

async function backfillVehicles(supabase, { dbKey, hmacKey }) {
  const rows = await fetchAll(supabase, "vehicles", "id, plate, plate_bidx");
  const updates = [];
  for (const row of rows) {
    if (!needsEncryption(row.plate)) continue;
    const patch = { plate: encryptText(row.plate, dbKey) };
    if (!row.plate_bidx) patch.plate_bidx = generateBlindIndex(row.plate, hmacKey);
    updates.push({ id: row.id, patch });
  }
  return { table: "vehicles", total: rows.length, updates };
}

async function backfillRawExtracted(supabase, table, { dbKey }) {
  const rows = await fetchAll(supabase, table, "id, raw_extracted_data");
  const updates = [];
  for (const row of rows) {
    if (!row.raw_extracted_data) continue;
    const protectedData = protectExtractedData(row.raw_extracted_data, dbKey);
    if (JSON.stringify(protectedData) !== JSON.stringify(row.raw_extracted_data)) {
      updates.push({ id: row.id, patch: { raw_extracted_data: protectedData } });
    }
  }
  return { table: `${table}.raw_extracted_data`, updateTable: table, total: rows.length, updates };
}

// Caminho já no formato sem dados pessoais: {orgId}/{sha256}.pdf ou {orgId}/legacy-{uuid}.pdf
const SAFE_STORAGE_NAME = /^([0-9a-f]{64}|legacy-[0-9a-f-]{36})\.pdf$/;

function planStorageRenames(rows, table) {
  const updates = [];
  for (const row of rows) {
    if (!row.storage_path) continue;
    const [orgFolder, ...rest] = row.storage_path.split("/");
    const name = rest.join("/");
    if (SAFE_STORAGE_NAME.test(name)) continue;
    const target = `${orgFolder}/${row.file_hash ? row.file_hash : `legacy-${row.id}`}.pdf`;
    updates.push({ id: row.id, from: row.storage_path, to: target });
  }
  return { table: `${table}.storage_path (renomear)`, renameTable: table, total: rows.length, updates };
}

async function applyRenames(supabase, plan, stats) {
  if (!APPLY) return;
  for (const { id, from, to } of plan.updates) {
    const { error: moveErr } = await supabase.storage.from("policies").move(from, to);
    // "not found": arquivo já ausente no bucket — só corrige a referência no banco
    if (moveErr && !/not.?found/i.test(moveErr.message)) {
      stats.errors++;
      console.error(`  ✗ ${plan.renameTable} ${id}: falha ao renomear no Storage (${moveErr.message})`);
      continue;
    }
    const { error: dbErr } = await supabase.from(plan.renameTable).update({ storage_path: to }).eq("id", id);
    if (dbErr) {
      // Desfaz o move para o banco não apontar para um arquivo inexistente
      if (!moveErr) await supabase.storage.from("policies").move(to, from);
      stats.errors++;
      console.error(`  ✗ ${plan.renameTable} ${id}: falha ao atualizar storage_path (${dbErr.message})`);
    } else {
      stats.written++;
    }
  }
}

async function main() {
  // Exige as três chaves: um backfill parcial deixaria dados sem blind index
  assertEncryptionConfig(true);
  const keys = getEncryptionKeys();
  const supabase = getSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  console.log(`=== Backfill LGPD (ADR-007) — modo: ${APPLY ? "APLICAR" : "SIMULAÇÃO (use --apply para gravar)"} ===\n`);

  const plans = [
    await backfillClients(supabase, keys),
    await backfillVehicles(supabase, keys),
    await backfillRawExtracted(supabase, "policies", keys),
    await backfillRawExtracted(supabase, "endorsements", keys),
    planStorageRenames(await fetchAll(supabase, "policies", "id, storage_path, file_hash"), "policies"),
    planStorageRenames(await fetchAll(supabase, "endorsements", "id, storage_path, file_hash"), "endorsements"),
  ];

  let totalErrors = 0;
  for (const plan of plans) {
    const stats = { written: 0, errors: 0 };
    if (plan.renameTable) await applyRenames(supabase, plan, stats);
    else await applyUpdates(supabase, plan.updateTable || plan.table, plan.updates, stats);
    totalErrors += stats.errors;
    const result = APPLY ? ` | gravados: ${stats.written} | erros: ${stats.errors}` : "";
    console.log(`${plan.table.padEnd(38)} registros: ${String(plan.total).padStart(5)} | a alterar: ${String(plan.updates.length).padStart(5)}${result}`);
  }

  if (!APPLY) console.log("\nNada foi gravado. Rode com --apply para aplicar.");
  else if (totalErrors) {
    console.log(`\n${totalErrors} erro(s). O script é idempotente: corrija e rode de novo.`);
    process.exitCode = 1;
  } else console.log("\n✅ Backfill concluído.");
}

main().catch((err) => {
  console.error(`Falha no backfill: ${err.message}`);
  process.exit(1);
});
