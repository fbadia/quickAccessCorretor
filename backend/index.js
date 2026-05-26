import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { getDriveClient, listPdfFiles, downloadFile, createOrganizationFolder } from "./driveService.js";
import { extractPolicyData } from "./geminiService.js";
import { getSupabaseClient, isFileProcessed, savePolicyData, seedInsurers, seedSuperAdmin } from "./dbService.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// ─────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────
const allowedOriginRegex = /^(https:\/\/quick-access-corretor\.vercel\.app|https:\/\/.*\.vercel\.app|http:\/\/localhost:\d+)$/;

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOriginRegex.test(origin)) return callback(null, true);
    return callback(new Error("Origem não permitida pelo CORS."), false);
  },
  credentials: true
}));
app.use(express.json());

// ─────────────────────────────────────────────────────────────
// INICIALIZAÇÃO DE CLIENTES
// ─────────────────────────────────────────────────────────────
let supabase;
let drive;

try {
  supabase = getSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    drive = getDriveClient(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else {
    console.warn("GOOGLE_SERVICE_ACCOUNT_JSON não configurado. Sincronização indisponível.");
  }

  seedSuperAdmin(supabase);
} catch (error) {
  console.error("Erro na inicialização:", error.message);
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE DE AUTENTICAÇÃO
// ─────────────────────────────────────────────────────────────

/**
 * Autentica o Bearer token e anexa user + profile ao req.
 * Rejeita se token inválido, perfil inexistente, usuário ou org desabilitados.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Cabeçalho de autorização ausente." });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token ausente." });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: "Sessão inválida ou expirada." });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, organization_id, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) return res.status(401).json({ error: "Perfil não encontrado." });
    if (!profile.is_active) return res.status(403).json({ error: "Usuário desabilitado." });

    // Verificar se a org está ativa (exceto para superadmin)
    if (profile.role !== "superadmin" && profile.organization_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("status")
        .eq("id", profile.organization_id)
        .maybeSingle();

      if (!org || org.status !== "active") {
        return res.status(403).json({ error: "Organização desabilitada ou não encontrada." });
      }
    }

    req.user = user;
    req.profile = profile;
    next();
  } catch (err) {
    console.error("Erro no middleware de autenticação:", err.message);
    res.status(500).json({ error: "Erro interno de autenticação." });
  }
}

/** Garante que o usuário autenticado é superadmin. */
function requireSuperAdmin(req, res, next) {
  if (req.profile?.role !== "superadmin") {
    return res.status(403).json({ error: "Acesso restrito a superadmins." });
  }
  next();
}

/** Garante que o usuário autenticado é admin de org. */
function requireOrgAdmin(req, res, next) {
  if (req.profile?.role !== "admin") {
    return res.status(403).json({ error: "Acesso restrito a administradores de organização." });
  }
  next();
}

// ─────────────────────────────────────────────────────────────
// ESTADO DE SINCRONIZAÇÃO (em memória por org)
// ─────────────────────────────────────────────────────────────
const syncStates = {}; // { [orgId]: syncState }

function getSyncState(orgId) {
  if (!syncStates[orgId]) {
    syncStates[orgId] = {
      status: "idle",
      lastRun: null,
      totalFiles: 0,
      processedFiles: 0,
      successCount: 0,
      failCount: 0,
      skippedCount: 0,
      errors: []
    };
  }
  return syncStates[orgId];
}

// ─────────────────────────────────────────────────────────────
// FUNÇÃO DE SINCRONIZAÇÃO (org-aware)
// ─────────────────────────────────────────────────────────────
async function runSyncJobForOrg(orgId, driveFolderId) {
  const state = getSyncState(orgId);

  if (state.status === "running") {
    console.log(`[Sync] Org ${orgId} já está sincronizando.`);
    return;
  }
  if (!drive || !supabase) {
    console.error("[Sync] Clientes não configurados.");
    return;
  }
  if (!driveFolderId) {
    console.warn(`[Sync] Org ${orgId} sem pasta do Drive configurada. Pulando.`);
    return;
  }

  Object.assign(state, {
    status: "running",
    lastRun: new Date().toISOString(),
    totalFiles: 0, processedFiles: 0,
    successCount: 0, failCount: 0, skippedCount: 0,
    errors: []
  });

  const syncStart = new Date().toISOString();

  try {
    console.log(`[Sync] Iniciando para org ${orgId}...`);
    const files = await listPdfFiles(drive, driveFolderId);
    state.totalFiles = files.length;
    console.log(`[Sync] Org ${orgId}: ${files.length} PDFs encontrados.`);

    for (const file of files) {
      state.processedFiles++;
      const { id: fileId, name: fileName } = file;

      const processed = await isFileProcessed(supabase, fileId, orgId);
      if (processed) {
        state.skippedCount++;
        continue;
      }

      try {
        const pdfBuffer = await downloadFile(drive, fileId);
        const extractedData = await extractPolicyData(pdfBuffer, process.env.GEMINI_API_KEY);
        await savePolicyData(supabase, fileId, extractedData, orgId);
        state.successCount++;
      } catch (err) {
        console.error(`[Sync] Erro em ${fileName}:`, err.message);
        state.failCount++;
        state.errors.push({ file: fileName, error: err.message, timestamp: new Date().toISOString() });
      }
    }

    state.status = "completed";

    // Atualizar last_sync na org
    await supabase
      .from("organizations")
      .update({
        last_sync_at: syncStart,
        last_sync_status: state.failCount > 0 && state.successCount === 0 ? "error" : "ok"
      })
      .eq("id", orgId);

    console.log(`[Sync] Org ${orgId}: OK (${state.successCount} sucesso, ${state.failCount} falha, ${state.skippedCount} pulados)`);
  } catch (error) {
    console.error(`[Sync] Falha geral para org ${orgId}:`, error.message);
    state.status = "failed";
    state.errors.push({ file: "system", error: error.message, timestamp: new Date().toISOString() });

    await supabase
      .from("organizations")
      .update({ last_sync_at: syncStart, last_sync_status: "error" })
      .eq("id", orgId);
  }
}

/** Executa sync para todas as orgs ativas (polling automático). */
async function runSyncAllOrgs() {
  try {
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, drive_folder_id")
      .eq("status", "active")
      .not("drive_folder_id", "is", null);

    if (!orgs || orgs.length === 0) return;

    for (const org of orgs) {
      await runSyncJobForOrg(org.id, org.drive_folder_id);
    }
  } catch (err) {
    console.error("[Sync] Erro no sync global:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// ROTAS
// ─────────────────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────
// ROTAS SUPERADMIN (/superadmin/*)
// ─────────────────────────────────────────────────────────────

/** GET /superadmin/metrics — Dashboard com métricas agregadas */
app.get("/superadmin/metrics", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { data: orgs, error: orgsError } = await supabase
      .from("organizations")
      .select("id, name, status, drive_folder_id, last_sync_at, last_sync_status, created_at");

    if (orgsError) throw orgsError;

    // Contagem de usuários por org
    const { data: userCounts, error: ucError } = await supabase
      .from("profiles")
      .select("organization_id")
      .not("organization_id", "is", null);
    if (ucError) throw ucError;

    // Contagem de apólices por org
    const { data: policyCounts, error: pcError } = await supabase
      .from("policies")
      .select("organization_id");
    if (pcError) throw pcError;

    const userCountMap = {};
    for (const p of userCounts) {
      userCountMap[p.organization_id] = (userCountMap[p.organization_id] || 0) + 1;
    }

    const policyCountMap = {};
    for (const p of policyCounts) {
      policyCountMap[p.organization_id] = (policyCountMap[p.organization_id] || 0) + 1;
    }

    const enrichedOrgs = orgs.map(org => ({
      ...org,
      user_count: userCountMap[org.id] || 0,
      policy_count: policyCountMap[org.id] || 0,
      drive_configured: !!org.drive_folder_id
    }));

    res.json({
      total_organizations: orgs.length,
      active_organizations: orgs.filter(o => o.status === "active").length,
      organizations: enrichedOrgs
    });
  } catch (err) {
    console.error("Erro ao buscar métricas:", err.message);
    res.status(500).json({ error: "Erro ao buscar métricas." });
  }
});

/** POST /superadmin/organizations — Cria nova organização + primeiro Administrador */
app.post("/superadmin/organizations", authenticate, requireSuperAdmin, async (req, res) => {
  const { name, adminEmail, adminPassword, adminName } = req.body;
  if (!name?.trim() || !adminEmail?.trim() || !adminPassword || !adminName?.trim()) {
    return res.status(400).json({ error: "Campos obrigatórios: Nome da Org, Nome do Admin, E-mail do Admin e Senha do Admin." });
  }

  let createdOrgId = null;
  let createdUserId = null;

  try {
    // 1. Criar a pasta no Drive
    let driveFolderId = null;
    if (drive && process.env.GOOGLE_DRIVE_FOLDER_ID) {
      try {
        driveFolderId = await createOrganizationFolder(drive, name.trim(), process.env.GOOGLE_DRIVE_FOLDER_ID);
      } catch (driveErr) {
        console.error("Erro ao criar pasta no Drive:", driveErr.message);
      }
    }

    // 2. Inserir a Organização
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: name.trim(),
        status: "active",
        drive_folder_id: driveFolderId
      })
      .select()
      .single();

    if (orgError) throw orgError;
    createdOrgId = org.id;

    // 3. Criar o usuário Admin no Auth
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: adminEmail.trim(),
      password: adminPassword,
      email_confirm: true,
      user_metadata: { name: adminName.trim(), role: "admin" }
    });

    if (createError) {
      // Rollback da org
      await supabase.from("organizations").delete().eq("id", createdOrgId);
      return res.status(400).json({ error: `Erro ao criar administrador no Auth: ${createError.message}` });
    }
    createdUserId = newUser.user.id;

    // 4. Vincular o profile à Organização como admin
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: createdUserId,
        email: adminEmail.trim(),
        name: adminName.trim(),
        role: "admin",
        organization_id: createdOrgId,
        is_active: true
      });

    if (profileError) {
      // Rollback do usuário e da org
      await supabase.auth.admin.deleteUser(createdUserId);
      await supabase.from("organizations").delete().eq("id", createdOrgId);
      return res.status(400).json({ error: `Erro ao associar perfil do administrador: ${profileError.message}` });
    }

    console.log(`[SuperAdmin] Organização "${name}" criada. Admin: ${adminEmail}`);
    res.status(201).json({ message: "Organização e Administrador criados com sucesso.", organization: org });
  } catch (err) {
    console.error("Erro ao criar organização com admin:", err.message);
    res.status(500).json({ error: "Erro interno ao criar organização." });
  }
});

