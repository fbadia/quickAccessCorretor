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
  ChevronDown,
  Sun,
  Moon,
  AlertTriangle,
  CheckCircle2,
  Lock,
  LogIn,
  FileText,
  Upload,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  Zap
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { useRegisterSW } from "virtual:pwa-register/react";
import SuperadminDashboard from "./SuperadminDashboard.jsx";

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
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  
  // Endorsement states
  const [pendingEndorsements, setPendingEndorsements] = useState([]);
  const [endorsementHistory, setEndorsementHistory] = useState([]);
  const [endorsementHistoryOpen, setEndorsementHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [uploadReport, setUploadReport] = useState(null); // { policies, applied, pending }
  const [showUploadReport, setShowUploadReport] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingEndorsement, setLinkingEndorsement] = useState(null);
  const [linkPolicySearch, setLinkPolicySearch] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  
  // States para edição de usuários pelo Admin
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserRole, setEditUserRole] = useState("broker");
  const [editUserPassword, setEditUserPassword] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  
  // UI states
  const [theme, setTheme] = useState("dark");
  const [toast, setToast] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

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
      // Superadmin não busca dados de apólices (não pertence a org)
      if (profile.role !== "superadmin") {
        fetchData();
        if (profile.role === "admin") {
          fetchAdminData();
        }
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
    const queryDigits = query.replace(/\D/g, "");
    const queryAlphanumeric = query.replace(/[^a-z0-9]/g, "");
    const cleanQueryName = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const filtered = vehicles.filter(v => {
      // 1. Busca por Placa (remove caracteres especiais de ambos)
      const cleanPlate = v.plate ? v.plate.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
      const plateMatch = queryAlphanumeric && cleanPlate && cleanPlate.includes(queryAlphanumeric);

      // 2. Busca por Nome (corta acentos e compara)
      const cleanName = v.policy?.client?.name 
        ? v.policy.client.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
        : "";
      const nameMatch = cleanName && cleanName.includes(cleanQueryName);

      // 3. Busca por CPF/CNPJ (compara apenas os dígitos, se a query contiver dígitos)
      const cleanCpf = v.policy?.client?.cpf_cnpj ? v.policy.client.cpf_cnpj.replace(/\D/g, "") : "";
      const cpfMatch = queryDigits && cleanCpf && cleanCpf.includes(queryDigits);

      // 4. Busca por Marca/Modelo
      const cleanBrand = v.brand_model ? v.brand_model.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
      const brandMatch = cleanBrand && cleanBrand.includes(cleanQueryName);

      // 5. Busca por Seguradora
      const cleanInsurer = v.policy?.insurer?.name ? v.policy.insurer.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
      const insurerMatch = cleanInsurer && cleanInsurer.includes(cleanQueryName);

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
        .select("*, organization:organizations(name)")
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
            storage_path,
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
        .eq("is_current", true)
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

  // Buscar dados da área administrativa (via backend autenticado)
  const fetchAdminData = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const token = session?.access_token;

      // 1. Buscar usuários da org via backend (escoped por org)
      const res = await fetch(`${backendUrl}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const users = await res.json();
        setUsersList(users || []);
      }
    } catch (err) {
      console.error("Erro ao buscar dados de admin:", err.message);
    }
  };

  // Buscar endossos pendentes da org (aba Pendências)
  const fetchPendingEndorsements = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const token = session?.access_token;
      const res = await fetch(`${backendUrl}/api/endorsements/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingEndorsements(data || []);
      }
    } catch (err) {
      console.error("Erro ao buscar endossos pendentes:", err.message);
    }
  };

  // Buscar histórico de endossos de uma apólice selecionada
  const fetchEndorsementHistory = async (policyId) => {
    if (!policyId) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("endorsements")
        .select("id, endorsement_number, endorsement_type, issued_at, storage_path")
        .eq("policy_id", policyId)
        .eq("status", "applied")
        .order("issued_at", { ascending: false });
      if (error) throw error;
      setEndorsementHistory(data || []);
    } catch (err) {
      console.error("Erro ao buscar histórico de endossos:", err.message);
    } finally {
      setLoadingHistory(false);
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

  // Abrir o PDF da apólice em nova aba (via proxy autenticado no backend)
  const handleViewPdf = async (policyId) => {
    if (!policyId || !session?.access_token) return;
    setPdfLoading(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const res = await fetch(`${backendUrl}/api/policies/${policyId}/download`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao obter o PDF");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const newTab = window.open(url, "_blank");
      // Liberar a URL temporária após a aba abrir
      if (newTab) {
        newTab.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
      } else {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast("Habilite popups neste site para visualizar o PDF.", "error");
      }
    } catch (err) {
      console.error("Erro ao abrir PDF:", err.message);
      showToast(err.message || "Não foi possível abrir o PDF.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToList(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToList(e.target.files);
    }
  };

  const addFilesToList = (files) => {
    const pdfs = Array.from(files).filter(file => file.type === "application/pdf" || file.name.endsWith(".pdf"));
    if (pdfs.length === 0) {
      showToast("Apenas arquivos PDF são permitidos.", "error");
      return;
    }

    const newEntries = pdfs.map(file => ({
      file,
      status: "pending",
      message: "Aguardando processamento"
    }));

    setSelectedFiles(prev => [...prev, ...newEntries]);
  };

  const removeFileFromList = (index) => {
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== index));
  };

  const clearFileList = () => {
    setSelectedFiles([]);
  };

  const handleUploadAndProcess = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);

    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
    const token = session?.access_token;

    const report = { policies: [], applied: [], pending: [] };

    for (let i = 0; i < selectedFiles.length; i++) {
      const current = selectedFiles[i];
      if (current.status === "success") continue;

      setSelectedFiles(prev => {
        const copy = [...prev];
        copy[i] = { ...copy[i], status: "uploading", message: "Enviando arquivo..." };
        return copy;
      });

      const formData = new FormData();
      formData.append("file", current.file);

      try {
        const res = await fetch(`${backendUrl}/api/policies/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          const docType = data.document_type || "policy";
          let successMsg = "";

          if (docType === "endorsement") {
            if (data.applied) {
              successMsg = `Endosso ${data.data?.endorsement_number || "s/n"} aplicado.`;
              report.applied.push({ name: current.file.name, endorsementNumber: data.data?.endorsement_number, endorsementId: data.endorsementId });
            } else {
              successMsg = `Endosso ${data.data?.endorsement_number || "s/n"} pendente — apólice base não encontrada.`;
              report.pending.push({ name: current.file.name, endorsementNumber: data.data?.endorsement_number, policyNumber: data.data?.policy_number, endorsementId: data.endorsementId });
            }
          } else {
            successMsg = `Apólice ${data.data?.apolice?.numero || data.data?.policy_number || ""} processada.`;
            report.policies.push({ name: current.file.name, policyNumber: data.data?.apolice?.numero || data.data?.policy_number });
          }

          setSelectedFiles(prev => {
            const copy = [...prev];
            copy[i] = { ...copy[i], status: data.alreadyExists ? "success" : "success", message: data.alreadyExists ? "Já processado anteriormente." : successMsg };
            return copy;
          });
        } else {
          setSelectedFiles(prev => {
            const copy = [...prev];
            copy[i] = { ...copy[i], status: "error", message: data.error || "Erro ao processar PDF." };
            return copy;
          });
        }
      } catch (err) {
        setSelectedFiles(prev => {
          const copy = [...prev];
          copy[i] = { ...copy[i], status: "error", message: "Erro de conexão com o servidor." };
          return copy;
        });
      }
    }

    setUploading(false);
    fetchData();
    fetchPendingEndorsements();

    // Mostrar relatório consolidado se houve algum resultado
    if (report.policies.length > 0 || report.applied.length > 0 || report.pending.length > 0) {
      setUploadReport(report);
      setShowUploadReport(true);
    } else {
      showToast("Envio e extração finalizados!");
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

  // Abrir modal de edição de usuário
  const openEditUserModal = (user) => {
    setEditingUser(user);
    setEditUserName(user.name || "");
    setEditUserEmail(user.email || "");
    setEditUserRole(user.role || "broker");
    setEditUserPassword("");
    setShowEditUserModal(true);
  };

  // Salvar usuário editado
  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!editUserName.trim() || !editUserEmail.trim()) return;

    setSavingUser(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const body = {
        name: editUserName.trim(),
        email: editUserEmail.trim(),
        role: editUserRole
      };
      if (editUserPassword) {
        body.password = editUserPassword;
      }

      const response = await fetch(`${backendUrl}/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(body)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Erro ao atualizar corretor.");
      }

      showToast("Corretor atualizado com sucesso!");
      setShowEditUserModal(false);
      fetchAdminData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingUser(false);
    }
  };

  // Toggle de status do usuário (is_active)
  const toggleUserStatus = async (userId, currentStatus) => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const response = await fetch(`${backendUrl}/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ is_active: !currentStatus })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Erro ao alterar status do corretor.");
      }

      showToast(`Corretor ${!currentStatus ? "ativado" : "desativado"} com sucesso!`);
      fetchAdminData();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Excluir usuário
  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Tem certeza que deseja EXCLUIR permanentemente o corretor "${userEmail}"?`)) {
      return;
    }

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const response = await fetch(`${backendUrl}/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`
        }
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Erro ao excluir corretor.");
      }

      showToast("Corretor excluído com sucesso!");
      fetchAdminData();
    } catch (err) {
      showToast(err.message, "error");
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

  // 2a. SUPERADMIN — Dashboard de controle da plataforma
  if (profile?.role === "superadmin") {
    return (
      <SuperadminDashboard
        session={session}
        profile={profile}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
    );
  }

  // 2b. DASHBOARD / TELA PRINCIPAL (admin/broker logado)
  return (
    <div className="app-container">
      {/* HEADER */}
      <header>
        <div className="logo-container" onClick={() => setIsAdminView(false)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}>
          <Zap className="logo-icon" size={24} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="logo-text">QuickAccess</span>
            {profile?.organization?.name && (
              <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 500, marginTop: "-2px" }}>
                {profile.organization.name}
              </span>
            )}
          </div>
        </div>
        <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {profile?.role === "admin" && (
            <div className="desktop-only">
              <button 
                onClick={() => setIsAdminView(!isAdminView)}
                className="primary-btn"
                style={{
                  padding: "6px 14px",
                  fontSize: "0.82rem",
                  background: isAdminView 
                    ? "rgba(255, 255, 255, 0.05)" 
                    : "linear-gradient(135deg, var(--accent-color), var(--secondary-accent))",
                  border: isAdminView ? "1px solid var(--border-color)" : "none",
                  color: "var(--text-primary)",
                  borderRadius: "20px",
                  height: "34px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  width: "auto"
                }}
              >
                {isAdminView ? <Search size={14} /> : <Shield size={14} />}
                {isAdminView ? "Ir para Busca" : "Painel Admin"}
              </button>
            </div>
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
              Importar apólices
            </button>
            <button 
              className={`tab-btn ${currentTab === "users" ? "active" : ""}`}
              onClick={() => setCurrentTab("users")}
            >
              Corretores
            </button>
            <button
              className={`tab-btn ${currentTab === "pending" ? "active" : ""}`}
              onClick={() => { setCurrentTab("pending"); fetchPendingEndorsements(); }}
              style={{ position: "relative" }}
            >
              Pendências
              {pendingEndorsements.length > 0 && (
                <span style={{
                  position: "absolute",
                  top: "6px",
                  right: "6px",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#ef4444"
                }} />
              )}
            </button>
          </div>

          {currentTab === "sync" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Box de Guia Rápido de Onboarding */}
              <div className="admin-card" style={{
                background: "linear-gradient(135deg, rgba(134, 59, 255, 0.08), rgba(6, 182, 212, 0.08))",
                borderColor: "rgba(134, 59, 255, 0.2)",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}>
                <h4 style={{ margin: 0, fontSize: "0.95rem", color: "#863bff", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Info size={16} /> Guia de Configuração da Corretora
                </h4>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                  Siga os passos abaixo para configurar o espaço da sua organização:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px", fontSize: "0.82rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "18px", height: "18px", borderRadius: "50%", background: "#863bff", color: "#fff", fontSize: "0.75rem", fontWeight: "bold", flexShrink: 0 }}>1</span>
                    <span><strong>Importe suas apólices:</strong> Use a área de upload abaixo para carregar os PDFs das apólices. A IA fará a extração em tempo real.</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "18px", height: "18px", borderRadius: "50%", background: "#863bff", color: "#fff", fontSize: "0.75rem", fontWeight: "bold", flexShrink: 0 }}>2</span>
                    <span><strong>Cadastre sua equipe:</strong> Vá na aba <strong>Corretores</strong> acima para adicionar corretores da sua equipe.</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "18px", height: "18px", borderRadius: "50%", background: "#863bff", color: "#fff", fontSize: "0.75rem", fontWeight: "bold", flexShrink: 0 }}>3</span>
                    <span><strong>Realize buscas:</strong> Clique em "Ir para Busca" no topo para consultar placas, nomes ou CPFs em segundos.</span>
                  </div>
                </div>
              </div>

              <div className="admin-card desktop-only-card">
                <h3 className="section-title" style={{ margin: 0 }}>Armazenamento Supabase Storage (S3)</h3>
                <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                  Faça o upload direto dos arquivos PDF de suas apólices. Os dados serão extraídos automaticamente pela IA (Gemini) e os arquivos salvos de forma isolada por organização.
                </p>

                {/* Área de Drag & Drop */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById("file-upload-input").click()}
                  style={{
                    border: isDragging ? "2px dashed #863bff" : "2px dashed rgba(255, 255, 255, 0.15)",
                    background: isDragging ? "rgba(134, 59, 255, 0.05)" : "rgba(255, 255, 255, 0.02)",
                    borderRadius: "12px",
                    padding: "2.5rem 1.5rem",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "10px"
                  }}
                >
                  <input
                    id="file-upload-input"
                    type="file"
                    multiple
                    accept=".pdf"
                    onChange={handleFileSelect}
                    style={{ display: "none" }}
                  />
                  <Upload size={32} color={isDragging ? "#863bff" : "var(--text-secondary)"} style={{ opacity: 0.8 }} />
                  <span style={{ fontSize: "0.95rem", fontWeight: 500 }}>
                    Arrastar e soltar PDFs de apólices aqui
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    ou clique para selecionar do seu computador (Máx. 10MB)
                  </span>
                </div>

                {/* Lista de Arquivos Selecionados */}
                {selectedFiles.length > 0 && (
                  <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                        Fila de Upload ({selectedFiles.length} arquivos)
                      </span>
                      <button
                        onClick={clearFileList}
                        disabled={uploading}
                        className="icon-btn"
                        style={{ fontSize: "0.8rem", color: "var(--danger-color)", display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none", cursor: "pointer" }}
                        title="Limpar todos os arquivos da fila"
                      >
                        Limpar Fila
                      </button>
                    </div>

                    <div style={{ 
                      maxHeight: "260px", 
                      overflowY: "auto", 
                      border: "1px solid rgba(255, 255, 255, 0.06)", 
                      borderRadius: "8px",
                      background: "rgba(0, 0, 0, 0.1)"
                    }}>
                      {selectedFiles.map((fileEntry, idx) => {
                        const sizeKB = (fileEntry.file.size / 1024).toFixed(1);
                        return (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 12px",
                              borderBottom: idx === selectedFiles.length - 1 ? "none" : "1px solid rgba(255, 255, 255, 0.04)",
                              fontSize: "0.85rem"
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
                              <FileText size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                              <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                                <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={fileEntry.file.name}>
                                  {fileEntry.file.name}
                                </span>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                  {sizeKB} KB • {fileEntry.message}
                                </span>
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                              {fileEntry.status === "pending" && <Clock size={16} color="#9ca3af" title="Aguardando upload" />}
                              {fileEntry.status === "uploading" && <RefreshCw size={16} className="animate-spin" color="#3b82f6" title="Enviando..." />}
                              {fileEntry.status === "success" && <CheckCircle2 size={16} color="#22c55e" title="Sucesso" />}
                              {fileEntry.status === "error" && <AlertTriangle size={16} color="#ef4444" title="Erro" />}
                              
                              <button
                                onClick={() => removeFileFromList(idx)}
                                disabled={uploading}
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "var(--text-muted)",
                                  opacity: uploading ? 0.3 : 1
                                }}
                                title="Remover"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      onClick={handleUploadAndProcess}
                      className="primary-btn"
                      disabled={uploading || selectedFiles.every(f => f.status === "success")}
                      style={{ marginTop: "10px", width: "100%", justifyContent: "center" }}
                    >
                      {uploading ? (
                        <>
                          <RefreshCw className="animate-spin" size={18} />
                          Processando Apólices...
                        </>
                      ) : (
                        <>
                          <Upload size={18} />
                          Iniciar Upload e Extração
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Banner informativo de Upload (Somente Mobile) */}
              <div className="admin-card mobile-only-card" style={{
                textAlign: "center",
                padding: "30px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px"
              }}>
                <Upload size={36} color="var(--text-secondary)" style={{ opacity: 0.6 }} />
                <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Importação de Apólices</h4>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                  A importação de PDFs e extração de dados via IA está otimizada para uso em computadores. 
                  Por favor, acesse a plataforma a partir de um desktop para carregar novos arquivos.
                </p>
              </div>
            </div>
          )}

          {currentTab === "users" && (
            <div className="admin-users-layout" style={{ gap: "16px" }}>
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
                    <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "6px", display: "block", lineHeight: "1.4" }}>
                      * <strong>Administrador:</strong> Acesso total para importar apólices e gerenciar corretores.
                      <br />
                      * <strong>Corretor:</strong> Acesso exclusivo para busca e visualização de apólices seguradas.
                    </span>
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
                      <div className="user-item-info" style={{ flex: 1, minWidth: 0 }}>
                        <span className="user-item-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                        <span className="user-item-email" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.75rem", color: "var(--text-secondary)" }}>{u.email}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span className={`role-tag role-${u.role}`}>{u.role}</span>
                        <span className={`status-badge ${u.is_active ? "status-active" : "status-expired"}`} style={{ fontSize: "0.75rem", padding: "2px 6px" }}>
                          {u.is_active ? "Ativo" : "Inativo"}
                        </span>
                        
                        {/* Ações (Apenas se não for o próprio usuário logado) */}
                        {u.id !== session?.user?.id ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <button
                              onClick={() => toggleUserStatus(u.id, u.is_active)}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" }}
                              title={u.is_active ? "Desativar corretor" : "Ativar corretor"}
                            >
                              {u.is_active
                                ? <ToggleRight size={20} color="#22c55e" />
                                : <ToggleLeft size={20} color="#6b7280" />}
                            </button>
                            <button
                              onClick={() => openEditUserModal(u)}
                              title="Editar"
                              className="icon-btn"
                              style={{ padding: "4px" }}
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              title="Excluir"
                              className="icon-btn"
                              style={{ padding: "4px", color: "var(--danger-color)" }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic", padding: "4px" }}>Você</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ABA: PENDÊNCIAS */}
          {currentTab === "pending" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="admin-card">
                <h3 className="section-title" style={{ margin: 0 }}>Endossos Pendentes</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px", marginBottom: "12px" }}>
                  Endossos cujo número de apólice não foi encontrado no sistema. Vincule-os manualmente ou aguarde expiração automática (7 dias).
                </p>

                {pendingEndorsements.length === 0 ? (
                  <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", textAlign: "center", padding: "24px 0" }}>
                    ✅ Nenhum endosso pendente no momento.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {pendingEndorsements.map(e => {
                      const typeLabels = {
                        vehicle_change: "Troca de Veículo",
                        insured_change: "Alteração de Segurado",
                        coverage_change: "Alteração de Cobertura",
                        other: "Outro"
                      };
                      const isUrgent = e.days_remaining !== null && e.days_remaining <= 2;
                      return (
                        <div key={e.id} style={{
                          background: "var(--bg-primary)",
                          border: `1px solid ${isUrgent ? "rgba(239,68,68,0.4)" : "var(--border-color)"}`,
                          borderRadius: "10px",
                          padding: "12px 14px",
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "12px",
                          flexWrap: "wrap"
                        }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: "200px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                                {typeLabels[e.endorsement_type] || "Endosso"}
                                {e.endorsement_number ? ` #${e.endorsement_number}` : ""}
                              </span>
                              <span style={{
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                padding: "2px 7px",
                                borderRadius: "99px",
                                background: isUrgent ? "rgba(239,68,68,0.15)" : "rgba(234,179,8,0.12)",
                                color: isUrgent ? "#ef4444" : "#ca8a04",
                                border: `1px solid ${isUrgent ? "rgba(239,68,68,0.3)" : "rgba(234,179,8,0.25)"}`,
                                flexShrink: 0
                              }}>
                                {e.days_remaining !== null ? `${e.days_remaining}d restante${e.days_remaining !== 1 ? "s" : ""}` : "Expirando"}
                              </span>
                            </div>
                            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                              Apólice no PDF: <strong>{e.raw_extracted_data?.policy_number || "—"}</strong>
                            </span>
                            <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                              Enviado em {new Date(e.created_at).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                          <button
                            className="secondary-btn"
                            style={{ fontSize: "0.82rem", padding: "6px 14px", flexShrink: 0, marginTop: "2px" }}
                            onClick={() => {
                              setLinkingEndorsement(e);
                              setLinkPolicySearch("");
                              setShowLinkModal(true);
                            }}
                          >
                            Vincular
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={`main-content search-view-layout ${selectedVehicle ? "has-selected" : ""}`}>
          <div className="search-results-pane" style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%" }}>
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

                  {selectedVehicle.policy?.storage_path && (
                    <button
                      id="btn-view-pdf"
                      onClick={() => handleViewPdf(selectedVehicle.policy.id)}
                      className="secondary-btn"
                      disabled={pdfLoading}
                      style={{ opacity: pdfLoading ? 0.7 : 1 }}
                    >
                      <FileText size={18} />
                      {pdfLoading ? "Carregando PDF..." : "Visualizar Apólice (PDF)"}
                    </button>
                  )}
                </div>

                {/* Histórico de Endossos — seção colapsável discreta */}
                {selectedVehicle.policy?.id && (
                  <div style={{ borderTop: "1px solid var(--border-color)", marginTop: "8px", paddingTop: "8px" }}>
                    <button
                      onClick={() => {
                        const opening = !endorsementHistoryOpen;
                        setEndorsementHistoryOpen(opening);
                        if (opening && endorsementHistory.length === 0) {
                          fetchEndorsementHistory(selectedVehicle.policy.id);
                        }
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-secondary)",
                        fontSize: "0.78rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 0",
                        width: "100%"
                      }}
                    >
                      <ChevronDown
                        size={13}
                        style={{
                          transition: "transform 0.2s",
                          transform: endorsementHistoryOpen ? "rotate(180deg)" : "rotate(0deg)"
                        }}
                      />
                      Histórico de Endossos
                      {endorsementHistory.length > 0 && (
                        <span style={{ marginLeft: "4px", opacity: 0.7 }}>({endorsementHistory.length})</span>
                      )}
                    </button>

                    {endorsementHistoryOpen && (
                      <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                        {loadingHistory ? (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", padding: "4px 0" }}>Carregando...</span>
                        ) : endorsementHistory.length === 0 ? (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", padding: "4px 0" }}>Nenhum endosso aplicado.</span>
                        ) : endorsementHistory.map(e => {
                          const typeLabels = {
                            vehicle_change: "Troca de Veículo",
                            insured_change: "Alteração de Segurado",
                            coverage_change: "Alteração de Cobertura",
                            other: "Outro"
                          };
                          return (
                            <div key={e.id} style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                              padding: "4px 6px",
                              borderRadius: "6px",
                              background: "rgba(255,255,255,0.03)",
                              fontSize: "0.75rem",
                              color: "var(--text-secondary)"
                            }}>
                              <span>
                                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                                  {typeLabels[e.endorsement_type] || "Endosso"}
                                </span>
                                {e.endorsement_number ? ` #${e.endorsement_number}` : ""}
                                {e.issued_at ? ` · ${new Date(e.issued_at).toLocaleDateString("pt-BR")}` : ""}
                              </span>
                              {e.storage_path && (
                                <button
                                  title="Ver PDF do endosso"
                                  onClick={async () => {
                                    try {
                                      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
                                      const token = session?.access_token;
                                      const res = await fetch(`${backendUrl}/api/endorsements/${e.id}/download`, {
                                        headers: { Authorization: `Bearer ${token}` }
                                      });
                                      if (!res.ok) throw new Error("Erro ao baixar PDF");
                                      const blob = await res.blob();
                                      const url = URL.createObjectURL(blob);
                                      window.open(url, "_blank");
                                    } catch (err) {
                                      showToast("Erro ao abrir PDF do endosso", "error");
                                    }
                                  }}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "var(--text-secondary)",
                                    padding: "2px",
                                    display: "flex",
                                    alignItems: "center"
                                  }}
                                >
                                  <FileText size={13} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {/* MODAL: RELATÓRIO DE IMPORTAÇÃO */}
      {showUploadReport && uploadReport && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
        }}>
          <div style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--border-radius-lg)",
            padding: "1.5rem", width: "100%", maxWidth: "480px",
            boxShadow: "var(--shadow-lg)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Relatório de Importação</h3>
              <button onClick={() => setShowUploadReport(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {uploadReport.policies.length > 0 && (
                <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <p style={{ margin: 0, fontWeight: 600, color: "#22c55e", marginBottom: "6px" }}>
                    ✅ {uploadReport.policies.length} apólice{uploadReport.policies.length !== 1 ? "s" : ""} importada{uploadReport.policies.length !== 1 ? "s" : ""}
                  </p>
                  {uploadReport.policies.map((p, i) => (
                    <p key={i} style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>• {p.policyNumber || p.name}</p>
                  ))}
                </div>
              )}
              {uploadReport.applied.length > 0 && (
                <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
                  <p style={{ margin: 0, fontWeight: 600, color: "#818cf8", marginBottom: "6px" }}>
                    🔄 {uploadReport.applied.length} endosso{uploadReport.applied.length !== 1 ? "s" : ""} aplicado{uploadReport.applied.length !== 1 ? "s" : ""}
                  </p>
                  {uploadReport.applied.map((e, i) => (
                    <p key={i} style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>• Endosso {e.endorsementNumber || "s/n"}</p>
                  ))}
                </div>
              )}
              {uploadReport.pending.length > 0 && (
                <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }}>
                  <p style={{ margin: 0, fontWeight: 600, color: "#ca8a04", marginBottom: "6px" }}>
                    ⚠️ {uploadReport.pending.length} endosso{uploadReport.pending.length !== 1 ? "s" : ""} pendente{uploadReport.pending.length !== 1 ? "s" : ""} — apólice base não encontrada
                  </p>
                  {uploadReport.pending.map((e, i) => (
                    <p key={i} style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      • Endosso {e.endorsementNumber || "s/n"} (apólice: {e.policyNumber || "desconhecida"})
                    </p>
                  ))}
                  <button
                    style={{ marginTop: "8px", background: "none", border: "none", cursor: "pointer", color: "#ca8a04", fontSize: "0.82rem", padding: 0, textDecoration: "underline" }}
                    onClick={() => { setShowUploadReport(false); setCurrentTab("pending"); fetchPendingEndorsements(); }}
                  >
                    Ir para Pendências →
                  </button>
                </div>
              )}
            </div>
            <button className="primary-btn" style={{ width: "100%", marginTop: "1rem" }} onClick={() => setShowUploadReport(false)}>Fechar</button>
          </div>
        </div>
      )}

      {/* MODAL: VINCULAR ENDOSSO A APÓLICE */}
      {showLinkModal && linkingEndorsement && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1001,
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
        }}>
          <div style={{
            background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
            borderRadius: "var(--border-radius-lg)", padding: "1.5rem",
            width: "100%", maxWidth: "480px", boxShadow: "var(--shadow-lg)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem" }}>Vincular Endosso a Apólice</h3>
              <button onClick={() => setShowLinkModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "12px" }}>
              Endosso: <strong>{linkingEndorsement.raw_extracted_data?.endorsement_number || "s/n"}</strong> — Apólice informada no PDF: <strong>{linkingEndorsement.raw_extracted_data?.policy_number || "—"}</strong>
            </p>
            <input
              className="form-input"
              type="text"
              placeholder="Buscar por placa, nome ou número de apólice..."
              value={linkPolicySearch}
              onChange={e => setLinkPolicySearch(e.target.value)}
              style={{ marginBottom: "10px" }}
            />
            <div style={{ maxHeight: "240px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
              {vehicles
                .filter(v => {
                  const q = linkPolicySearch.toLowerCase();
                  if (!q) return true;
                  return (
                    v.plate?.toLowerCase().includes(q) ||
                    v.policy?.client?.name?.toLowerCase().includes(q) ||
                    v.policy?.policy_number?.toLowerCase().includes(q)
                  );
                })
                .slice(0, 20)
                .map(v => (
                  <button
                    key={v.id}
                    onClick={async () => {
                      if (!v.policy?.id) return;
                      setLinkLoading(true);
                      try {
                        const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
                        const token = session?.access_token;
                        const res = await fetch(`${backendUrl}/api/endorsements/${linkingEndorsement.id}/link`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ policy_id: v.policy.id })
                        });
                        if (!res.ok) {
                          const err = await res.json();
                          throw new Error(err.error || "Erro ao vincular.");
                        }
                        showToast("Endosso vinculado e aplicado com sucesso!");
                        setShowLinkModal(false);
                        fetchPendingEndorsements();
                        fetchData();
                      } catch (err) {
                        showToast(err.message, "error");
                      } finally {
                        setLinkLoading(false);
                      }
                    }}
                    disabled={linkLoading}
                    style={{
                      background: "var(--bg-primary)", border: "1px solid var(--border-color)",
                      borderRadius: "8px", padding: "8px 12px", cursor: "pointer",
                      textAlign: "left", opacity: linkLoading ? 0.6 : 1,
                      display: "flex", flexDirection: "column", gap: "2px"
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{v.plate} — {v.policy?.client?.name}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Apólice: {v.policy?.policy_number}</span>
                  </button>
                ))
              }
              {vehicles.filter(v => {
                const q = linkPolicySearch.toLowerCase();
                if (!q) return true;
                return (v.plate?.toLowerCase().includes(q) || v.policy?.client?.name?.toLowerCase().includes(q) || v.policy?.policy_number?.toLowerCase().includes(q));
              }).length === 0 && (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", textAlign: "center", padding: "12px 0" }}>Nenhuma apólice encontrada.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE USUÁRIO (PARA ADMIN DA ORG) */}
      {showEditUserModal && editingUser && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem"
        }}>
          <div style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--border-radius-lg)",
            padding: "1.5rem",
            width: "100%",
            maxWidth: "440px",
            boxShadow: "var(--shadow-lg)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Editar Corretor</h3>
              <button onClick={() => setShowEditUserModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveUser} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group" style={{ margin: 0 }}>
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
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">E-mail</label>
                <input
                  className="form-input"
                  type="email"
                  value={editUserEmail}
                  onChange={e => setEditUserEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
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
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Acesso / Role</label>
                <select
                  className="form-select"
                  value={editUserRole}
                  onChange={e => setEditUserRole(e.target.value)}
                >
                  <option value="broker">Corretor (Apenas Consulta)</option>
                  <option value="admin">Administrador (Consulta e Sync)</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                <button type="button" className="secondary-btn" style={{ padding: "10px 16px" }} onClick={() => setShowEditUserModal(false)}>Cancelar</button>
                <button type="submit" className="primary-btn" style={{ padding: "10px 16px" }} disabled={savingUser}>
                  {savingUser ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PWA UPDATE BANNER */}
      <PWAUpdateBanner />

      {/* TOAST POPUP */}
      {toast && (
        <div className={`toast ${toast.type === "error" ? "toast-error" : ""}`}>
          {toast.type === "error" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* BOTTOM NAVIGATION FOR ADMINS ON MOBILE */}
      {profile?.role === "admin" && (
        <div className="bottom-nav">
          <button 
            className={`bottom-nav-item ${!isAdminView ? "active" : ""}`}
            onClick={() => setIsAdminView(false)}
          >
            <Search size={20} />
            <span>Busca</span>
          </button>
          <button 
            className={`bottom-nav-item ${isAdminView ? "active" : ""}`}
            onClick={() => setIsAdminView(true)}
          >
            <Shield size={20} />
            <span>Admin</span>
          </button>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------
// Componente PWA — Banner de atualização disponível
// -------------------------------------------------------
function PWAUpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log("[PWA] Service Worker registrado:", r);
    },
    onRegisterError(error) {
      console.error("[PWA] Erro ao registrar Service Worker:", error);
    },
  });

  const handleUpdate = () => {
    updateServiceWorker(true);
  };

  const handleDismiss = () => {
    setNeedRefresh(false);
  };

  if (!needRefresh) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: "1.5rem",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      padding: "0.875rem 1.25rem",
      background: "linear-gradient(135deg, #1e1e2e 0%, #2a1f3d 100%)",
      border: "1px solid rgba(134, 59, 255, 0.4)",
      borderRadius: "1rem",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(134,59,255,0.15)",
      backdropFilter: "blur(12px)",
      animation: "slideUpBanner 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
      maxWidth: "calc(100vw - 2rem)",
      whiteSpace: "nowrap",
    }}>
      <style>{`
        @keyframes slideUpBanner {
          from { opacity: 0; transform: translateX(-50%) translateY(1.5rem); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <span style={{ fontSize: "1.25rem" }}>🚀</span>

      <span style={{
        color: "#e0d4ff",
        fontSize: "0.9rem",
        fontWeight: 500,
      }}>
        Nova versão disponível!
      </span>

      <button
        id="pwa-update-btn"
        onClick={handleUpdate}
        style={{
          background: "linear-gradient(135deg, #863bff, #6a2dd4)",
          color: "#fff",
          border: "none",
          borderRadius: "0.6rem",
          padding: "0.45rem 1rem",
          fontSize: "0.85rem",
          fontWeight: 600,
          cursor: "pointer",
          transition: "opacity 0.2s",
          whiteSpace: "nowrap",
        }}
        onMouseOver={e => e.currentTarget.style.opacity = "0.85"}
        onMouseOut={e => e.currentTarget.style.opacity = "1"}
      >
        Atualizar
      </button>

      <button
        id="pwa-dismiss-btn"
        onClick={handleDismiss}
        title="Dispensar"
        style={{
          background: "transparent",
          color: "#9880cc",
          border: "none",
          borderRadius: "0.4rem",
          padding: "0.3rem 0.5rem",
          fontSize: "1rem",
          cursor: "pointer",
          lineHeight: 1,
          transition: "color 0.2s",
        }}
        onMouseOver={e => e.currentTarget.style.color = "#e0d4ff"}
        onMouseOut={e => e.currentTarget.style.color = "#9880cc"}
      >
        ✕
      </button>
    </div>
  );
}
