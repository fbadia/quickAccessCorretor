import { createClient } from "@supabase/supabase-js";

/**
 * Inicializa o cliente do Supabase com a chave de Service Role (bypass RLS).
 */
export function getSupabaseClient(supabaseUrl, serviceRoleKey) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

/**
 * Verifica se um arquivo no Supabase Storage já foi processado para uma organização específica.
 */
export async function isFileProcessed(supabase, storagePath, organizationId) {
  try {
    const { data, error } = await supabase
      .from("policies")
      .select("id")
      .eq("storage_path", storagePath)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  } catch (error) {
    console.error(`Erro ao verificar arquivo processado ${storagePath}:`, error);
    return false;
  }
}

/**
 * Salva as informações extraídas no banco de dados, vinculadas a uma organização.
 * @param {Object} supabase Cliente do Supabase (service role).
 * @param {string} storagePath Caminho do arquivo no Supabase Storage.
 * @param {Object} extractedData Dados extraídos pela API do Gemini.
 * @param {string} organizationId UUID da organização dona dos dados.
 * @param {string} [fileHash] Hash SHA-256 do arquivo PDF.
 */
export async function savePolicyData(supabase, storagePath, extractedData, organizationId, fileHash = null) {
  if (!organizationId) {
    throw new Error("organizationId é obrigatório para salvar dados de apólice.");
  }

  try {
    // 1. Obter ou Criar Seguradora (scoped por org)
    const insurerName = extractedData.seguradora || "Desconhecida";
    let { data: insurer, error: insError } = await supabase
      .from("insurers")
      .select("id")
      .eq("name", insurerName)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (insError) throw insError;

    if (!insurer) {
      const { data: newIns, error: newInsErr } = await supabase
        .from("insurers")
        .insert({ name: insurerName, organization_id: organizationId })
        .select("id")
        .single();

      if (newInsErr) throw newInsErr;
      insurer = newIns;
    }

    // 2. Obter ou Criar Cliente (scoped por org)
    const clientName = extractedData.segurado.nome;
    const cpfCnpj = extractedData.segurado.cpf_cnpj;

    let { data: client, error: cliError } = await supabase
      .from("clients")
      .select("id")
      .eq("cpf_cnpj", cpfCnpj)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (cliError) throw cliError;

    if (!client) {
      const { data: newCli, error: newCliErr } = await supabase
        .from("clients")
        .insert({ name: clientName, cpf_cnpj: cpfCnpj, organization_id: organizationId })
        .select("id")
        .single();

      if (newCliErr) throw newCliErr;
      client = newCli;
    } else {
      await supabase
        .from("clients")
        .update({ name: clientName })
        .eq("id", client.id);
    }

    // 3. Criar ou Atualizar Apólice (scoped por org)
    const policyNumber = extractedData.apolice.numero;
    const startDate = extractedData.apolice.inicio_vigencia;
    const endDate = extractedData.apolice.fim_vigencia;

    const { data: policy, error: polError } = await supabase
      .from("policies")
      .upsert(
        {
          client_id: client.id,
          insurer_id: insurer.id,
          policy_number: policyNumber,
          start_date: startDate,
          end_date: endDate,
          storage_path: storagePath,
          file_hash: fileHash,
          raw_extracted_data: extractedData,
          organization_id: organizationId
        },
        { onConflict: "storage_path" }
      )
      .select("id")
      .single();

    if (polError) throw polError;

    // 4. Recriar veículo associado à apólice
    await supabase
      .from("vehicles")
      .delete()
      .eq("policy_id", policy.id);

    const vehiclePlate = extractedData.veiculo.placa;
    const vehicleModel = extractedData.veiculo.marca_modelo;
    const vehicleYear = extractedData.veiculo.ano;

    const { error: vehError } = await supabase
      .from("vehicles")
      .insert({
        policy_id: policy.id,
        plate: vehiclePlate,
        brand_model: vehicleModel,
        year: vehicleYear,
        organization_id: organizationId
      });

    if (vehError) throw vehError;

    console.log(`Sucesso ao salvar apólice ${policyNumber} de ${clientName} (Org: ${organizationId})`);
    return { success: true, policyId: policy.id };
  } catch (error) {
    console.error(`Erro ao salvar dados da apólice (Storage Path: ${storagePath}):`, error);
    throw error;
  }
}

