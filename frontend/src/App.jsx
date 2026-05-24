import React, { useState, useEffect } from "react";
import { 
  Search, 
  Phone, 
  MessageSquare, 
  Copy, 
  UserPlus, 
  RefreshCw, 
  LogOut, 
  User, 
  Shield, 
  Mail, 
  Info,
  Car,
  Clock,
  ExternalLink,
  ChevronRight,
  Sun,
  Moon,
  AlertTriangle,
  CheckCircle2,
  Lock,
  LogIn
} from "lucide-react";
import { supabase } from "./supabaseClient";

export default function App() {
  // Authentication states
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authMode, setAuthMode] = useState("login"); // "login" ou "signup"
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState(null);
  
  // Data states
  const [vehicles, setVehicles] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Admin dashboard states
  const [isAdminView, setIsAdminView] = useState(false);
  const [currentTab, setCurrentTab] = useState("sync");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState("broker");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  
  // UI states
  const [theme, setTheme] = useState("dark");
  const [toast, setToast] = useState(null);

  // Monitorar estado de autenticação
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setProfile(null);
        setVehicles([]);
        setSearchResults([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Monitorar tema
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Buscar dados quando logado
  useEffect(() => {
    if (session && profile) {
      fetchData();
      if (profile.role === "admin") {
        fetchAdminData();
      }
    }
  }, [session, profile]);

  // Filtragem de busca local instantânea
  useEffect(() => {
    if (!searchQuery) {
      setSearchResults(vehicles.slice(0, 10)); // Mostrar os 10 mais recentes por padrão
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = vehicles.filter(v => {
      const plateMatch = v.plate && v.plate.toLowerCase().includes(query);
      const nameMatch = v.policy?.client?.name && v.policy.client.name.toLowerCase().includes(query);
      const cpfMatch = v.policy?.client?.cpf_cnpj && v.policy.client.cpf_cnpj.replace(/\D/g, "").includes(query.replace(/\D/g, ""));
      const brandMatch = v.brand_model && v.brand_model.toLowerCase().includes(query);
      const insurerMatch = v.policy?.insurer?.name && v.policy.insurer.name.toLowerCase().includes(query);

      return plateMatch || nameMatch || cpfMatch || brandMatch || insurerMatch;
    });

    setSearchResults(filtered);
  }, [searchQuery, vehicles]);

  // Mostrar Toast temporário
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Buscar perfil do usuário
  const fetchUserProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      
      if (error) throw error;
      setProfile(data);
    } catch (err) {
      console.error("Erro ao carregar perfil:", err.message);
      showToast("Erro ao carregar dados do usuário", "error");
    }
  };

  // Buscar dados principais (veículos + apólices)
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .select(`
          id,
          plate,
          brand_model,
          year,
          policy:policies (
            id,
            policy_number,
            start_date,
            end_date,
            client:clients (
              id,
              name,
              cpf_cnpj
            ),
            insurer:insurers (
              id,
              name,
              assistance_phone,
              assistance_whatsapp,
              claims_phone,
              claims_url
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setVehicles(data || []);
      setSearchResults(data ? data.slice(0, 10) : []);
    } catch (err) {
      console.error("Erro ao buscar apólices:", err.message);
      showToast("Erro ao sincronizar com o banco", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Buscar dados da área administrativa
  const fetchAdminData = async () => {
    try {
      // 1. Buscar lista de corretores
      const { data: users, error: usersErr } = await supabase
        .from("profiles")
        .select("*")
        .order("name", { ascending: true });

      if (usersErr) throw usersErr;
      setUsersList(users || []);

      // 2. Buscar status da sincronização do backend
      fetchBackendSyncStatus();
    } catch (err) {
      console.error("Erro ao buscar dados de admin:", err.message);
    }
  };

  const fetchBackendSyncStatus = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const res = await fetch(`${backendUrl}/sync/status`);
      if (res.ok) {
        const status = await res.json();
        setSyncStatus(status);
      }
    } catch (err) {
      console.warn("Backend offline ou não configurado para status de sync.");
    }
  };

  // Autenticação por E-mail e Senha (Login e Cadastro)
  const handleAuth = async (e) => {
    e.preventDefault();
    if (!authEmail || !authPassword || (authMode === "signup" && !authName)) return;

    setAuthLoading(true);
    setAuthMessage(null);
    try {
      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        showToast("Login realizado com sucesso!");
      } else {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            data: {
              name: authName,
              role: "broker", // papel padrão do novo corretor
            }
          }
        });
        if (error) throw error;
        setAuthMessage({
          type: "success",
          text: "Cadastro realizado com sucesso! Se o Supabase exigir confirmação, verifique seu e-mail."
        });
        // Limpar campos de cadastro
        setAuthName("");
        setAuthPassword("");
      }
    } catch (err) {
      setAuthMessage({
        type: "error",
        text: err.message || "Ocorreu um erro no processo de autenticação."
      });
    } finally {
      setAuthLoading(false);
    }
  };

  // Efetuar Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  // Copiar dados para o Clipboard
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copiado!`);
  };

  // Copiar resumo formatado para o WhatsApp
  const copyFormattedSummary = (veh) => {
    const p = veh.policy;
    const c = p?.client;
    const ins = p?.insurer;
    
    const summary = `*DADOS DO SEGURADO*
Cliente: ${c?.name || "N/A"}
CPF/CNPJ: ${c?.cpf_cnpj || "N/A"}

*VEÍCULO*
Modelo: ${veh.brand_model || "N/A"}
Placa: ${veh.plate || "N/A"}
Ano: ${veh.year || "N/A"}

*APÓLICE*
Seguradora: ${ins?.name || "N/A"}
Nº Apólice: ${p?.policy_number || "N/A"}
Vigência: ${formatDate(p?.start_date)} até ${formatDate(p?.end_date)}`;

    copyToClipboard(summary, "Resumo da apólice");
  };

  // Disparar sincronização no backend
  const triggerBackendSync = async () => {
    setSyncLoading(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const res = await fetch(`${backendUrl}/sync`, { method: "POST" });
      if (res.ok) {
        showToast("Sincronização iniciada em segundo plano!");
        // Poll status every 3 seconds while syncing
        const interval = setInterval(async () => {
          const statusRes = await fetch(`${backendUrl}/sync/status`);
          if (statusRes.ok) {
            const status = await statusRes.json();
            setSyncStatus(status);
            if (status.status !== "running") {
              clearInterval(interval);
              fetchData(); // Recarregar apólices
              showToast("Sincronização concluída!");
            }
          }
        }, 3000);
      } else {
        const err = await res.json();
        showToast(err.message || "Erro ao iniciar sincronização", "error");
      }
    } catch (err) {
      showToast("Não foi possível conectar ao servidor backend", "error");
    } finally {
      setSyncLoading(false);
    }
  };

  // Cadastrar novo Corretor (Admin cria registro de usuário no backend)
  const handleInviteUser = async (e) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName || !invitePassword || !inviteRole) return;

    setInviteLoading(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const response = await fetch(`${backendUrl}/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          email: inviteEmail,
          password: invitePassword,
          name: inviteName,
          role: inviteRole
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao cadastrar corretor.");
      }

      showToast(`Corretor ${inviteName} cadastrado com sucesso!`);
      setInviteEmail("");
      setInviteName("");
      setInvitePassword("");
      fetchAdminData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setInviteLoading(false);
    }
  };

  // Funções Auxiliares
  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  };

  const isPolicyActive = (endDateStr) => {
    if (!endDateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(endDateStr);
    return endDate >= today;
  };

  // -----------------------------------------------------
  // RENDERIZAÇÃO
  // -----------------------------------------------------

  // 1. TELA DE LOGIN (MAGIC LINK)
  if (!session) {
    return (
      <div className="app-container">
        <header>
          <div className="logo-container">
            <Shield className="logo-icon" size={24} />
            <span className="logo-text">QuickAccess</span>
          </div>
          <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>
        <div className="auth-page">
          <div className="auth-card">
            <div className="auth-header">
              <h1 className="auth-title">Acesso Corretor</h1>
              <p className="auth-subtitle">Digite seu e-mail e senha para entrar no sistema.</p>
            </div>
            
            <form onSubmit={handleAuth}>
              <div className="form-group">
                <label className="form-label" htmlFor="email">E-mail Corporativo</label>
                <input 
                  id="email"
                  type="email"
                  placeholder="exemplo@corretora.com.br"
                  className="form-input"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password">Senha</label>
                <input 
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="form-input"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              
              <button type="submit" className="primary-btn" disabled={authLoading}>
                {authLoading ? (
                  <RefreshCw className="animate-spin" size={20} />
                ) : (
                  <LogIn size={20} />
                )}
                {authLoading ? "Processando..." : "Entrar"}
              </button>
            </form>

            {authMessage && (
              <div style={{
                marginTop: "20px",
                padding: "12px",
                borderRadius: "8px",
                backgroundColor: authMessage.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                color: authMessage.type === "success" ? "var(--accent-color)" : "var(--danger-color)",
                fontSize: "0.9rem",
                display: "flex",
                gap: "8px",
                alignItems: "center"
              }}>
                {authMessage.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                <span style={{ textAlign: "left" }}>{authMessage.text}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. DASHBOARD / TELA PRINCIPAL (LOGADO)
  return (
    <div className="app-container">
      {/* HEADER */}
      <header>
        <div className="logo-container" onClick={() => setIsAdminView(false)} style={{ cursor: "pointer" }}>
          <Shield className="logo-icon" size={24} />
          <span className="logo-text">QuickAccess</span>
        </div>
        <div className="header-actions">
          {profile?.role === "admin" && (
            <button 
              className={`icon-btn ${isAdminView ? "active" : ""}`} 
              onClick={() => setIsAdminView(!isAdminView)}
              title="Painel Admin"
              style={{ color: isAdminView ? "var(--accent-color)" : "inherit" }}
            >
              <Shield size={20} />
            </button>
          )}
          <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button className="icon-btn" onClick={handleLogout} title="Sair">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* VIEW ADMIN */}
      {isAdminView && profile?.role === "admin" ? (
        <div className="main-content">
          <div className="tabs-container">
            <button 
              className={`tab-btn ${currentTab === "sync" ? "active" : ""}`}
              onClick={() => setCurrentTab("sync")}
            >
              Monitoramento
            </button>
            <button 
              className={`tab-btn ${currentTab === "users" ? "active" : ""}`}
              onClick={() => setCurrentTab("users")}
            >
              Corretores
            </button>
          </div>

          {currentTab === "sync" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="admin-card">
                <h3 className="section-title" style={{ margin: 0 }}>Sincronização Google Drive</h3>
                <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                  Importa e atualiza as apólices em PDF localizadas na pasta monitorada do Drive.
                </p>
                
                {syncStatus && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div className="sync-status-box">
                      <span style={{ fontSize: "0.9rem" }}>Status do Servidor:</span>
                      <div className="status-indicator">
                        <span className={`indicator-dot dot-${syncStatus.status}`} />
                        <span style={{ textTransform: "capitalize" }}>{syncStatus.status}</span>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.85rem" }}>
                      <div className="sync-status-box" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                        <span style={{ color: "var(--text-secondary)" }}>Total Lidos:</span>
                        <strong style={{ fontSize: "1.2rem" }}>{syncStatus.totalFiles}</strong>
                      </div>
                      <div className="sync-status-box" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                        <span style={{ color: "var(--text-secondary)" }}>Novas Apólices:</span>
                        <strong style={{ fontSize: "1.2rem", color: "var(--accent-color)" }}>{syncStatus.successCount}</strong>
                      </div>
                    </div>

                    {syncStatus.lastRun && (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "right" }}>
                        Última execução: {new Date(syncStatus.lastRun).toLocaleString("pt-BR")}
                      </span>
                    )}

                    {syncStatus.errors && syncStatus.errors.length > 0 && (
                      <div style={{ 
                        marginTop: "10px", 
                        padding: "10px", 
                        backgroundColor: "rgba(239, 68, 68, 0.05)", 
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        borderRadius: "8px"
                      }}>
                        <span style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--danger-color)" }}>Erros Recentes:</span>
                        <div style={{ maxHeight: "80px", overflowY: "auto", fontSize: "0.75rem", marginTop: "4px" }}>
                          {syncStatus.errors.map((e, idx) => (
                            <div key={idx} style={{ marginBottom: "4px", color: "var(--text-secondary)" }}>
                              • <strong>{e.file}</strong>: {e.error}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button 
                  onClick={triggerBackendSync} 
                  className="primary-btn" 
                  disabled={syncLoading || syncStatus?.status === "running"}
                  style={{ marginTop: "8px" }}
                >
                  <RefreshCw className={syncLoading || syncStatus?.status === "running" ? "animate-spin" : ""} size={18} />
                  Sincronizar Agora
                </button>
              </div>
            </div>
          )}

          {currentTab === "users" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Form Convidar */}
              <div className="admin-card">
                <h3 className="section-title" style={{ margin: 0 }}>Adicionar Corretor</h3>
                <form onSubmit={handleInviteUser} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Nome Completo</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      required 
                      placeholder="ex: Lucas Martins"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">E-mail</label>
                    <input 
                      type="email" 
                      className="form-input" 
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required 
                      placeholder="ex: lucas@corretora.com.br"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Senha</label>
                    <input 
                      type="password" 
                      className="form-input" 
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      required 
                      minLength={6}
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Função / Acesso</label>
                    <select 
                      className="form-select"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                    >
                      <option value="broker">Corretor (Apenas Consulta)</option>
                      <option value="admin">Administrador (Consulta e Sync)</option>
                    </select>
                  </div>
                  <button type="submit" className="primary-btn" disabled={inviteLoading} style={{ marginTop: "4px" }}>
                    <UserPlus size={18} />
                    Salvar Corretor
                  </button>
                </form>
              </div>

              {/* Lista Corretores */}
              <div className="admin-card">
                <h3 className="section-title" style={{ margin: 0 }}>Corretores Cadastrados</h3>
                <div className="user-list">
                  {usersList.map((u) => (
                    <div key={u.id} className="user-item">
                      <div className="user-item-info">
                        <span className="user-item-name">{u.name}</span>
                        <span className="user-item-email">{u.email}</span>
                      </div>
                      <span className={`role-tag role-${u.role}`}>{u.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* VIEW BUSCA / CORRETOR */
        <div className="main-content">
          {/* SEARCH BAR */}
          <div className="search-wrapper">
            <input 
              type="text"
              placeholder="Buscar placa, nome ou CPF..."
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search className="search-icon" size={20} />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery("")}>
                &times;
              </button>
            )}
          </div>

          {/* LISTA RESULTADOS */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <h3 className="section-title">
              {searchQuery ? "Resultados da Busca" : "Pesquisas Recentes"}
            </h3>

            {isLoading ? (
              <div className="empty-state">
                <RefreshCw className="animate-spin" size={32} />
                <span>Carregando apólices...</span>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="results-list">
                {searchResults.map((veh) => (
                  <div 
                    key={veh.id} 
                    className="result-card"
                    onClick={() => setSelectedVehicle(veh)}
                  >
                    <div className="result-card-header">
                      <div>
                        <div className="client-name">{veh.policy?.client?.name}</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                          {veh.brand_model}
                        </div>
                      </div>
                      <span className="plate-badge">{veh.plate}</span>
                    </div>
                    <div className="result-card-body">
                      <span className="insurer-badge">{veh.policy?.insurer?.name}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        Vigência: {formatDate(veh.policy?.end_date)}
                        <span className={`status-badge ${isPolicyActive(veh.policy?.end_date) ? "status-active" : "status-expired"}`}>
                          {isPolicyActive(veh.policy?.end_date) ? "Ativa" : "Vencida"}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Info size={32} className="empty-state-icon" />
                <span>Nenhum cliente ou veículo encontrado.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SLIDE-UP DETAIL PANEL */}
      {selectedVehicle && (
        <div className="slide-panel-backdrop" onClick={() => setSelectedVehicle(null)}>
          <div className="slide-panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <span className="panel-title">Ficha do Segurado</span>
              <button className="icon-btn" onClick={() => setSelectedVehicle(null)}>&times;</button>
            </div>
            
            <div className="panel-content">
              {/* Cartão Veículo */}
              <div className="detail-card">
                <div className="detail-section-title">Veículo Segurado</div>
                <div className="detail-row">
                  <span className="detail-label">Modelo</span>
                  <span className="detail-value"><Car size={16} /> {selectedVehicle.brand_model}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Placa</span>
                  <span className="detail-value" style={{ letterSpacing: "0.5px", fontWeight: "800" }}>
                    {selectedVehicle.plate}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Ano</span>
                  <span className="detail-value">{selectedVehicle.year || "N/A"}</span>
                </div>
              </div>

              {/* Cartão Segurado */}
              <div className="detail-card">
                <div className="detail-section-title">Dados do Cliente</div>
                <div className="detail-row">
                  <span className="detail-label">Segurado</span>
                  <span 
                    className="detail-value copyable" 
                    onClick={() => copyToClipboard(selectedVehicle.policy?.client?.name, "Nome do segurado")}
                    title="Clique para copiar"
                  >
                    {selectedVehicle.policy?.client?.name} <Copy size={14} />
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">CPF/CNPJ</span>
                  <span 
                    className="detail-value copyable"
                    onClick={() => copyToClipboard(selectedVehicle.policy?.client?.cpf_cnpj, "CPF/CNPJ")}
                    title="Clique para copiar"
                  >
                    {selectedVehicle.policy?.client?.cpf_cnpj} <Copy size={14} />
                  </span>
                </div>
              </div>

              {/* Cartão Apólice */}
              <div className="detail-card">
                <div className="detail-section-title">Dados do Contrato</div>
                <div className="detail-row">
                  <span className="detail-label">Seguradora</span>
                  <span className="detail-value">{selectedVehicle.policy?.insurer?.name}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Nº Apólice</span>
                  <span 
                    className="detail-value copyable"
                    onClick={() => copyToClipboard(selectedVehicle.policy?.policy_number, "Número da apólice")}
                  >
                    {selectedVehicle.policy?.policy_number} <Copy size={14} />
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Vigência</span>
                  <span className="detail-value"><Clock size={16} /> {formatDate(selectedVehicle.policy?.start_date)} a {formatDate(selectedVehicle.policy?.end_date)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Situação</span>
                  <span className={`status-badge ${isPolicyActive(selectedVehicle.policy?.end_date) ? "status-active" : "status-expired"}`}>
                    {isPolicyActive(selectedVehicle.policy?.end_date) ? "Apólice Ativa" : "Apólice Expirada"}
                  </span>
                </div>
              </div>
            </div>

            {/* AÇÕES DE UM TOQUE NO RODAPÉ */}
            <div className="actions-footer">
              <a 
                href={`tel:${selectedVehicle.policy?.insurer?.assistance_phone?.replace(/\D/g, "")}`}
                className="primary-btn"
                style={{ textDecoration: "none" }}
              >
                <Phone size={18} />
                Ligar para Assistência 24h
              </a>
              
              {selectedVehicle.policy?.insurer?.assistance_whatsapp && (
                <a 
                  href={`https://wa.me/${selectedVehicle.policy.insurer.assistance_whatsapp}?text=${encodeURIComponent(
                    `Olá, preciso de suporte para o segurado ${selectedVehicle.policy.client?.name}, placa ${selectedVehicle.plate}, apólice nº ${selectedVehicle.policy.policy_number}.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="primary-btn whatsapp-btn"
                  style={{ textDecoration: "none" }}
                >
                  <MessageSquare size={18} />
                  WhatsApp da Seguradora
                </a>
              )}

              <button 
                onClick={() => copyFormattedSummary(selectedVehicle)}
                className="secondary-btn"
              >
                <Copy size={18} />
                Copiar Resumo para WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST POPUP */}
      {toast && (
        <div className={`toast ${toast.type === "error" ? "toast-error" : ""}`}>
          {toast.type === "error" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
