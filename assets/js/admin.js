// Painel ADM: lista cadastros, mostra detalhes e aprova ou reprova.
(function () {
  const C = window.OmegaCommon;
  const $ = (id) => document.getElementById(id);
  const LABEL = { pending: "Pendente", approved: "Aprovado", rejected: "Reprovado" };
  const TYPE = { PF: "Pessoa física", MEI: "MEI", ME: "ME/EPP", PJ: "Empresa (PJ)" };
  let all = [];
  let filter = "pending";
  let selectedId = null;

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mask = (v) => (v ? "•••" + String(v).slice(-3) : "—");
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

  function counts() {
    ["pending", "approved", "rejected"].forEach((s) => {
      $("c-" + s).textContent = "(" + all.filter((p) => p.status === s).length + ")";
    });
  }

  function renderList() {
    const items = all.filter((p) => filter === "all" || p.status === filter);
    $("list").innerHTML = items.length === 0
      ? '<div class="empty">Nenhum cadastro nesta lista.</div>'
      : items.map((p) => `
        <button class="item" type="button" data-id="${esc(p.id)}" aria-current="${p.id === selectedId}">
          <strong>${esc(p.full_name)}<span class="badge s-${esc(p.status)}">${LABEL[p.status]}</span></strong>
          <span>${esc(TYPE[p.provider_type] || p.provider_type)} · ${esc(p.category)} · ${esc(p.city)}/${esc(p.uf)} · ${date(p.created_at)}</span>
        </button>`).join("");
    $("list").querySelectorAll(".item").forEach((b) => b.addEventListener("click", () => select(b.dataset.id)));
  }

  function select(id) {
    selectedId = id;
    renderList();
    const p = all.find((x) => x.id === id);
    if (!p) return;
    const docs = Array.isArray(p.documents) ? p.documents : [];
    $("detail").innerHTML = `
      <h2 style="font-size:17px;margin:0 0 4px">${esc(p.full_name)} <span class="badge s-${esc(p.status)}">${LABEL[p.status]}</span></h2>
      <p style="color:#6b7a90;margin:0 0 12px">Cadastro em ${date(p.created_at)}${p.reviewed_at ? " · analisado em " + date(p.reviewed_at) : ""}</p>
      <dl>
        <dt>Tipo</dt><dd>${esc(TYPE[p.provider_type] || p.provider_type)}</dd>
        <dt>CPF</dt><dd>${mask(p.cpf)}</dd>
        <dt>CNPJ</dt><dd>${p.cnpj ? esc(p.cnpj) : "—"}</dd>
        <dt>E-mail</dt><dd>${esc(p.email)}</dd>
        <dt>WhatsApp</dt><dd>${esc(p.phone)}</dd>
        <dt>Cidade / UF</dt><dd>${esc(p.city)} / ${esc(p.uf)}</dd>
        <dt>Área</dt><dd>${esc(p.service_area)}</dd>
        <dt>Categoria</dt><dd>${esc(p.category)}</dd>
        <dt>Registro</dt><dd>${p.professional_registry ? esc(p.professional_registry) : "não exigido"}</dd>
        <dt>Experiência</dt><dd>${esc(p.years_experience)} anos</dd>
        <dt>Descrição</dt><dd>${esc(p.description || "—")}</dd>
        <dt>Banco</dt><dd>${esc(p.bank_name)} · ag. ${esc(p.bank_agency)} · conta ${mask(p.bank_account)} (${esc(p.account_type)})</dd>
      </dl>
      <h3 style="font-size:14px;margin:16px 0 4px">Documentos</h3>
      <ul class="docs">${docs.length ? docs.map((d) => `<li>${esc(d.kind)}: ${esc(d.name)}</li>`).join("") : "<li>Nenhum arquivo registrado.</li>"}</ul>
      ${p.rejection_reason ? `<p style="margin-top:10px;color:#b42318">Motivo: ${esc(p.rejection_reason)}</p>` : ""}
      <div class="actions">
        <button class="approve" type="button" data-act="approved">Aprovar</button>
        <button class="reject" type="button" data-act="rejected">Reprovar</button>
      </div>`;
    $("detail").querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => decide(p, b.dataset.act)));
  }

  async function decide(p, status) {
    let reason = null;
    if (status === "rejected") {
      reason = prompt("Motivo da reprovação (será enviado ao prestador):");
      if (!reason) return;
    }
    try {
      await C.setStatus(p.id, status, reason);
      await load();
      select(p.id);
    } catch (err) {
      console.error(err);
      alert("Não foi possível salvar a decisão. Tente novamente.");
    }
  }

  async function load() {
    all = await C.listProviders();
    counts();
    renderList();
  }

  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.f;
    document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderList();
  }));

  async function start() {
    if (!C.hasBackend()) {
      $("demo-banner").hidden = false;
      $("app").classList.remove("hidden");
      await load();
      return;
    }
    // Com Supabase: exige login de administrador
    const client = window.supabase.createClient(window.OMEGA_CONFIG.supabaseUrl, window.OMEGA_CONFIG.supabaseAnonKey);
    const { data } = await client.auth.getSession();
    const show = (logged) => {
      $("login").classList.toggle("hidden", logged);
      $("app").classList.toggle("hidden", !logged);
      $("logout").classList.toggle("hidden", !logged);
    };
    show(!!data.session);
    if (data.session) await load();

    $("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const { error } = await client.auth.signInWithPassword({ email: $("l-email").value, password: $("l-pass").value });
      if (error) { $("login-msg").textContent = "E-mail ou senha inválidos."; return; }
      show(true);
      await load();
    });
    $("logout").addEventListener("click", async () => { await client.auth.signOut(); location.reload(); });
  }

  start().catch((err) => { console.error(err); alert("Erro ao carregar o painel."); });
})();