/** PATCH /superadmin/organizations/:orgId — Edita nome ou pasta do Drive */
app.patch("/superadmin/organizations/:orgId", authenticate, requireSuperAdmin, async (req, res) => {
  const { orgId } = req.params;
  const { name, drive_folder_id } = req.body;

  try {
    const updateData = { updated_at: new Date().toISOString() };
    if (name?.trim()) updateData.name = name.trim();
    if (drive_folder_id !== undefined) updateData.drive_folder_id = drive_folder_id;

    const { data, error } = await supabase
      .from("organizations")
      .update(updateData)
      .eq("id", orgId)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: "Organização atualizada com sucesso.", organization: data });
  } catch (err) {
    console.error("Erro ao editar organização:", err.message);
    res.status(500).json({ error: "Erro ao editar organização." });
  }
});

/** DELETE /superadmin/organizations/:orgId — Exclui organização e todos os seus dados */
app.delete("/superadmin/organizations/:orgId", authenticate, requireSuperAdmin, async (req, res) => {
  const { orgId } = req.params;

  try {
    // 1. Listar e deletar todos os usuários da org do Auth
    const { data: profiles, error: profError } = await supabase
      .from("profiles")
      .select("id")
      .eq("organization_id", orgId);

    if (profError) throw profError;

    if (profiles && profiles.length > 0) {
      for (const p of profiles) {
        await supabase.auth.admin.deleteUser(p.id);
      }
    }

    // 2. Deletar apólices, clientes, veículos e seguradoras associadas
    await supabase.from("vehicles").delete().eq("organization_id", orgId);
    await supabase.from("policies").delete().eq("organization_id", orgId);
    await supabase.from("clients").delete().eq("organization_id", orgId);
    await supabase.from("insurers").delete().eq("organization_id", orgId);

    // 3. Deletar a organização
    const { error: deleteOrgError } = await supabase
      .from("organizations")
      .delete()
      .eq("id", orgId);

    if (deleteOrgError) throw deleteOrgError;

    console.log(`[SuperAdmin] Organização ${orgId} e todos os seus recursos foram excluídos.`);
    res.json({ message: "Organização e todos os seus dados e usuários foram excluídos com sucesso." });
  } catch (err) {
    console.error("Erro ao deletar organização:", err.message);
    res.status(500).json({ error: "Erro ao deletar organização e seus dados." });
  }
});