/**
 * Popula seguradoras básicas para uma organização específica.
 * @param {Object} supabase Cliente do Supabase.
 * @param {string} organizationId UUID da organização.
 */
export async function seedInsurers(supabase, organizationId) {
  const defaultInsurers = [
    {
      name: "Porto Seguro",
      assistance_phone: "0800-727-0800",
      assistance_whatsapp: "551130039303",
      claims_phone: "3337-6786",
      claims_url: "https://www.portoseguro.com.br/sinistro"
    },
    {
      name: "Yelum",
      assistance_phone: "0800-701-4120",
      assistance_whatsapp: "5511995821234",
      claims_phone: "0800-701-4121",
      claims_url: "https://www.yelum.com.br/servicos/sinistro"
    },
    {
      name: "Bradesco Seguros",
      assistance_phone: "0800-701-2757",
      assistance_whatsapp: "5511988880000",
      claims_phone: "4004-2757",
      claims_url: "https://www.bradescoseguros.com.br/sinistro"
    },
    {
      name: "HDI Seguros",
      assistance_phone: "0800-722-7149",
      assistance_whatsapp: "5511999991234",
      claims_phone: "3003-5390",
      claims_url: "https://www.hdiseguros.com.br/sinistro"
    },
    {
      name: "Allianz Seguros",
      assistance_phone: "0800-013-0700",
      assistance_whatsapp: "5511977771111",
      claims_phone: "3156-4340",
      claims_url: "https://www.allianz.com.br/sinistro"
    }
  ];

  for (const insurer of defaultInsurers) {
    try {
      const { error } = await supabase
        .from("insurers")
        .upsert(
          { ...insurer, organization_id: organizationId },
          { onConflict: "name,organization_id" }
        );
      if (error) console.error(`Erro ao seedar seguradora ${insurer.name}:`, error);
    } catch (err) {
      console.error(`Erro ao seedar seguradora ${insurer.name}:`, err);
    }
  }
}

/**
 * Garante que o superadmin (fbadia@gmail.com) exista no sistema sem vinculação a uma org.
 */
