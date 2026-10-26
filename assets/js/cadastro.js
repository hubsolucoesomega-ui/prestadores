// Cadastro de prestador: regras por tipo e categoria, validação e envio.
(function () {
  const C = window.OmegaCommon;
  const form = document.getElementById("form");
  const alertBox = document.getElementById("alert");
  const submitBtn = document.getElementById("submit");
  const $ = (id) => document.getElementById(id);

  // Registro profissional exigido por categoria
  const REGISTRY = {
    "Advogados": { label: "Número da OAB *", hint: "Ex.: OAB/PR 12345. Confirmaremos no site da OAB.", doc: "Comprovante de inscrição na OAB", record: false },
    "Terapia": { label: "Número do CRP *", hint: "Ex.: CRP 08/12345. Confirmaremos no site do CFP.", doc: "Comprovante de inscrição no CRP", record: true },
    "Contabilidade": { label: "Número do CRC *", hint: "Ex.: CRC/PR 000000. Confirmaremos no site do CFC.", doc: "Comprovante de inscrição no CRC", record: false },
    "Seguros": { label: "Número de registro SUSEP *", hint: "Registro de corretor de seguros.", doc: "Comprovante do registro SUSEP", record: false },
    "Cuidado de idosos": { label: null, hint: "", doc: null, record: true },
    "Marketing": { label: null, hint: "", doc: null, record: false },
    "Casa e reparos": { label: null, hint: "", doc: null, record: false },
  };

  const selectedType = () => form.querySelector('input[name="provider_type"]:checked').value;
  const needsCNPJ = () => selectedType() !== "PF";

  function refreshRules() {
    const type = selectedType();
    $("cnpj-row").style.display = needsCNPJ() ? "" : "none";
    $("doc-cnpj-wrap").style.display = needsCNPJ() ? "" : "none";
    const cat = $("category").value;
    const rule = REGISTRY[cat];
    const hasRegistry = !!(rule && rule.label);
    $("registry-block").classList.toggle("show", hasRegistry);
    if (hasRegistry) {
      $("registry-label").textContent = rule.label;
      $("registry-hint").textContent = rule.hint;
    }
    $("doc-registry-wrap").style.display = hasRegistry && rule.doc ? "" : "none";
    if (rule && rule.doc) $("doc-registry-label").textContent = rule.doc + " *";
    $("doc-record-wrap").style.display = rule && rule.record ? "" : "none";
    return type;
  }

  function fieldError(name, msg) {
    const el = form.querySelector(`[data-err="${name}"]`);
    if (el) el.textContent = msg || "";
    return !msg;
  }

  function validate() {
    const v = (id) => $(id).value.trim();
    let ok = true;
    const check = (name, cond, msg) => { if (!fieldError(name, cond ? "" : msg)) ok = false; };

    check("full_name", v("full_name").length >= 5, "Informe seu nome completo.");
    check("cpf", C.isValidCPF(v("cpf")), "CPF inválido. Confira os números.");
    check("email", /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v("email")), "E-mail inválido.");
    check("phone", C.digits(v("phone")).length >= 10, "Informe um WhatsApp com DDD.");
    if (needsCNPJ()) check("cnpj", C.isValidCNPJ(v("cnpj")), "CNPJ inválido. Confira os números.");
    check("city", v("city").length >= 2, "Informe a cidade.");
    check("uf", v("uf") !== "", "Selecione a UF.");
    check("service_area", v("service_area").length >= 3, "Informe a área de atendimento.");
    check("category", v("category") !== "", "Selecione a categoria.");
    const years = Number(v("years_experience"));
    check("years_experience", v("years_experience") !== "" && years >= 0 && years <= 60, "Informe os anos de experiência (0 a 60).");

    const rule = REGISTRY[v("category")];
    if (rule && rule.label) check("professional_registry", v("registry_kind").length >= 3, "Informe o número do registro.");
    if (rule && rule.doc) check("doc_registry", $("doc_registry").files.length > 0, "Anexe o comprovante do registro.");
    if (rule && rule.record) check("doc_record", $("doc_record").files.length > 0, "Anexe a certidão de antecedentes.");

    check("doc_identity", $("doc_identity").files.length > 0, "Anexe um documento com foto.");
    check("doc_address", $("doc_address").files.length > 0, "Anexe um comprovante de endereço.");
    if (needsCNPJ()) check("doc_cnpj", $("doc_cnpj").files.length > 0, "Anexe o cartão CNPJ.");

    check("bank_name", v("bank_name").length >= 2, "Informe o banco.");
    check("bank_agency", C.digits(v("bank_agency")).length >= 3, "Informe a agência.");
    check("bank_account", C.digits(v("bank_account")).length >= 3, "Informe a conta com dígito.");
    check("terms", $("terms").checked, "Aceite os termos para continuar.");
    return ok;
  }

  function showAlert(kind, msg) {
    alertBox.className = "alert " + kind;
    alertBox.textContent = msg;
  }

  function fileNames(id) {
    const f = $(id).files;
    return f && f.length ? [f[0].name] : [];
  }

  form.addEventListener("change", (e) => {
    if (e.target.name === "provider_type" || e.target.id === "category") refreshRules();
  });
  $("description").addEventListener("input", (e) => { $("desc-count").textContent = e.target.value.length; });
  $("cpf").addEventListener("input", (e) => { const d = C.digits(e.target.value).slice(0, 11); e.target.value = d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (m, a, b, c, dd) => [a, b, c].join(".") + (dd ? "-" + dd : "")); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertBox.className = "alert";
    if (!validate()) {
      showAlert("fail", "Revise os campos destacados em vermelho.");
      return;
    }
    const v = (id) => $(id).value.trim();
    const rule = REGISTRY[v("category")];
    const record = {
      provider_type: selectedType(),
      full_name: v("full_name"),
      cpf: C.digits(v("cpf")),
      cnpj: needsCNPJ() ? C.digits(v("cnpj")) : null,
      email: v("email"),
      phone: C.digits(v("phone")),
      city: v("city"),
      uf: v("uf"),
      service_area: v("service_area"),
      category: v("category"),
      professional_registry: rule && rule.label ? v("registry_kind") : null,
      years_experience: Number(v("years_experience")),
      description: v("description").slice(0, 300) || null,
      bank_name: v("bank_name"),
      bank_agency: C.digits(v("bank_agency")),
      bank_account: C.digits(v("bank_account")),
      account_type: v("account_type"),
      // Só os nomes dos arquivos aqui. Os arquivos vão para Storage privado (ver README).
      documents: [
        ...fileNames("doc_identity").map((n) => ({ kind: "identidade", name: n })),
        ...fileNames("doc_address").map((n) => ({ kind: "endereco", name: n })),
        ...(needsCNPJ() ? fileNames("doc_cnpj").map((n) => ({ kind: "cnpj", name: n })) : []),
        ...(rule && rule.doc ? fileNames("doc_registry").map((n) => ({ kind: "registro", name: n })) : []),
        ...(rule && rule.record ? fileNames("doc_record").map((n) => ({ kind: "antecedentes", name: n })) : []),
      ],
      terms_accepted: true,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando...";
    try {
      await C.saveProvider(record);
      form.reset();
      refreshRules();
      showAlert("ok", "Cadastro enviado! Nossa equipe vai analisar seus dados e documentos. Você receberá um retorno pelo WhatsApp ou e-mail.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error(err);
      showAlert("fail", "Não foi possível enviar agora. Tente novamente em instantes.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Enviar cadastro para análise";
    }
  });

  if (!C.hasBackend()) $("demo-banner").hidden = false;
  refreshRules();
})();
