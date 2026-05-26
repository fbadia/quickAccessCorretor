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
 * Verifica se um arquivo do Drive já foi processado para uma organização específica.
 */
export async function isFileProcessed(supabase, fileId, organizationId) {
  try {
    const { data, error } = await supabase
      .from("policies")
      .select("id")
      .eq("drive_file_id", fileId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  } catch (error) {
    console.error(`Erro ao verificar arquivo processado ${fileId}:`, error);
    return false;
  }
}

/**
 * Salva as informações extraídas no banco de dados, vinculadas a uma organização.
 * @param {Object} supabase Cliente do Supabase (service role).
 * @param {string} fileId ID do arquivo no Google Drive.
 * @param {Object} extractedData Dados extraídos pela API do Gemini.
 * @param {string} organizationId UUID da organização dona dos dados.
 */
export async function savePolicyData(supabase, fileId, extractedData, organizationId) {
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
          drive_file_id: fileId,
          raw_extracted_data: extractedData,
          organization_id: organizationId
        },
        { onConflict: "drive_file_id" }
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
    console.error(`Erro ao salvar dados da apólice (File ID: ${fileId}):`, error);
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
      console.log(`SuperAdmin ${superAdminEmail} não encontrado. Criando...`);

      const { error: createError } = await supabase.auth.admin.createUser({
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
        // O trigger do Supabase deve criar o profile automaticamente.
        // Garantir role superadmin e sem org:
        await supabase
          .from("profiles")
          .update({ role: "superadmin", organization_id: null })
          .eq("email", superAdminEmail);

        console.log(`SuperAdmin ${superAdminEmail} criado com sucesso.`);
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