/** PATCH /superadmin/organizations/:orgId/status — Habilita/desabilita organização */
app.patch("/superadmin/organizations/:orgId/status", authenticate, requireSuperAdmin, async (req, res) => {
  const { orgId } = req.params;
  const { status } = req.body;

  if (!["active", "disabled"].includes(status)) {
    return res.status(400).json({ error: "Status inválido. Use 'active' ou 'disabled'." });
  }

  try {
    const { data, error } = await supabase
      .from("organizations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", orgId)
      .select()
      .single();

    if (error) throw error;
    console.log(`[SuperAdmin] Org ${orgId} → status: ${status}`);
    res.json({ message: `Organização ${status === "active" ? "habilitada" : "desabilitada"}.`, organization: data });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar status da organização." });
  }
});

/** PATCH /superadmin/users/:userId — Edita informações de um usuário */
app.patch("/superadmin/users/:userId", authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;
  const { name, email, role, password, is_active } = req.body;

  try {
    // 1. Atualizar dados no Auth do Supabase se necessário
    const authUpdateData = {};
    if (email?.trim()) authUpdateData.email = email.trim();
    if (password) authUpdateData.password = password;
    
    // Atualizar metadados do Auth
    const userMetadata = {};
    if (name?.trim()) userMetadata.name = name.trim();
    if (role) userMetadata.role = role;
    if (Object.keys(userMetadata).length > 0) {
      authUpdateData.user_metadata = userMetadata;
    }

    if (Object.keys(authUpdateData).length > 0) {
      const { error: authError } = await supabase.auth.admin.updateUserById(userId, authUpdateData);
      if (authError) return res.status(400).json({ error: `Erro ao atualizar usuário no Auth: ${authError.message}` });
    }

    // 2. Atualizar tabela profiles
    const profileUpdateData = {};
    if (name?.trim()) profileUpdateData.name = name.trim();
    if (email?.trim()) profileUpdateData.email = email.trim();
    if (role) {
      if (!["admin", "broker", "superadmin"].includes(role)) {
        return res.status(400).json({ error: "Role inválida." });
      }
      profileUpdateData.role = role;
    }
    if (is_active !== undefined) profileUpdateData.is_active = is_active;

    const { data: updatedProfile, error: profError } = await supabase
      .from("profiles")
      .update(profileUpdateData)
      .eq("id", userId)
      .select()
      .single();

    if (profError) throw profError;

    res.json({ message: "Usuário atualizado com sucesso.", profile: updatedProfile });
  } catch (err) {
    console.error("Erro ao editar usuário:", err.message);
    res.status(500).json({ error: "Erro ao editar usuário." });
  }
});

