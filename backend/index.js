import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { extractPolicyData } from "./geminiService.js";
import { getSupabaseClient, isFileProcessed, savePolicyData, seedInsurers, seedSuperAdmin } from "./dbService.js";
import { uploadFileToStorage, downloadFileFromStorage, deleteOrganizationFolderFromStorage } from "./storageService.js";

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

try {
  supabase = getSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
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
// CONFIGURAÇÃO DO MULTER (Upload em memória)
// ─────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // Limite de 10MB por arquivo
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos PDF são permitidos."));
    }
  }
});

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
      .select("id, name, status, last_sync_at, last_sync_status, created_at");

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
      policy_count: policyCountMap[org.id] || 0
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
    // 1. Inserir a Organização no banco
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: name.trim(),
        status: "active"
      })
      .select()
      .single();

    if (orgError) throw orgError;
    createdOrgId = org.id;

    // 2. Criar o usuário Admin no Auth
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

    // 3. Vincular o profile à Organização como admin
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

/** PATCH /superadmin/organizations/:orgId — Edita nome da Organização */
app.patch("/superadmin/organizations/:orgId", authenticate, requireSuperAdmin, async (req, res) => {
  const { orgId } = req.params;
  const { name } = req.body;

  try {
    const updateData = { updated_at: new Date().toISOString() };
    if (name?.trim()) updateData.name = name.trim();

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

/** DELETE /superadmin/organizations/:orgId — Exclui organização, todos os seus dados e arquivos */
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

    // 2. Deletar arquivos armazenados no Supabase Storage
    await deleteOrganizationFolderFromStorage(supabase, orgId);

    // 3. Deletar apólices, clientes, veículos e seguradoras associadas
    await supabase.from("vehicles").delete().eq("organization_id", orgId);
    await supabase.from("policies").delete().eq("organization_id", orgId);
    await supabase.from("clients").delete().eq("organization_id", orgId);
    await supabase.from("insurers").delete().eq("organization_id", orgId);

    // 4. Deletar a organização
    const { error: deleteOrgError } = await supabase
      .from("organizations")
      .delete()
      .eq("id", orgId);

    if (deleteOrgError) throw deleteOrgError;

    console.log(`[SuperAdmin] Organização ${orgId} e todos os seus recursos foram excluídos.`);
    res.json({ message: "Organização e todos os seus dados, arquivos e usuários foram excluídos com sucesso." });
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

/** PATCH /admin/users/:userId — Edita informações gerais de um usuário da org */
app.patch("/admin/users/:userId", authenticate, requireOrgAdmin, async (req, res) => {
  const { userId } = req.params;
  const { name, email, role, password, is_active } = req.body;

  try {
    // 1. Verificar se o usuário pertence à mesma organização do admin
    const { data: targetUser, error: checkError } = await supabase
      .from("profiles")
      .select("id, role, organization_id")
      .eq("id", userId)
      .eq("organization_id", req.profile.organization_id)
      .maybeSingle();

    if (checkError) throw checkError;
    if (!targetUser) {
      return res.status(404).json({ error: "Usuário não encontrado na sua organização." });
    }

    // 2. Atualizar dados no Auth do Supabase se necessário
    const authUpdateData = {};
    if (email?.trim()) authUpdateData.email = email.trim();
    if (password) authUpdateData.password = password;
    
    // Atualizar metadados do Auth
    const userMetadata = {};
    if (name?.trim()) userMetadata.name = name.trim();
    if (role) {
      if (!["admin", "broker"].includes(role)) {
        return res.status(400).json({ error: "Role inválida. Use 'admin' ou 'broker'." });
      }
      userMetadata.role = role;
    }
    if (Object.keys(userMetadata).length > 0) {
      authUpdateData.user_metadata = userMetadata;
    }

    if (Object.keys(authUpdateData).length > 0) {
      const { error: authError } = await supabase.auth.admin.updateUserById(userId, authUpdateData);
      if (authError) return res.status(400).json({ error: `Erro ao atualizar usuário no Auth: ${authError.message}` });
    }

    // 3. Atualizar tabela profiles
    const profileUpdateData = {};
    if (name?.trim()) profileUpdateData.name = name.trim();
    if (email?.trim()) profileUpdateData.email = email.trim();
    if (role) profileUpdateData.role = role;
    if (is_active !== undefined) profileUpdateData.is_active = is_active;

    const { data: updatedProfile, error: profError } = await supabase
      .from("profiles")
      .update(profileUpdateData)
      .eq("id", userId)
      .eq("organization_id", req.profile.organization_id)
      .select()
      .single();

    if (profError) throw profError;

    res.json({ message: "Usuário atualizado com sucesso.", profile: updatedProfile });
  } catch (err) {
    console.error("Erro ao editar usuário da organização:", err.message);
    res.status(500).json({ error: "Erro ao editar usuário." });
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
// ROTAS DE UPLOAD E PROCESSAMENTO DE APÓLICES
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/policies/upload — Upload e processamento imediato de apólices em PDF
 */
app.post("/api/policies/upload", authenticate, upload.single("file"), async (req, res) => {
  const orgId = req.profile.organization_id;
  if (!orgId) {
    return res.status(403).json({ error: "SuperAdmin não possui organização associada para carregar arquivos." });
  }

  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Nenhum arquivo PDF enviado no campo 'file'." });
  }

  const fileName = file.originalname;

  try {
    console.log(`[Upload] Processando upload do arquivo "${fileName}" para org: ${orgId}`);

    // 1. Fazer upload para o Supabase Storage (S3) no caminho "orgId/fileName"
    const storagePath = await uploadFileToStorage(supabase, orgId, fileName, file.buffer);

    // 2. Extrair dados estruturados usando o Gemini API
    const extractedData = await extractPolicyData(file.buffer, process.env.GEMINI_API_KEY);

    // 3. Salvar informações extraídas na base de dados
    const result = await savePolicyData(supabase, storagePath, extractedData, orgId);

    // 4. Atualizar registro do último processamento da organização
    await supabase
      .from("organizations")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "ok"
      })
      .eq("id", orgId);

    res.status(201).json({
      message: `Arquivo ${fileName} processado com sucesso.`,
      policyId: result.policyId,
      data: extractedData
    });
  } catch (err) {
    console.error(`[Upload] Erro ao processar arquivo ${fileName}:`, err.message);

    // Atualizar status de erro da org no banco
    await supabase
      .from("organizations")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "error"
      })
      .eq("id", orgId);

    res.status(500).json({ error: `Erro ao processar ${fileName}: ${err.message}` });
  }
});

// ─────────────────────────────────────────────────────────────
// ROTA DE DOWNLOAD DE PDF
// ─────────────────────────────────────────────────────────────

/** GET /api/policies/:policyId/download — Proxy autenticado de PDF via Supabase Storage (S3) */
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
      .select("storage_path, policy_number, organization_id")
      .eq("id", policyId)
      .eq("organization_id", orgId) // Isola por org
      .maybeSingle();

    if (policyError || !policy) return res.status(404).json({ error: "Apólice não encontrada." });
    if (!policy.storage_path) return res.status(404).json({ error: "Apólice sem arquivo PDF associado." });

    console.log(`[PDF] Usuário ${req.user.email} → baixando do Storage: ${policy.storage_path}`);
    const pdfBuffer = await downloadFileFromStorage(supabase, policy.storage_path);
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
  console.log(`Supabase Storage ativado e integrado para armazenamento de apólices.`);
});
