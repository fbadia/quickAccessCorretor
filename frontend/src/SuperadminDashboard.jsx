import React, { useState, useEffect } from "react";
import {
  Building2, Users, FileText, RefreshCw, ToggleLeft, ToggleRight,
  Plus, ShieldCheck, AlertTriangle, CheckCircle2, Clock, Wifi, WifiOff,
  LogOut, Sun, Moon, X, Edit, Trash2
} from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

// ─────────────────────────────────────────────────────────────
// Hook para chamadas autenticadas ao backend
// ─────────────────────────────────────────────────────────────
function useAuthFetch(token) {
  return async (path, options = {}) => {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
  };
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function SuperadminDashboard({ session, profile, onLogout, theme, onToggleTheme }) {
  const authFetch = useAuthFetch(session?.access_token);

  const [activeTab, setActiveTab] = useState("orgs"); // "orgs" | "users" | "superadmins"
  const [metrics, setMetrics] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [toast, setToast] = useState(null);

  // Modal de nova organização (inclui dados do admin)
  const [showNewOrgModal, setShowNewOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgAdminName, setNewOrgAdminName] = useState("");
  const [newOrgAdminEmail, setNewOrgAdminEmail] = useState("");
  const [newOrgAdminPassword, setNewOrgAdminPassword] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Modal de edição de organização
  const [showEditOrgModal, setShowEditOrgModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [editOrgName, setEditOrgName] = useState("");
  const [editOrgDriveId, setEditOrgDriveId] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);

  // Modal de edição de usuário
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserRole, setEditUserRole] = useState("broker");
  const [editUserPassword, setEditUserPassword] = useState("");
  const [savingUser, setSavingUser] = useState(false);

  // Modal de novo superadmin
  const [showNewSAModal, setShowNewSAModal] = useState(false);
  const [newSAEmail, setNewSAEmail] = useState("");
  const [newSAName, setNewSAName] = useState("");
  const [newSAPassword, setNewSAPassword] = useState("");
  const [creatingSA, setCreatingSA] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const data = await authFetch("/superadmin/metrics");
      setMetrics(data);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoadingMetrics(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await authFetch("/superadmin/users");
      setUsers(data);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  useEffect(() => {
    if (activeTab === "users") loadUsers();
  }, [activeTab]);

  // Toggle status de organização
  const toggleOrgStatus = async (orgId, currentStatus) => {
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    try {
      await authFetch(`/superadmin/organizations/${orgId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      showToast(`Organização ${newStatus === "active" ? "habilitada" : "desabilitada"}.`);
      loadMetrics();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Toggle status de usuário
  const toggleUserStatus = async (userId, currentStatus) => {
    try {
      await authFetch(`/superadmin/users/${userId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !currentStatus }),
      });
      showToast(`Usuário ${!currentStatus ? "habilitado" : "desabilitado"}.`);
      loadUsers();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Criar nova organização (com Admin integrado)
  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim() || !newOrgAdminName.trim() || !newOrgAdminEmail.trim() || !newOrgAdminPassword) {
      showToast("Preencha todos os campos da organização e do administrador.", "error");
      return;
    }
    setCreatingOrg(true);
    try {
      await authFetch("/superadmin/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: newOrgName.trim(),
          adminName: newOrgAdminName.trim(),
          adminEmail: newOrgAdminEmail.trim(),
          adminPassword: newOrgAdminPassword
        }),
      });
      showToast(`Organização "${newOrgName}" e administrador criados com sucesso!`);
      setNewOrgName("");
      setNewOrgAdminName("");
      setNewOrgAdminEmail("");
      setNewOrgAdminPassword("");
      setShowNewOrgModal(false);
      loadMetrics();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setCreatingOrg(false);
    }
  };

  // Editar Organização (Carregar dados)
  const openEditOrgModal = (org) => {
    setEditingOrg(org);
    setEditOrgName(org.name || "");
    setEditOrgDriveId(org.drive_folder_id || "");
    setShowEditOrgModal(true);
  };

  // Salvar Organização
  const handleSaveOrg = async (e) => {
    e.preventDefault();
    if (!editOrgName.trim()) return;
    setSavingOrg(true);
    try {
      await authFetch(`/superadmin/organizations/${editingOrg.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editOrgName.trim(),
          drive_folder_id: editOrgDriveId.trim() || null
        })
      });
      showToast("Organização atualizada com sucesso!");
      setShowEditOrgModal(false);
      loadMetrics();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingOrg(false);
    }
  };

  // Excluir Organização
  const handleDeleteOrg = async (orgId, orgName) => {
    if (!window.confirm(`ATENÇÃO: Tem certeza que deseja EXCLUIR a organização "${orgName}"?\nIsso apagará permanentemente todos os usuários, apólices, clientes e veículos vinculados a ela de forma IRREVERSÍVEL.`)) {
      return;
    }
    try {
      await authFetch(`/superadmin/organizations/${orgId}`, { method: "DELETE" });
      showToast("Organização e todos os seus dados e usuários foram excluídos!");
      loadMetrics();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Editar Usuário (Carregar dados)
  const openEditUserModal = (user) => {
    setEditingUser(user);
    setEditUserName(user.name || "");
    setEditUserEmail(user.email || "");
    setEditUserRole(user.role || "broker");
    setEditUserPassword(""); // Senha vazia por padrão
    setShowEditUserModal(true);
  };

  // Salvar Usuário
  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!editUserName.trim() || !editUserEmail.trim()) return;
    setSavingUser(true);
    try {
      const body = {
        name: editUserName.trim(),
        email: editUserEmail.trim(),
        role: editUserRole
      };
      if (editUserPassword) {
        body.password = editUserPassword;
      }
      await authFetch(`/superadmin/users/${editingUser.id}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      showToast("Corretor atualizado com sucesso!");
      setShowEditUserModal(false);
      loadUsers();
      loadMetrics(); // Atualizar contagem
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingUser(false);
    }
  };

  // Excluir Usuário
  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Tem certeza que deseja EXCLUIR permanentemente o usuário "${userEmail}"?`)) {
      return;
    }
    try {
      await authFetch(`/superadmin/users/${userId}`, { method: "DELETE" });
      showToast("Usuário excluído com sucesso!");
      loadUsers();
      loadMetrics(); // Atualizar contagem
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Criar novo superadmin
  const handleCreateSuperAdmin = async (e) => {
    e.preventDefault();
    if (!newSAEmail || !newSAName || !newSAPassword) return;
    setCreatingSA(true);
    try {
      await authFetch("/superadmin/superadmins", {
        method: "POST",
        body: JSON.stringify({ email: newSAEmail, name: newSAName, password: newSAPassword }),
      });
      showToast("SuperAdmin criado com sucesso!");
      setNewSAEmail(""); setNewSAName(""); setNewSAPassword("");
      setShowNewSAModal(false);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setCreatingSA(false);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="app-wrapper" data-theme={theme}>
      {/* HEADER */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo-area">
            <img src="/favicon.svg" alt="Logo" style={{ width: 32, height: 32 }} />
            <div>
              <span className="app-title">QuickAccess</span>
              <span style={{
                marginLeft: "0.5rem",
                fontSize: "0.7rem",
                background: "linear-gradient(135deg, #863bff, #6a2dd4)",
                color: "#fff",
                padding: "0.15rem 0.5rem",
                borderRadius: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.05em"
              }}>SUPERADMIN</span>
            </div>
          </div>
        </div>
        <div className="header-right">
          <button onClick={onToggleTheme} className="icon-btn" title="Alternar tema">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="user-badge">
            <ShieldCheck size={16} style={{ color: "#863bff" }} />
            <span>{profile?.name || profile?.email}</span>
          </div>
          <button onClick={onLogout} className="icon-btn" title="Sair">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div style={{ padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>

        {/* CARDS DE RESUMO */}
        {metrics && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
            <SummaryCard
              icon={<Building2 size={24} />}
              label="Total de Organizações"
              value={metrics.total_organizations}
              sub={`${metrics.active_organizations} ativas`}
              color="#863bff"
            />
            <SummaryCard
              icon={<Users size={24} />}
              label="Total de Usuários"
              value={metrics.organizations.reduce((s, o) => s + o.user_count, 0)}
              sub="em todas as orgs"
              color="#3b82f6"
            />
            <SummaryCard
              icon={<FileText size={24} />}
              label="Total de Apólices"
              value={metrics.organizations.reduce((s, o) => s + o.policy_count, 0)}
              sub="importadas"
              color="#22c55e"
            />
          </div>
        )}

        {/* TABS */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "0" }}>
          {[
            { id: "orgs", label: "Organizações", icon: <Building2 size={15} /> },
            { id: "users", label: "Usuários", icon: <Users size={15} /> },
            { id: "superadmins", label: "SuperAdmins", icon: <ShieldCheck size={15} /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: "0.4rem",
                padding: "0.6rem 1rem",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #863bff" : "2px solid transparent",
                color: activeTab === tab.id ? "#863bff" : "var(--text-secondary)",
                fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: "pointer",
                fontSize: "0.9rem",
                transition: "all 0.2s"
              }}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* TAB: ORGANIZAÇÕES */}
        {activeTab === "orgs" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Organizações</h2>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={loadMetrics} className="secondary-btn" style={{ padding: "0.5rem 0.75rem" }}>
                  <RefreshCw size={15} />
                </button>
                <button onClick={() => setShowNewOrgModal(true)} className="primary-btn" style={{ padding: "0.5rem 1rem" }}>
                  <Plus size={15} /> Nova Organização
                </button>
              </div>
            </div>

            {loadingMetrics ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>Carregando...</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                      {["Organização", "Status", "Usuários", "Apólices", "Última Sync", "Drive", "Ações"].map(h => (
                        <th key={h} style={{ padding: "0.75rem", textAlign: "left", color: "var(--text-secondary)", fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics?.organizations || []).map(org => (
                      <tr key={org.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "0.875rem 0.75rem", fontWeight: 500 }}>{org.name}</td>
                        <td style={{ padding: "0.875rem 0.75rem" }}>
                          <span className={`status-badge ${org.status === "active" ? "status-active" : "status-expired"}`}>
                            {org.status === "active" ? "Ativa" : "Desabilitada"}
                          </span>
                        </td>
                        <td style={{ padding: "0.875rem 0.75rem" }}>
                          <span style={{ color: org.user_count >= 5 ? "#f59e0b" : "inherit" }}>
                            {org.user_count}/5
                          </span>
                        </td>
                        <td style={{ padding: "0.875rem 0.75rem" }}>{org.policy_count}</td>
                        <td style={{ padding: "0.875rem 0.75rem", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            {org.last_sync_status === "ok" && <CheckCircle2 size={13} color="#22c55e" />}
                            {org.last_sync_status === "error" && <AlertTriangle size={13} color="#ef4444" />}
                            {org.last_sync_status === "never" && <Clock size={13} color="#6b7280" />}
                            {formatDate(org.last_sync_at)}
                          </div>
                        </td>
                        <td style={{ padding: "0.875rem 0.75rem" }}>
                          {org.drive_configured
                            ? <Wifi size={15} color="#22c55e" title="Pasta configurada" />
                            : <WifiOff size={15} color="#ef4444" title="Pasta não configurada" />}
                        </td>
                        <td style={{ padding: "0.875rem 0.75rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                            <button
                              onClick={() => toggleOrgStatus(org.id, org.status)}
                              title={org.status === "active" ? "Desabilitar" : "Habilitar"}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                            >
                              {org.status === "active"
                                ? <ToggleRight size={24} color="#22c55e" />
                                : <ToggleLeft size={24} color="#6b7280" />}
                            </button>
                            <button
                              onClick={() => openEditOrgModal(org)}
                              title="Editar"
                              className="icon-btn"
                              style={{ padding: "4px" }}
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteOrg(org.id, org.name)}
                              title="Excluir"
                              className="icon-btn"
                              style={{ padding: "4px", color: "var(--danger-color)" }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {metrics?.organizations?.length === 0 && (
                  <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
                    Nenhuma organização cadastrada.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB: USUÁRIOS */}
        {activeTab === "users" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Usuários ({users.length})</h2>
              <button onClick={loadUsers} className="secondary-btn" style={{ padding: "0.5rem 0.75rem" }}>
                <RefreshCw size={15} />
              </button>
            </div>
            {loadingUsers ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>Carregando...</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    {["Nome", "E-mail", "Role", "Organização", "Status", "Ações"].map(h => (
                      <th key={h} style={{ padding: "0.75rem", textAlign: "left", color: "var(--text-secondary)", fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const org = metrics?.organizations?.find(o => o.id === u.organization_id);
                    return (
                      <tr key={u.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "0.875rem 0.75rem", fontWeight: 500 }}>{u.name || "—"}</td>
                        <td style={{ padding: "0.875rem 0.75rem", color: "var(--text-secondary)" }}>{u.email}</td>
                        <td style={{ padding: "0.875rem 0.75rem" }}>
                          <span style={{ fontSize: "0.78rem", padding: "0.2rem 0.5rem", borderRadius: "0.4rem", background: u.role === "admin" ? "rgba(134,59,255,0.2)" : "rgba(59,130,246,0.2)", color: u.role === "admin" ? "#863bff" : "#3b82f6" }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: "0.875rem 0.75rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>{org?.name || "—"}</td>
                        <td style={{ padding: "0.875rem 0.75rem" }}>
                          <span className={`status-badge ${u.is_active ? "status-active" : "status-expired"}`}>
                            {u.is_active ? "Ativo" : "Desabilitado"}
                          </span>
                        </td>
                        <td style={{ padding: "0.875rem 0.75rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                            <button
                              onClick={() => toggleUserStatus(u.id, u.is_active)}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                              title={u.is_active ? "Desabilitar usuário" : "Habilitar usuário"}
                            >
                              {u.is_active
                                ? <ToggleRight size={24} color="#22c55e" />
                                : <ToggleLeft size={24} color="#6b7280" />}
                            </button>
                            <button
                              onClick={() => openEditUserModal(u)}
                              title="Editar"
                              className="icon-btn"
                              style={{ padding: "4px" }}
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              title="Excluir"
                              className="icon-btn"
                              style={{ padding: "4px", color: "var(--danger-color)" }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB: SUPERADMINS */}
        {activeTab === "superadmins" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem" }}>SuperAdmins</h2>
              <button onClick={() => setShowNewSAModal(true)} className="primary-btn" style={{ padding: "0.5rem 1rem" }}>
                <Plus size={15} /> Novo SuperAdmin
              </button>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              SuperAdmins têm acesso ao dashboard de controle mas não podem acessar dados das organizações.
            </p>
          </div>
        )}
      </div>

      {/* MODAL: Nova Organização (com Admin integrado) */}
      {showNewOrgModal && (
        <Modal title="Nova Organização + Administrador" onClose={() => setShowNewOrgModal(false)}>
          <form onSubmit={handleCreateOrg} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>
              <h4 style={{ margin: 0, fontSize: "0.9rem", color: "#863bff" }}>Dados da Corretora</h4>
            </div>
            <div className="form-group">
              <label className="form-label">Nome da Organização</label>
              <input
                className="form-input"
                type="text"
                value={newOrgName}
                onChange={e => setNewOrgName(e.target.value)}
                placeholder="Ex: Corretora ABC"
                required
                autoFocus
              />
            </div>
            
            <div style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem", marginTop: "0.5rem" }}>
              <h4 style={{ margin: 0, fontSize: "0.9rem", color: "#863bff" }}>Administrador da Corretora</h4>
            </div>
            <div className="form-group">
              <label className="form-label">Nome do Admin</label>
              <input
                className="form-input"
                type="text"
                value={newOrgAdminName}
                onChange={e => setNewOrgAdminName(e.target.value)}
                placeholder="Ex: Carlos Silva"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">E-mail do Admin</label>
              <input
                className="form-input"
                type="email"
                value={newOrgAdminEmail}
                onChange={e => setNewOrgAdminEmail(e.target.value)}
                placeholder="Ex: carlos@corretora.com"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Senha do Admin</label>
              <input
                className="form-input"
                type="password"
                value={newOrgAdminPassword}
                onChange={e => setNewOrgAdminPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
              />
            </div>

            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: 0 }}>
              Uma pasta será criada no Google Drive e a conta do administrador será criada com a role "admin".
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" className="secondary-btn" onClick={() => setShowNewOrgModal(false)}>Cancelar</button>
              <button type="submit" className="primary-btn" disabled={creatingOrg}>
                {creatingOrg ? "Criando..." : "Criar Organização"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: Editar Organização */}
      {showEditOrgModal && editingOrg && (
        <Modal title="Editar Organização" onClose={() => setShowEditOrgModal(false)}>
          <form onSubmit={handleSaveOrg} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="form-group">
              <label className="form-label">Nome da Organização</label>
              <input
                className="form-input"
                type="text"
                value={editOrgName}
                onChange={e => setEditOrgName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">ID da Pasta do Google Drive</label>
              <input
                className="form-input"
                type="text"
                value={editOrgDriveId}
                onChange={e => setEditOrgDriveId(e.target.value)}
                placeholder="ID do Google Drive"
              />
            </div>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button type="button" className="secondary-btn" onClick={() => setShowEditOrgModal(false)}>Cancelar</button>
              <button type="submit" className="primary-btn" disabled={savingOrg}>
                {savingOrg ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: Editar Usuário */}
      {showEditUserModal && editingUser && (
        <Modal title="Editar Usuário Corretor" onClose={() => setShowEditUserModal(false)}>
          <form onSubmit={handleSaveUser} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="form-group">
              <label className="form-label">Nome Completo</label>
              <input
                className="form-input"
                type="text"
                value={editUserName}
                onChange={e => setEditUserName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input
                className="form-input"
                type="email"
                value={editUserEmail}
                onChange={e => setEditUserEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Nova Senha (Opcional)</label>
              <input
                className="form-input"
                type="password"
                value={editUserPassword}
                onChange={e => setEditUserPassword(e.target.value)}
                placeholder="Deixe em branco para manter a atual"
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Acesso / Role</label>
              <select
                className="form-select"
                value={editUserRole}
                onChange={e => setEditUserRole(e.target.value)}
              >
                <option value="broker">Corretor (Apenas Consulta)</option>
                <option value="admin">Administrador (Consulta e Sincronização)</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button type="button" className="secondary-btn" onClick={() => setShowEditUserModal(false)}>Cancelar</button>
              <button type="submit" className="primary-btn" disabled={savingUser}>
                {savingUser ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: Novo SuperAdmin */}
      {showNewSAModal && (
        <Modal title="Novo SuperAdmin" onClose={() => setShowNewSAModal(false)}>
          <form onSubmit={handleCreateSuperAdmin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input className="form-input" type="text" value={newSAName} onChange={e => setNewSAName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input className="form-input" type="email" value={newSAEmail} onChange={e => setNewSAEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Senha</label>
              <input className="form-input" type="password" value={newSAPassword} onChange={e => setNewSAPassword(e.target.value)} required />
            </div>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button type="button" className="secondary-btn" onClick={() => setShowNewSAModal(false)}>Cancelar</button>
              <button type="submit" className="primary-btn" disabled={creatingSA}>
                {creatingSA ? "Criando..." : "Criar SuperAdmin"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* TOAST */}
      {toast && (
        <div className={`toast ${toast.type === "error" ? "toast-error" : ""}`}>
          {toast.type === "error" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Componentes auxiliares
// ─────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, sub, color }) {
  return (
    <div style={{
      background: "var(--card-bg)",
      border: "1px solid var(--card-border)",
      borderRadius: "1rem",
      padding: "1.25rem",
      display: "flex", alignItems: "flex-start", gap: "1rem"
    }}>
      <div style={{ color, background: `${color}20`, borderRadius: "0.75rem", padding: "0.6rem" }}>{icon}</div>
      <div>
        <div style={{ fontSize: "1.75rem", fontWeight: 700, lineHeight: 1.1 }}>{value ?? "—"}</div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{label}</div>
        {sub && <div style={{ fontSize: "0.75rem", color, marginTop: "0.2rem" }}>{sub}</div>}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
    }}>
      <div style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "1rem",
        padding: "1.5rem",
        width: "100%", maxWidth: "440px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