/** DELETE /superadmin/users/:userId — Exclui usuário completamente do Auth e profiles */
app.delete("/superadmin/users/:userId", authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;

  // Impedir auto-exclusão
  if (userId === req.profile.id) {
    return res.status(400).json({ error: "Não é possível excluir seu próprio usuário." });
  }

  try {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;

    console.log(`[SuperAdmin] Usuário ${userId} excluído com sucesso.`);
    res.json({ message: "Usuário excluído com sucesso." });
  } catch (err) {
    console.error("Erro ao deletar usuário:", err.message);
    res.status(500).json({ error: "Erro ao deletar usuário." });
  }
});

/** PATCH /superadmin/users/:userId/status — Habilita/desabilita usuário */
app.patch("/superadmin/users/:userId/status", authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;
  const { is_active } = req.body;

  if (typeof is_active !== "boolean") {
    return res.status(400).json({ error: "is_active deve ser boolean." });
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({ is_active })
      .eq("id", userId)
      .neq("role", "superadmin") // Não permite desabilitar outros superadmins
      .select()
      .single();

    if (error) throw error;
    res.json({ message: `Usuário ${is_active ? "habilitado" : "desabilitado"}.`, profile: data });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar status do usuário." });
  }
});

/** POST /superadmin/superadmins — Adiciona novo superadmin */
app.post("/superadmin/superadmins", authenticate, requireSuperAdmin, async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "email, password e name são obrigatórios." });
  }

  try {
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: "superadmin" }
    });

    if (createError) return res.status(400).json({ error: createError.message });

    // Garantir role superadmin no profile (trigger pode criar com role padrão)
    await supabase
      .from("profiles")
      .update({ role: "superadmin", organization_id: null })
      .eq("id", newUser.user.id);

    res.status(201).json({ message: "SuperAdmin criado.", user: { id: newUser.user.id, email, name } });
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar superadmin." });
  }
});

