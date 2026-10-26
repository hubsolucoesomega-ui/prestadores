// Validadores e acesso a dados compartilhados entre cadastro e painel ADM.
// Sem configuração do Supabase, usa localStorage (modo demonstração).
window.OmegaCommon = (function () {
  const DEMO_KEY = "omega-providers-demo";

  const digits = (v) => (v || "").replace(/\D/g, "");

  function isValidCPF(v) {
    const c = digits(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    const calc = (len) => {
      let sum = 0;
      for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
      const r = (sum * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
  }

  function isValidCNPJ(v) {
    const c = digits(v);
    if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
    const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const calc = (weights) => {
      let sum = 0;
      for (let i = 0; i < weights.length; i++) sum += Number(c[i]) * weights[i];
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(W1) === Number(c[12]) && calc(W2) === Number(c[13]);
  }

  const hasBackend = () => {
    const cfg = window.OMEGA_CONFIG || {};
    return !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  };
  const client = () => window.supabase.createClient(window.OMEGA_CONFIG.supabaseUrl, window.OMEGA_CONFIG.supabaseAnonKey);

  function readDemo() {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]"); } catch { return []; }
  }
  function writeDemo(list) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(list)); } catch { /* sem armazenamento */ }
  }

  async function saveProvider(record) {
    if (hasBackend()) {
      const { error } = await client().from("providers").insert(record);
      if (error) throw error;
      return;
    }
    const list = readDemo();
    list.push({ ...record, id: crypto.randomUUID(), status: "pending", created_at: new Date().toISOString() });
    writeDemo(list);
  }

  async function listProviders() {
    if (hasBackend()) {
      const { data, error } = await client().from("providers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
    return readDemo().sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }

  async function setStatus(id, status, reason) {
    const reviewed_at = new Date().toISOString();
    if (hasBackend()) {
      const { error } = await client()
        .from("providers")
        .update({ status, rejection_reason: reason || null, reviewed_at })
        .eq("id", id);
      if (error) throw error;
      return;
    }
    const list = readDemo().map((p) => (p.id === id ? { ...p, status, rejection_reason: reason || null, reviewed_at } : p));
    writeDemo(list);
  }

  return { isValidCPF, isValidCNPJ, digits, hasBackend, saveProvider, listProviders, setStatus };
})();