export async function seedSuperAdmin(supabase) {
  const superAdminEmail = "fbadia@gmail.com";
  try {
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", superAdminEmail)
      .maybeSingle();

    if (checkError) {
      console.error("Erro ao verificar superadmin existente:", checkError);
      return;
    }

    if (!existingProfile) {
      console.log(`SuperAdmin ${superAdminEmail} não encontrado no profiles. Verificando no Auth...`);

      // Listar usuários para encontrar se já existe no Auth
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) {
        console.error("Erro ao listar usuários do Auth:", listError.message);
        return;
      }

      const authUser = listData.users.find(u => u.email === superAdminEmail);

      if (authUser) {
        console.log(`SuperAdmin já existe no Auth (ID: ${authUser.id}). Criando perfil correspondente...`);
        
        // Fazer upsert para garantir a inserção
        const { error: insertError } = await supabase
          .from("profiles")
          .upsert({
            id: authUser.id,
            email: superAdminEmail,
            name: authUser.user_metadata?.name || "Flávio",
            role: "superadmin",
            organization_id: null,
            is_active: true
          });

        if (insertError) {
          console.error("Erro ao criar perfil do superadmin existente:", insertError.message);
        } else {
          console.log(`Perfil do SuperAdmin criado e sincronizado.`);
        }
      } else {
        console.log("SuperAdmin não existe no Auth. Criando usuário e perfil...");
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: superAdminEmail,
          password: "Badia@123",
          email_confirm: true,
          user_metadata: {
            name: "Flávio",
            role: "superadmin"
          }
        });

        if (createError) {
          console.error("Erro ao criar superadmin:", createError.message);
        } else {
          // Garantir perfil atualizado no profiles (upsert/update)
          await supabase
            .from("profiles")
            .upsert({
              id: newUser.user.id,
              email: superAdminEmail,
              name: "Flávio",
              role: "superadmin",
              organization_id: null,
              is_active: true
            });
          console.log(`SuperAdmin ${superAdminEmail} criado com sucesso.`);
        }
      }
    } else {
      // Garantir que o perfil está correto
      await supabase
        .from("profiles")
        .update({ role: "superadmin", organization_id: null, is_active: true })
        .eq("id", existingProfile.id);

      console.log(`SuperAdmin ${superAdminEmail} verificado e atualizado.`);
    }
  } catch (err) {
    console.error("Erro inesperado no seed do superadmin:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// ENDOSSOS
// ─────────────────────────────────────────────────────────────

/**
 * Normaliza um número de apólice removendo tudo que não seja letra ou dígito,
 * e convertendo para maiúsculas. Mesmo padrão aplicado pelo prompt do Gemini.
 * @param {string} policyNumber
 * @returns {string}
 */
function normalizePolicyNumber(policyNumber) {
  if (!policyNumber) return "";
  return policyNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Aplica as alterações de um endosso nas tabelas de negócio (policies, clients, vehicles).
 * Chamado tanto no fluxo de upload quanto na vinculação manual.
 *
 * @param {Object} supabase  Cliente do Supabase (service role).
 * @param {string} policyId  UUID da apólice base a ser atualizada.
 * @param {string} endorsementType  Tipo do endosso.
 * @param {Object} changes   Objeto com os campos alterados (pode ter nulls).
 * @param {Object} rawExtractedData  JSON completo extraído pelo Gemini.
 */
async function applyEndorsementChanges(supabase, policyId, endorsementType, changes, rawExtractedData) {
  // 1. Buscar a apólice para obter client_id
  const { data: policy, error: policyFetchError } = await supabase
    .from("policies")
    .select("id, client_id")
    .eq("id", policyId)
    .maybeSingle();

  if (policyFetchError || !policy) {
    throw new Error(`Não foi possível buscar a apólice ${policyId} para aplicar o endosso.`);
  }

  // 2. Aplicar alterações conforme o tipo
  if (endorsementType === "vehicle_change") {
    // Marcar veículo atual como substituído
    await supabase
      .from("vehicles")
      .update({ is_current: false, replaced_at: new Date().toISOString() })
      .eq("policy_id", policyId)
      .eq("is_current", true);

    // Inserir novo veículo vigente
    if (changes.plate || changes.brand_model || changes.year) {
      const { error: vehError } = await supabase
        .from("vehicles")
        .insert({
          policy_id: policyId,
          plate: changes.plate || null,
          brand_model: changes.brand_model || null,
          year: changes.year || null,
          is_current: true,
          organization_id: policy.organization_id
        });
      if (vehError) throw vehError;
    }
  }

  if (endorsementType === "insured_change") {
    const clientUpdate = {};
    if (changes.insured_name) clientUpdate.name = changes.insured_name;
    if (changes.cpf_cnpj) clientUpdate.cpf_cnpj = changes.cpf_cnpj;

    if (Object.keys(clientUpdate).length > 0) {
      const { error: cliError } = await supabase
        .from("clients")
        .update(clientUpdate)
        .eq("id", policy.client_id);
      if (cliError) throw cliError;
    }
  }

  // Para todos os tipos: atualizar raw_extracted_data e datas da apólice se fornecidas
  const policyUpdate = {
    raw_extracted_data: rawExtractedData
  };
  if (changes.start_date) policyUpdate.start_date = changes.start_date;
  if (changes.end_date) policyUpdate.end_date = changes.end_date;

  const { error: polUpdateError } = await supabase
    .from("policies")
    .update(policyUpdate)
    .eq("id", policyId);
  if (polUpdateError) throw polUpdateError;
}

/**
 * Salva um endosso extraído do Gemini.
 * Busca a apólice base pelo policy_number. Se encontrada, aplica as alterações e
 * salva o endosso com status "applied". Se não encontrada, salva como "pending".
 *
 * @param {Object} supabase         Cliente do Supabase (service role).
 * @param {string} storagePath      Caminho do arquivo no Supabase Storage.
 * @param {Object} extractedData    Dados extraídos pelo Gemini (document_type = "endorsement").
 * @param {string} organizationId   UUID da organização.
 * @param {string} fileHash         SHA-256 do arquivo PDF.
 * @returns {Promise<{applied: boolean, pending: boolean, endorsementId: string}>}
 */
export async function saveEndorsementData(supabase, storagePath, extractedData, organizationId, fileHash) {
  if (!organizationId) {
    throw new Error("organizationId é obrigatório para salvar dados de endosso.");
  }

  const rawPolicyNumber = extractedData.policy_number || "";
  const normalizedPolicyNumber = normalizePolicyNumber(rawPolicyNumber);

  // 1. Buscar a apólice base pelo número normalizado na organização
  const { data: policy, error: policySearchError } = await supabase
    .from("policies")
    .select("id, client_id")
    .eq("organization_id", organizationId)
    .maybeSingle()
    .filter("policy_number", "ilike", normalizedPolicyNumber);

  if (policySearchError) {
    console.error("[Endosso] Erro ao buscar apólice base:", policySearchError.message);
  }

  const endorsementType = extractedData.endorsement_type || "other";
  const issuedAt = extractedData.issued_at || null;
  const changes = extractedData.changes || {};

  if (policy) {
    // ── APÓLICE ENCONTRADA ────────────────────────────────────
    console.log(`[Endosso] Apólice base encontrada (ID: ${policy.id}). Aplicando endosso...`);

    // Aplicar alterações nas tabelas de negócio
    await applyEndorsementChanges(supabase, policy.id, endorsementType, changes, extractedData);

    // Salvar registro do endosso
    const { data: endorsement, error: insError } = await supabase
      .from("endorsements")
      .insert({
        policy_id: policy.id,
        organization_id: organizationId,
        endorsement_number: extractedData.endorsement_number || null,
        endorsement_type: endorsementType,
        status: "applied",
        issued_at: issuedAt,
        expires_at: null,
        storage_path: storagePath,
        file_hash: fileHash,
        raw_extracted_data: extractedData
      })
      .select("id")
      .single();

    if (insError) throw insError;

    console.log(`[Endosso] Endosso ${extractedData.endorsement_number || "s/n"} aplicado com sucesso (ID: ${endorsement.id}).`);
    return { applied: true, pending: false, endorsementId: endorsement.id };

  } else {
    // ── APÓLICE NÃO ENCONTRADA ────────────────────────────────
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    console.log(`[Endosso] Apólice base não encontrada para número "${rawPolicyNumber}". Salvando como pendente...`);

    const { data: endorsement, error: insError } = await supabase
      .from("endorsements")
      .insert({
        policy_id: null,
        organization_id: organizationId,
        endorsement_number: extractedData.endorsement_number || null,
        endorsement_type: endorsementType,
        status: "pending",
        issued_at: issuedAt,
        expires_at: expiresAt,
        storage_path: storagePath,
        file_hash: fileHash,
        raw_extracted_data: extractedData
      })
      .select("id")
      .single();

    if (insError) throw insError;

    console.log(`[Endosso] Endosso pendente criado (ID: ${endorsement.id}). Expira em: ${expiresAt}`);
    return { applied: false, pending: true, endorsementId: endorsement.id };
  }
}

/**
 * Lista todos os endossos com status "pending" da organização,
 * ordenados pelo prazo de expiração mais próximo.
 *
 * @param {Object} supabase       Cliente do Supabase (service role).
 * @param {string} organizationId UUID da organização.
 * @returns {Promise<Array>}      Lista de endossos pendentes com `days_remaining`.
 */
export async function getPendingEndorsements(supabase, organizationId) {
  const { data, error } = await supabase
    .from("endorsements")
    .select("id, endorsement_number, endorsement_type, issued_at, expires_at, storage_path, raw_extracted_data, created_at")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("expires_at", { ascending: true });

  if (error) throw error;

  const now = Date.now();
  return (data || []).map(e => ({
    ...e,
    days_remaining: e.expires_at
      ? Math.max(0, Math.ceil((new Date(e.expires_at).getTime() - now) / (1000 * 60 * 60 * 24)))
      : null
  }));
}

/**
 * Vincula manualmente um endosso pendente a uma apólice existente.
 * Aplica as alterações do endosso e atualiza o status para "applied".
 *
 * @param {Object} supabase        Cliente do Supabase (service role).
 * @param {string} endorsementId   UUID do endosso pendente.
 * @param {string} policyId        UUID da apólice a vincular.
 * @param {string} organizationId  UUID da organização (para validação de escopo).
 */
export async function linkEndorsementToPolicy(supabase, endorsementId, policyId, organizationId) {
  // Verificar que o endosso pertence à org e está pendente
  const { data: endorsement, error: endErr } = await supabase
    .from("endorsements")
    .select("id, endorsement_type, raw_extracted_data, organization_id, status")
    .eq("id", endorsementId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (endErr || !endorsement) {
    throw new Error("Endosso não encontrado na sua organização.");
  }
  if (endorsement.status !== "pending") {
    throw new Error("Este endosso não está pendente e não pode ser vinculado manualmente.");
  }

  // Verificar que a apólice pertence à org
  const { data: policy, error: polErr } = await supabase
    .from("policies")
    .select("id, organization_id")
    .eq("id", policyId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (polErr || !policy) {
    throw new Error("Apólice não encontrada na sua organização.");
  }

  // Aplicar as alterações do endosso
  const changes = endorsement.raw_extracted_data?.changes || {};
  await applyEndorsementChanges(supabase, policyId, endorsement.endorsement_type, changes, endorsement.raw_extracted_data);

  // Atualizar o endosso para "applied"
  const { error: updateErr } = await supabase
    .from("endorsements")
    .update({
      policy_id: policyId,
      status: "applied",
      expires_at: null
    })
    .eq("id", endorsementId);

  if (updateErr) throw updateErr;

  console.log(`[Endosso] Endosso ${endorsementId} vinculado manualmente à apólice ${policyId}.`);
}

/**
 * Remove endossos pendentes vencidos (expires_at < agora).
 * Deleta o arquivo do Storage ANTES do registro no banco para evitar órfãos.
 *
 * @param {Object} supabase  Cliente do Supabase (service role).
 * @param {Function} deleteFileFn  Função de deleção do Storage (deleteFileFromStorage).
 */
export async function runExpiredEndorsementsCleanup(supabase, deleteFileFn) {
  try {
    const { data: expired, error } = await supabase
      .from("endorsements")
      .select("id, storage_path, endorsement_number")
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    if (error) {
      console.error("[Cleanup] Erro ao buscar endossos expirados:", error.message);
      return;
    }

    if (!expired || expired.length === 0) {
      console.log("[Cleanup] Nenhum endosso expirado encontrado.");
      return;
    }

    console.log(`[Cleanup] ${expired.length} endosso(s) expirado(s) encontrado(s). Removendo...`);

    for (const endorsement of expired) {
      try {
        // 1. Deletar arquivo do Storage PRIMEIRO (evita registro órfão se falhar depois)
        if (endorsement.storage_path) {
          await deleteFileFn(supabase, endorsement.storage_path);
        }

        // 2. Deletar registro do banco
        const { error: delError } = await supabase
          .from("endorsements")
          .delete()
          .eq("id", endorsement.id);

        if (delError) {
          console.error(`[Cleanup] Erro ao deletar endosso ${endorsement.id} do banco:`, delError.message);
        } else {
          console.log(`[Cleanup] Endosso ${endorsement.endorsement_number || endorsement.id} removido com sucesso.`);
        }
      } catch (itemErr) {
        console.error(`[Cleanup] Erro ao processar endosso ${endorsement.id}:`, itemErr.message);
        // Continua para o próximo item
      }
    }
  } catch (err) {
    console.error("[Cleanup] Erro inesperado no job de expiração:", err.message);
  }
}
