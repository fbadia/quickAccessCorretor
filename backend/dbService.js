import { createClient } from "@supabase/supabase-js";

/**
 * Inicializa o cliente do Supabase com a chave de Service Role (bypass RLS).
 * @param {string} supabaseUrl URL do projeto Supabase.
 * @param {string} serviceRoleKey Chave Service Role.
 * @returns {Object} Cliente do Supabase.
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
 * Verifica se um arquivo do Drive já foi processado anteriormente.
 * @param {Object} supabase Cliente do Supabase.
 * @param {string} fileId ID do arquivo no Google Drive.
 * @returns {Promise<boolean>} True se o arquivo já foi processado.
 */
export async function isFileProcessed(supabase, fileId) {
  try {
    const { data, error } = await supabase
      .from("policies")
      .select("id")
      .eq("drive_file_id", fileId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  } catch (error) {
    console.error(`Erro ao verificar arquivo processado ${fileId}:`, error);
    return false; // Retorna false por segurança, processando novamente se falhar
  }
}

/**
 * Salva as informações extraídas no banco de dados do Supabase.
 * Executa as operações necessárias de cadastro de Seguradora, Cliente, Apólice e Veículo.
 * @param {Object} supabase Cliente do Supabase.
 * @param {string} fileId ID do arquivo no Google Drive.
 * @param {Object} extractedData Dados extraídos pela API do Gemini.
 * @returns {Promise<Object>} Resultado da gravação.
 */
export async function savePolicyData(supabase, fileId, extractedData) {
  try {
    // 1. Obter ou Criar Seguradora
    const insurerName = extractedData.seguradora || "Desconhecida";
    let { data: insurer, error: insError } = await supabase
      .from("insurers")
      .select("id")
      .eq("name", insurerName)
      .maybeSingle();

    if (insError) throw insError;

    if (!insurer) {
      const { data: newIns, error: newInsErr } = await supabase
        .from("insurers")
        .insert({ name: insurerName })
        .select("id")
        .single();
      
      if (newInsErr) throw newInsErr;
      insurer = newIns;
    }

    // 2. Obter ou Criar Cliente
    const clientName = extractedData.segurado.nome;
    const cpfCnpj = extractedData.segurado.cpf_cnpj;
    
    let { data: client, error: cliError } = await supabase
      .from("clients")
      .select("id")
      .eq("cpf_cnpj", cpfCnpj)
      .maybeSingle();

    if (cliError) throw cliError;

    if (!client) {
      const { data: newCli, error: newCliErr } = await supabase
        .from("clients")
        .insert({ name: clientName, cpf_cnpj: cpfCnpj })
        .select("id")
        .single();
      
      if (newCliErr) throw newCliErr;
      client = newCli;
    } else {
      // Atualizar o nome se estiver desatualizado
      await supabase
        .from("clients")
        .update({ name: clientName })
        .eq("id", client.id);
    }

    // 3. Criar ou Atualizar Apólice (Upsert baseado em drive_file_id)
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
          raw_extracted_data: extractedData
        },
        { onConflict: "drive_file_id" }
      )
      .select("id")
      .single();

    if (polError) throw polError;

    // 4. Limpar veículo antigo associado a esta apólice (se houver) e inserir o novo
    // Como a tabela de veículos é associada por policy_id, e a apólice foi atualizada,
    // podemos deletar os veículos antigos da apólice para garantir dados limpos.
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
        year: vehicleYear
      });

    if (vehError) throw vehError;

    console.log(`Sucesso ao salvar apólice ${policyNumber} de ${clientName} (Placa: ${vehiclePlate})`);
    return { success: true, policyId: policy.id };
  } catch (error) {
    console.error(`Erro ao salvar dados da apólice (File ID: ${fileId}) no Supabase:`, error);
    throw error;
  }
}

/**
 * Popula seguradoras básicas caso elas não existam no banco.
 * @param {Object} supabase Cliente do Supabase.
 */
export async function seedInsurers(supabase) {
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

  console.log("Iniciando seed de seguradoras padrão...");
  for (const insurer of defaultInsurers) {
    try {
      const { error } = await supabase
        .from("insurers")
        .upsert(insurer, { onConflict: "name" });
      
      if (error) {
        console.error(`Erro ao seedar seguradora ${insurer.name}:`, error);
      }
    } catch (err) {
      console.error(`Erro ao seedar seguradora ${insurer.name}:`, err);
    }
  }
  console.log("Seed de seguradoras concluído.");
}

/**
 * Realiza o seed do usuário administrador padrão caso ele não exista.
 * @param {Object} supabase Cliente do Supabase com Service Role.
 */
export async function seedAdminUser(supabase) {
  const adminEmail = "fbadia@gmail.com";
  try {
    // 1. Verificar se o profile do administrador já existe no banco
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", adminEmail)
      .maybeSingle();

    if (checkError) {
      console.error("Erro ao verificar admin existente:", checkError);
      return;
    }

    if (!existingProfile) {
      console.log(`Usuário admin ${adminEmail} não encontrado no profiles. Criando no Auth...`);
      
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: "Badia@123",
        email_confirm: true,
        user_metadata: {
          name: "Flávio",
          role: "admin"
        }
      });

      if (createError) {
        console.error("Erro ao criar usuário admin no Supabase Auth:", createError.message);
      } else {
        console.log(`Usuário admin ${adminEmail} criado com sucesso via seed!`);
      }
    } else {
      console.log(`Usuário admin ${adminEmail} já existe no sistema.`);
    }
  } catch (err) {
    console.error("Erro inesperado no seed do admin:", err.message);
  }
}