/** GET /superadmin/users — Lista todos os usuários de todas as orgs */
app.get("/superadmin/users", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, name, role, organization_id, is_active, created_at")
      .neq("role", "superadmin")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar usuários." });
  }
});

// ─────────────────────────────────────────────────────────────
// ROTAS ADMIN DE ORG (/admin/*)
// ─────────────────────────────────────────────────────────────

/** GET /admin/users — Lista usuários da org do admin autenticado */
app.get("/admin/users", authenticate, requireOrgAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, name, role, is_active, created_at")
      .eq("organization_id", req.profile.organization_id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar usuários da organização." });
  }
});

/** POST /admin/users — Convida usuário para a org (máximo 5) */
app.post("/admin/users", authenticate, requireOrgAdmin, async (req, res) => {
  const { email, password, name, role } = req.body;

  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: "Campos obrigatórios: email, password, name, role." });
  }
  if (!["admin", "broker"].includes(role)) {
    return res.status(400).json({ error: "Role inválida. Use 'admin' ou 'broker'." });
  }

  try {
    // Verificar limite de 5 usuários por org
    const { count, error: countError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", req.profile.organization_id);

    if (countError) throw countError;

    if (count >= 5) {
      return res.status(409).json({
        error: "Limite de 5 usuários por organização atingido.",
        current: count,
        limit: 5
      });
    }

    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role }
    });

    if (createError) return res.status(400).json({ error: createError.message });

    // Vincular à organização do admin
    await supabase
      .from("profiles")
      .update({ role, organization_id: req.profile.organization_id })
      .eq("id", newUser.user.id);

    res.status(201).json({
      message: "Usuário criado com sucesso.",
      user: { id: newUser.user.id, email, name, role }
    });
  } catch (err) {
    console.error("Erro ao criar usuário:", err.message);
    res.status(500).json({ error: "Erro interno ao criar usuário." });
  }
});

/** PATCH /admin/users/:userId/role — Altera role de um usuário da org */
app.patch("/admin/users/:userId/role", authenticate, requireOrgAdmin, async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;

  if (!["admin", "broker"].includes(role)) {
    return res.status(400).json({ error: "Role inválida. Use 'admin' ou 'broker'." });
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId)
      .eq("organization_id", req.profile.organization_id) // Escopo da org
      .select()
      .single();

    if (error) throw error;
    res.json({ message: "Role atualizada.", profile: data });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar role." });
  }
});

/** DELETE /admin/users/:userId — Remove usuário da org */
app.delete("/admin/users/:userId", authenticate, requireOrgAdmin, async (req, res) => {
  const { userId } = req.params;

  // Impedir auto-exclusão
  if (userId === req.profile.id) {
    return res.status(400).json({ error: "Não é possível remover seu próprio usuário." });
  }

  try {
    // Verificar que o usuário pertence à org
    const { data: target } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .eq("organization_id", req.profile.organization_id)
      .maybeSingle();

    if (!target) return res.status(404).json({ error: "Usuário não encontrado na organização." });

    // Deletar do Auth (cascade deleta o profile via trigger)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    res.json({ message: "Usuário removido com sucesso." });
  } catch (err) {
    res.status(500).json({ error: "Erro ao remover usuário." });
  }
});

// ─────────────────────────────────────────────────────────────
// ROTAS DE SINCRONIZAÇÃO (org-aware)
// ─────────────────────────────────────────────────────────────

/** GET /sync/status — Status do sync da org do usuário autenticado */
app.get("/sync/status", authenticate, requireOrgAdmin, async (req, res) => {
  const orgId = req.profile.organization_id;
  res.json(getSyncState(orgId));
});

/** POST /sync — Dispara sync manual para a org do admin autenticado */
app.post("/sync", authenticate, requireOrgAdmin, async (req, res) => {
  const orgId = req.profile.organization_id;
  const state = getSyncState(orgId);

  if (state.status === "running") {
    return res.status(409).json({ message: "Sincronização já está em andamento.", status: "running" });
  }

  // Buscar folder_id da org
  const { data: org } = await supabase
    .from("organizations")
    .select("drive_folder_id")
    .eq("id", orgId)
    .maybeSingle();

  if (!org?.drive_folder_id) {
    return res.status(503).json({ error: "Pasta do Google Drive não configurada para esta organização." });
  }

  runSyncJobForOrg(orgId, org.drive_folder_id);

  res.status(202).json({ message: "Sincronização iniciada.", status: "running" });
});

// ─────────────────────────────────────────────────────────────
// ROTA DE DOWNLOAD DE PDF
// ─────────────────────────────────────────────────────────────

/** GET /api/policies/:policyId/download — Proxy autenticado de PDF via Drive */
app.get("/api/policies/:policyId/download", authenticate, async (req, res) => {
  try {
    const { policyId } = req.params;
    const orgId = req.profile.organization_id;

    // Superadmin não tem org, não pode baixar PDFs de orgs
    if (!orgId) {
      return res.status(403).json({ error: "SuperAdmin não tem acesso a dados de organizações." });
    }

    const { data: policy, error: policyError } = await supabase
      .from("policies")
      .select("drive_file_id, policy_number, organization_id")
      .eq("id", policyId)
      .eq("organization_id", orgId) // Isola por org
      .maybeSingle();

    if (policyError || !policy) return res.status(404).json({ error: "Apólice não encontrada." });
    if (!policy.drive_file_id) return res.status(404).json({ error: "Apólice sem arquivo PDF associado." });
    if (!drive) return res.status(503).json({ error: "Integração com Google Drive não configurada." });

    console.log(`[PDF] Usuário ${req.user.email} → apólice ${policy.policy_number}`);
    const pdfBuffer = await downloadFile(drive, policy.drive_file_id);
    const safeFileName = `apolice-${policy.policy_number || policyId}.pdf`.replace(/[^a-zA-Z0-9.\-_]/g, "_");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${safeFileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader("Cache-Control", "private, no-store");

    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Erro ao baixar PDF:", err.message);
    return res.status(500).json({ error: "Erro ao obter o arquivo PDF." });
  }
});

// ─────────────────────────────────────────────────────────────
// INICIALIZAÇÃO DO SERVIDOR
// ─────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);

  const intervalMinutes = 10;
  console.log(`Polling automático ativado: a cada ${intervalMinutes} minutos.`);
  setInterval(() => {
    console.log("[Sync] Executando sincronização automática de todas as orgs...");
    runSyncAllOrgs();
  }, intervalMinutes * 60 * 1000);
});
