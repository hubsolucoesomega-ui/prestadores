// OmegaStore — camada única de dados do site (contas, serviços, livros, mídias).
// Com o banco central ligado (Worker + Cloudflare D1, rota /api), tudo é gravado no servidor e vale
// para todos os aparelhos. Sem o banco (ou abrindo o arquivo direto do computador), volta ao modo
// navegador: os dados ficam só neste navegador (localStorage).
window.OmegaStore = (function () {
  var ACCOUNTS = 'omega_prestadores';
  var SESSION = 'omega_prestador_session';
  var LEGACY_QUEUE = 'omega-providers-demo';

  // As 14 categorias de serviço do site (mesmos nomes da página inicial)
  var CATEGORIAS = [
    'Terapia e Bem-Estar', 'Advocacia e Jurídico', 'Contabilidade e Finanças', 'Serviços Domésticos',
    'Marido de Aluguel', 'Marketing e Vendas', 'Automação com IA', 'Engenharia e Reformas',
    'Gastronomia e Eventos', 'Fotografia e Conteúdo', 'Saúde e Estética', 'Educação e Cursos',
    'Transporte e Logística', 'Outros Serviços'
  ];
  // Gêneros de livros (mesmas chaves da página de livros)
  var GENEROS = [
    { key: 'suspense', label: 'Suspense e Policial' }, { key: 'romance', label: 'Romance' },
    { key: 'educacao', label: 'Educativos e Acadêmicos' }, { key: 'mentalidade', label: 'Mentalidade e Desenvolvimento' },
    { key: 'negocios', label: 'Negócios e Carreira' }, { key: 'saude', label: 'Saúde e Bem-Estar' },
    { key: 'espiritualidade', label: 'Espiritualidade e Fé' }, { key: 'infantil', label: 'Infantis e Juvenis' },
    { key: 'biografia', label: 'Biografias' }, { key: 'autoajuda', label: 'Autoajuda' },
    { key: 'ficcao', label: 'Ficção e Aventura' }
  ];
var SERVICOS_PADRAO = [{"title": "Terapia e Bem-Estar", "items": [{"name": "Psicoterapia individual", "description": "Sessões presenciais ou online com horário flexível.", "price": "A partir de R$ 150/h", "icon": "brain"}, {"name": "Terapia de casal", "description": "Atendimento para fortalecer a comunicação.", "price": "A partir de R$ 200/h", "icon": "heart-handshake"}, {"name": "Terapia online", "description": "Atendimento por vídeo, de onde você estiver.", "price": "A partir de R$ 120/h", "icon": "brain"}, {"name": "Massoterapia", "description": "Massagem relaxante e terapêutica para aliviar tensões.", "price": "A partir de R$ 120", "icon": "sparkles"}]}, {"title": "Advocacia e Jurídico", "items": [{"name": "Direito trabalhista", "description": "Orientação e acompanhamento de reclamações.", "price": "A partir de R$ 300", "icon": "scale"}, {"name": "Direito de família", "description": "Divórcio, pensão e guarda de filhos.", "price": "A partir de R$ 400", "icon": "scale"}, {"name": "Direito do consumidor", "description": "Negociação e ações contra empresas.", "price": "A partir de R$ 250", "icon": "scale"}]}, {"title": "Contabilidade e Finanças", "items": [{"name": "Contabilidade para MEI", "description": "Declarações, guias e controle mensal.", "price": "A partir de R$ 90/mês", "icon": "calculator"}, {"name": "Imposto de renda", "description": "Declaração de pessoa física com revisão.", "price": "A partir de R$ 150", "icon": "calculator"}, {"name": "Abertura de empresa", "description": "Registro, CNPJ e orientação tributária.", "price": "A partir de R$ 350", "icon": "briefcase-business"}, {"name": "Seguro auto", "description": "Cotação com várias seguradoras, sem custo.", "price": "Cotação grátis", "icon": "shield"}, {"name": "Seguro residencial", "description": "Proteção para casa e conteúdo.", "price": "A partir de R$ 35/mês", "icon": "shield"}, {"name": "Seguro de vida", "description": "Planos para família e patrimônio.", "price": "A partir de R$ 40/mês", "icon": "shield-check"}]}, {"title": "Serviços Domésticos", "items": [{"name": "Limpeza Residencial", "description": "Sua casa impecável com profissionais avaliados.", "price": "A partir de R$ 120", "icon": "spray-can"}, {"name": "Faxina pós-obra", "description": "Limpeza pesada após reformas e construções.", "price": "A partir de R$ 350", "icon": "spray-can"}, {"name": "Passadoria", "description": "Roupas passadas com cuidado, no seu endereço.", "price": "A partir de R$ 40/h", "icon": "spray-can"}, {"name": "Cuidador de idosos", "description": "Acompanhamento diário com profissional qualificado.", "price": "A partir de R$ 180/dia", "icon": "heart-handshake"}]}, {"title": "Marido de Aluguel", "items": [{"name": "Manutenção Elétrica", "description": "Instalações e reparos com segurança certificada.", "price": "A partir de R$ 150", "icon": "lightbulb"}, {"name": "Reparos hidráulicos", "description": "Vazamentos, torneiras, registros e descargas.", "price": "A partir de R$ 120", "icon": "wrench"}, {"name": "Montagem de móveis", "description": "Montagem e desmontagem com ferramentas próprias.", "price": "A partir de R$ 100", "icon": "wrench"}, {"name": "Pequenos reparos", "description": "Instalação de prateleiras, cortinas, suportes e mais.", "price": "A partir de R$ 80/h", "icon": "wrench"}]}, {"title": "Marketing e Vendas", "items": [{"name": "Gestão de redes sociais", "description": "Planejamento, postagens e relatórios mensais.", "price": "A partir de R$ 490", "icon": "megaphone"}, {"name": "Tráfego pago", "description": "Campanhas no Google e Meta com acompanhamento semanal.", "price": "A partir de R$ 600", "icon": "megaphone"}, {"name": "Criação de sites", "description": "Sites rápidos e otimizados para buscadores.", "price": "A partir de R$ 900", "icon": "sparkles"}, {"name": "Identidade visual", "description": "Logotipo, paleta de cores e manual da marca.", "price": "A partir de R$ 450", "icon": "palette"}]}, {"title": "Automação com IA", "items": [{"name": "Chatbot para WhatsApp", "description": "Atendimento automático 24h com inteligência artificial.", "price": "A partir de R$ 900", "icon": "sparkles"}, {"name": "Automação de processos", "description": "Integrações e rotinas automáticas para sua empresa.", "price": "A partir de R$ 700", "icon": "sparkles"}, {"name": "Consultoria em IA", "description": "Diagnóstico e plano de uso de IA no seu negócio.", "price": "A partir de R$ 250/h", "icon": "lightbulb"}]}, {"title": "Engenharia e Reformas", "items": [{"name": "Design de Interiores", "description": "Ambientes funcionais e autorais, pensados para o seu estilo.", "price": "A partir de R$ 350", "icon": "palette"}, {"name": "Projeto de reforma", "description": "Planejamento e acompanhamento da sua obra.", "price": "A partir de R$ 1.200", "icon": "house"}, {"name": "Laudo técnico", "description": "Vistorias e laudos assinados por engenheiro.", "price": "A partir de R$ 600", "icon": "badge-check"}, {"name": "Pintura residencial", "description": "Pintura interna e externa com acabamento profissional.", "price": "A partir de R$ 500", "icon": "house"}]}, {"title": "Gastronomia e Eventos", "items": [{"name": "Buffet para eventos", "description": "Cardápios completos para festas e confraternizações.", "price": "A partir de R$ 45 por pessoa", "icon": "calendar-check"}, {"name": "Chef em domicílio", "description": "Jantares e experiências gastronômicas na sua casa.", "price": "A partir de R$ 400", "icon": "calendar-check"}, {"name": "Bolos e doces", "description": "Encomendas personalizadas para qualquer ocasião.", "price": "A partir de R$ 120", "icon": "calendar-check"}]}, {"title": "Fotografia e Conteúdo", "items": [{"name": "Fotografia", "description": "Ensaios e eventos registrados com olhar profissional.", "price": "A partir de R$ 390", "icon": "camera"}, {"name": "Vídeo para redes sociais", "description": "Roteiro, gravação e edição de vídeos curtos.", "price": "A partir de R$ 450", "icon": "play"}, {"name": "Fotografia de produtos", "description": "Fotos profissionais para loja virtual e catálogo.", "price": "A partir de R$ 300", "icon": "camera"}]}, {"title": "Saúde e Estética", "items": [{"name": "Fisioterapia domiciliar", "description": "Sessões em casa para mobilidade e recuperação.", "price": "A partir de R$ 130/h", "icon": "users"}, {"name": "Acompanhamento hospitalar", "description": "Apoio durante internações e consultas.", "price": "A partir de R$ 250/dia", "icon": "heart-handshake"}, {"name": "Personal trainer", "description": "Treinos personalizados em casa, ao ar livre ou online.", "price": "A partir de R$ 90/h", "icon": "dumbbell"}, {"name": "Limpeza de pele", "description": "Tratamento facial com profissional de estética.", "price": "A partir de R$ 150", "icon": "sparkles"}]}, {"title": "Educação e Cursos", "items": [{"name": "Aulas Particulares", "description": "Aprendizado personalizado no seu ritmo e objetivo.", "price": "A partir de R$ 80/h", "icon": "graduation-cap"}, {"name": "Aulas de idiomas", "description": "Inglês, espanhol e outros idiomas no seu ritmo.", "price": "A partir de R$ 70/h", "icon": "graduation-cap"}, {"name": "Reforço escolar", "description": "Apoio em matemática, português e outras matérias.", "price": "A partir de R$ 60/h", "icon": "graduation-cap"}]}, {"title": "Transporte e Logística", "items": [{"name": "Fretes e mudanças", "description": "Transporte de móveis e cargas com segurança.", "price": "A partir de R$ 250", "icon": "briefcase-business"}, {"name": "Entregas rápidas", "description": "Motoboy e entregas no mesmo dia.", "price": "A partir de R$ 25", "icon": "arrow-right"}, {"name": "Motorista particular", "description": "Motorista para compromissos, viagens e eventos.", "price": "A partir de R$ 60/h", "icon": "users"}]}, {"title": "Outros Serviços", "items": [{"name": "Consultoria de Negócios", "description": "Estratégia prática para acelerar seus resultados.", "price": "A partir de R$ 480", "icon": "briefcase-business"}, {"name": "Assistente virtual", "description": "Organização de agenda, e-mails e tarefas do dia a dia.", "price": "A partir de R$ 45/h", "icon": "users"}, {"name": "Tradução de documentos", "description": "Traduções simples e juramentadas.", "price": "A partir de R$ 120", "icon": "badge-check"}]}];
  // Nomes antigos de categorias → categoria atual
  var ALIAS = {
    'terapia': 'Terapia e Bem-Estar', 'advoca': 'Advocacia e Jurídico', 'advogad': 'Advocacia e Jurídico',
    'contabil': 'Contabilidade e Finanças', 'seguro': 'Contabilidade e Finanças',
    'servicos domesticos': 'Serviços Domésticos', 'limpeza': 'Serviços Domésticos', 'cuidado de idosos': 'Saúde e Estética',
    'marido': 'Marido de Aluguel', 'reparos': 'Marido de Aluguel', 'casa e reparos': 'Marido de Aluguel',
    'marketing': 'Marketing e Vendas', 'design': 'Marketing e Vendas', 'automacao': 'Automação com IA', 'tecnologia': 'Automação com IA',
    'engenharia': 'Engenharia e Reformas', 'reformas': 'Engenharia e Reformas', 'gastronomia': 'Gastronomia e Eventos',
    'fotografia': 'Fotografia e Conteúdo', 'saude': 'Saúde e Estética', 'educacao': 'Educação e Cursos',
    'transporte': 'Transporte e Logística', 'outros': 'Outros Serviços'
  };

  // Limites por arquivo (o navegador guarda no máximo ~5 MB no total)
  var LIMITS = { image: 6 * 1024 * 1024, video: 3 * 1024 * 1024, pdf: 2 * 1024 * 1024 };

  function norm(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  // Catálogo editável (categorias de serviço e gêneros de livros) — configurado no Painel ADM
  var CATALOGO = null;
  function catTxt(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }
  function catalogo() {
    var o = CATALOGO;
    if (!o && !API.on) { try { o = JSON.parse(localStorage.getItem('omega_catalogo') || 'null'); } catch (e) { o = null; } }
    o = o || {};
    return {
      servicos: Array.isArray(o.servicos) && o.servicos.length ? o.servicos : SERVICOS_PADRAO,
      generos: Array.isArray(o.generos) && o.generos.length ? o.generos : GENEROS
    };
  }
  function listaCategorias() { return catalogo().servicos.map(function (c) { return c.title; }); }
  function salvarCatalogo(obj) {
    var lim = obj ? {
      servicos: (obj.servicos || []).map(function (c) { return { title: catTxt(c.title, 120), items: (c.items || []).map(function (s) {
        return { name: catTxt(s.name, 160), description: catTxt(s.description, 400), price: catTxt(s.price, 80), icon: catTxt(s.icon, 40) || 'briefcase' }; }).filter(function (s) { return s.name; }) }; }).filter(function (c) { return c.title; }),
      generos: (obj.generos || []).map(function (g) { return { key: catTxt(g.key, 60), label: catTxt(g.label, 120) }; }).filter(function (g) { return g.key && g.label; })
    } : null;
    if (API.on && CTX === 'admin') call('PUT', '/api/admin/config/catalogo', { dados: lim }, adminKey());
    else { try { if (lim) localStorage.setItem('omega_catalogo', JSON.stringify(lim)); else localStorage.removeItem('omega_catalogo'); } catch (e) {} }
    CATALOGO = lim; return lim;
  }
  function categoria(nome) {
    var k = norm(nome), CATS = listaCategorias();
    if (!k) return null;
    for (var i = 0; i < CATS.length; i++) if (norm(CATS[i]) === k) return CATS[i];
    for (var a in ALIAS) if (k.indexOf(a) === 0) return ALIAS[a];
    for (var j = 0; j < CATS.length; j++) if (norm(CATS[j]).indexOf(k) === 0) return CATS[j];
    return null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Hash simples (demonstração). Em produção a senha deve ser verificada no servidor.
  function hashPwd(s) {
    var h = 0, i, chr; s = String(s || '');
    for (i = 0; i < s.length; i++) { chr = s.charCodeAt(i); h = ((h << 5) - h) + chr; h |= 0; }
    return 'h' + Math.abs(h).toString(36) + '_' + s.length;
  }

  // ---------- Banco central (API do Worker) ----------
  var CTX = (function () {
    var p = (location.pathname || '').toLowerCase();
    if (/admin/.test(p)) return 'admin';
    if (/painel/.test(p)) return 'painel';
    if (/cadastro/.test(p)) return 'cadastro';
    return 'publico';
  })();
  var API = { on: false, ctx: CTX, erro: null };
  var OCULTOS = null;   // exemplos ocultos vindos do servidor
  var MEM = [];          // contas vindas do servidor
  var MEMK = {};         // listas vindas do servidor (pedidos, cartas, banners)
  var SNAP = {};         // última versão gravada de cada item (para enviar só o que mudou)
  var ADMIN_KEY_SS = 'omega_admin_key';
  var KEYS = {
    admin: ['omega_pedidos', 'omega_cartas_autores', 'omega_banners_servicos', 'omega_banners_livros'],
    painel: ['omega_cartas_autores'],
    publico: ['omega_banners_servicos', 'omega_banners_livros'],
    cadastro: []
  }[CTX];

  function xhr(method, path, body, auth) {
    var x = new XMLHttpRequest();
    try {
      x.open(method, path, false);
      x.setRequestHeader('Content-Type', 'application/json');
      if (auth) x.setRequestHeader('Authorization', 'Bearer ' + auth);
      x.send(body == null ? null : JSON.stringify(body));
    } catch (e) { return { status: 0, data: null }; }
    var d = null; try { d = JSON.parse(x.responseText); } catch (e) {}
    return { status: x.status, data: d };
  }
  function call(method, path, body, auth) {
    var r = xhr(method, path, body, auth);
    if (r.status >= 200 && r.status < 300) return r.data || {};
    var e = new Error((r.data && r.data.erro) || (r.status ? 'Não foi possível salvar no servidor (erro ' + r.status + ').' : 'Sem conexão com o servidor. Verifique a internet e tente de novo.'));
    e.status = r.status; throw e;
  }
  function sess() { try { return JSON.parse(sessionStorage.getItem(SESSION) || 'null'); } catch (e) { return null; } }
  function adminKey() { try { return sessionStorage.getItem(ADMIN_KEY_SS) || ''; } catch (e) { return ''; } }
  function snapList(nome, list) { var m = {}; (list || []).forEach(function (x) { if (x && x.id) m[x.id] = JSON.stringify(x); }); SNAP[nome] = m; }
  function setMemK(key, list) { MEMK[key] = list || []; snapList(key, MEMK[key]); }
  // Troca o conteúdo de um objeto pelo que o servidor devolveu (mantém a mesma referência na página)
  function substituir(alvo, novo) {
    if (!novo || alvo === novo) return alvo;
    Object.keys(alvo).forEach(function (k) { delete alvo[k]; });
    Object.keys(novo).forEach(function (k) { alvo[k] = novo[k]; });
    return alvo;
  }
  function iniciar() {
    if (!/^https?:$/.test(location.protocol)) return;
    var r;
    if (CTX === 'publico') {
      r = xhr('GET', '/api/publico');
      if (r.status !== 200 || !r.data) return;
      API.on = true; MEM = r.data.contas || []; OCULTOS = r.data.ocultos || []; CATALOGO = r.data.catalogo || null;
      var b = r.data.banners || {};
      setMemK('omega_banners_servicos', b.servicos); setMemK('omega_banners_livros', b.livros);
      window.OMEGA_BANNERS_SRV = { servicos: b.servicos || [], livros: b.livros || [] };
      return;
    }
    r = xhr('GET', '/api/estado');
    if (r.status !== 200 || !r.data || !r.data.db) return;
    API.on = true;
    if (CTX === 'painel') {
      var s = sess();
      if (s && s.token) {
        r = xhr('GET', '/api/me', null, s.token);
        if (r.status === 200 && r.data) { MEM = [r.data.conta]; snapList('contas', MEM); setMemK('omega_cartas_autores', r.data.cartas); }
        else { try { sessionStorage.removeItem(SESSION); } catch (e) {} }
      }
    } else if (CTX === 'admin') {
      if (!r.data.admin) { API.erro = 'Defina o segredo ADMIN_KEY no Worker (Cloudflare > Workers > prestadores > Settings > Variables and Secrets) para usar o Painel ADM.'; return; }
      for (var t = 0; t < 3; t++) {
        var k = adminKey() || (window.prompt(t ? 'Chave incorreta. Digite a chave do administrador:' : 'Digite a chave do administrador (ADMIN_KEY):') || '').trim();
        if (!k) break;
        r = xhr('GET', '/api/admin/tudo', null, k);
        if (r.status === 200 && r.data) {
          try { sessionStorage.setItem(ADMIN_KEY_SS, k); } catch (e) {}
          MEM = r.data.contas || []; snapList('contas', MEM); OCULTOS = r.data.ocultos || []; CATALOGO = r.data.catalogo || null;
          setMemK('omega_pedidos', r.data.pedidos); setMemK('omega_cartas_autores', r.data.cartas);
          setMemK('omega_banners_servicos', (r.data.banners || {}).servicos); setMemK('omega_banners_livros', (r.data.banners || {}).livros);
          return;
        }
        try { sessionStorage.removeItem(ADMIN_KEY_SS); } catch (e) {}
        if (r.status !== 401) { API.erro = (r.data && r.data.erro) || 'Não foi possível carregar os dados do servidor.'; return; }
      }
      API.erro = 'Chave do administrador não informada ou incorreta. Recarregue a página para tentar de novo.';
    }
  }
  // Envia ao servidor as mudanças de uma lista (pedidos, cartas, banners). Devolve a versão gravada.
  function syncKey(key, value) {
    if (CTX === 'admin' && /^omega_banners_/.test(key)) {
      var r = call('PUT', '/api/admin/config/' + key.replace('omega_', ''), { dados: value || [] }, adminKey());
      return r.dados || [];
    }
    var antes = SNAP[key] || {}, vistos = {}, tipo = key === 'omega_pedidos' ? 'pedidos' : 'cartas';
    (value || []).forEach(function (x) {
      if (!x || !x.id) return; vistos[x.id] = 1;
      var j = JSON.stringify(x); if (antes[x.id] === j) return;
      if (CTX === 'admin') call('PUT', '/api/admin/' + tipo + '/' + encodeURIComponent(x.id), { item: x }, adminKey());
      else if (CTX === 'painel' && tipo === 'cartas') call('PUT', '/api/me/cartas/' + encodeURIComponent(x.id), { item: x }, (sess() || {}).token);
      antes[x.id] = j;
    });
    if (CTX === 'admin') Object.keys(antes).forEach(function (id) {
      if (vistos[id]) return; call('DELETE', '/api/admin/' + tipo + '/' + encodeURIComponent(id), null, adminKey()); delete antes[id];
    });
    SNAP[key] = antes; return value;
  }

  function read(key, fallback) {
    if (API.on && KEYS.indexOf(key) >= 0) return MEMK[key] || fallback;
    try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
  }
  // Retorna true/false. Em caso de falta de espaço, lança erro com mensagem amigável.
  function write(key, value) {
    if (API.on && KEYS.indexOf(key) >= 0) {
      if (CTX === 'publico') { MEMK[key] = value; return true; }
      MEMK[key] = syncKey(key, value); return true;
    }
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) {
      var full = e && (e.name === 'QuotaExceededError' || /quota|exceeded/i.test(String(e)));
      var err = new Error(full
        ? 'Espaço de armazenamento cheio. Remova arquivos grandes (vídeos e PDFs) ou use links do YouTube/Google Drive.'
        : 'Não foi possível salvar: ' + (e && e.message));
      err.quota = full; throw err;
    }
  }

  // ---------- Contas ----------
  function accounts() { return API.on ? MEM : read(ACCOUNTS, []); }
  function saveAccounts(list) {
    if (!API.on) return write(ACCOUNTS, list);
    if (CTX === 'admin' || CTX === 'painel') {
      var antes = SNAP.contas || {}, vistos = {};
      list.forEach(function (u) {
        vistos[u.id] = 1; if (antes[u.id] === JSON.stringify(u)) return;
        var r = CTX === 'admin'
          ? call('PUT', '/api/admin/contas/' + encodeURIComponent(u.id), { conta: u }, adminKey())
          : call('PUT', '/api/me', { conta: u }, (sess() || {}).token);
        substituir(u, r.conta); antes[u.id] = JSON.stringify(u);
      });
      if (CTX === 'admin') Object.keys(antes).forEach(function (id) {
        if (vistos[id]) return; call('DELETE', '/api/admin/contas/' + encodeURIComponent(id), null, adminKey()); delete antes[id];
      });
      SNAP.contas = antes;
    }
    MEM = list; return true;
  }
  function account(id) { return accounts().find(function (u) { return u.id === id; }) || null; }
  function byEmail(email) { var e = norm(email); return accounts().find(function (u) { return norm(u.email) === e; }) || null; }
  function saveAccount(user) {
    var list = accounts(); var i = list.findIndex(function (u) { return u.id === user.id; });
    if (i >= 0) list[i] = user; else list.push(user);
    saveAccounts(list); return user;
  }
  function updateAccount(id, fn) {
    var list = accounts(); var u = list.find(function (x) { return x.id === id; });
    if (!u) return null; fn(u); saveAccounts(list); return u;
  }
  function createAccount(data) {
    if (!data.email || !data.senha) throw new Error('E-mail e senha são obrigatórios.');
    if (API.on) {
      return call('POST', '/api/cadastro', { senha: data.senha, conta: {
        nome: data.nome, email: data.email, whats: data.whats || '', tipo: data.tipo || 'prestador', desc: data.desc || '',
        cadastro: data.cadastro || {}, perfil: data.perfil || {} } }).conta;
    }
    if (byEmail(data.email)) throw new Error('Este e-mail já tem cadastro. Faça login no Painel do Prestador.');
    var u = {
      id: 'p_' + Date.now() + Math.random().toString(36).slice(2, 6),
      nome: data.nome, email: String(data.email).trim().toLowerCase(), whats: data.whats || '',
      tipo: data.tipo || 'prestador', pwdHash: hashPwd(data.senha), desc: data.desc || '',
      status: 'pendente', autorAprovado: false, createdAt: new Date().toISOString(),
      cadastro: data.cadastro || {},
      servicos: [], livros: [], pedidos: [], perfil: data.perfil || {}, pagamento: {}, entrega: {}
    };
    var list = accounts(); list.push(u); saveAccounts(list); return u;
  }
  function login(email, senha) {
    if (API.on) {
      var r = xhr('POST', '/api/login', { email: email, senha: senha });
      if (r.status !== 200 || !r.data) return { ok: false, msg: (r.data && r.data.erro) || 'Não foi possível entrar agora. Verifique a internet e tente de novo.' };
      MEM = [r.data.conta]; snapList('contas', MEM); setMemK('omega_cartas_autores', r.data.cartas);
      try { sessionStorage.setItem(SESSION, JSON.stringify({ id: r.data.conta.id, token: r.data.token })); } catch (e) {}
      return { ok: true, user: MEM[0] };
    }
    var u = byEmail(email);
    if (!u || u.pwdHash !== hashPwd(senha)) return { ok: false, msg: 'E-mail ou senha incorretos.' };
    if (u.status === 'pendente') return { ok: false, msg: 'Seu cadastro ainda está em análise pela equipe. Tente entrar novamente depois da aprovação.' };
    if (u.status === 'recusado') return { ok: false, msg: 'Seu cadastro não foi aprovado. Fale com o suporte.' };
    if (u.status === 'bloqueado') return { ok: false, msg: 'Seu acesso está bloqueado. Fale com o suporte.' };
    try { sessionStorage.setItem(SESSION, JSON.stringify({ id: u.id })); } catch (e) {}
    return { ok: true, user: u };
  }
  function session() {
    try { var s = JSON.parse(sessionStorage.getItem(SESSION) || 'null'); return s ? account(s.id) : null; } catch (e) { return null; }
  }
  function logout() {
    var s = sess(); if (API.on && s && s.token) xhr('POST', '/api/logout', null, s.token);
    try { sessionStorage.removeItem(SESSION); } catch (e) {}
  }
  // Troca de senha (no servidor, a senha atual é conferida lá)
  function trocarSenha(atual, nova) {
    if (API.on) { call('POST', '/api/me/senha', { atual: atual, nova: nova }, (sess() || {}).token); return true; }
    var u = session(); if (!u || u.pwdHash !== hashPwd(atual)) throw new Error('Senha atual incorreta.');
    updateAccount(u.id, function (x) { x.pwdHash = hashPwd(nova); }); return true;
  }
  // Pedido de livro feito pelo leitor (no servidor, avisa os autores e baixa o estoque)
  function enviarPedido(p) { return API.on ? call('POST', '/api/pedidos', { pedido: p }).pedido : p; }
  function enviarCarta(c) { return API.on ? call('POST', '/api/cartas', { carta: c }).carta : c; }
  // Copia para o banco central o que está guardado neste navegador (Painel ADM)
  function importarNavegador() {
    function raw(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
    return call('POST', '/api/admin/importar', {
      contas: raw(ACCOUNTS) || [], pedidos: raw('omega_pedidos') || [], cartas: raw('omega_cartas_autores') || [],
      banners: { servicos: raw('omega_banners_servicos') || [], livros: raw('omega_banners_livros') || [] }
    }, adminKey());
  }
  function sairAdmin() { try { sessionStorage.removeItem(ADMIN_KEY_SS); } catch (e) {} }
  // Exemplos do site (livros e serviços fictícios) que o administrador pode ocultar
  var EXEMPLOS = [{"chave": "servico:Psicoterapia individual", "tipo": "Serviço", "titulo": "Psicoterapia individual", "grupo": "Terapia e Bem-Estar"},
    {"chave": "servico:Terapia de casal", "tipo": "Serviço", "titulo": "Terapia de casal", "grupo": "Terapia e Bem-Estar"},
    {"chave": "servico:Terapia online", "tipo": "Serviço", "titulo": "Terapia online", "grupo": "Terapia e Bem-Estar"},
    {"chave": "servico:Massoterapia", "tipo": "Serviço", "titulo": "Massoterapia", "grupo": "Terapia e Bem-Estar"},
    {"chave": "servico:Direito trabalhista", "tipo": "Serviço", "titulo": "Direito trabalhista", "grupo": "Advocacia e Jurídico"},
    {"chave": "servico:Direito de família", "tipo": "Serviço", "titulo": "Direito de família", "grupo": "Advocacia e Jurídico"},
    {"chave": "servico:Direito do consumidor", "tipo": "Serviço", "titulo": "Direito do consumidor", "grupo": "Advocacia e Jurídico"},
    {"chave": "servico:Contabilidade para MEI", "tipo": "Serviço", "titulo": "Contabilidade para MEI", "grupo": "Contabilidade e Finanças"},
    {"chave": "servico:Imposto de renda", "tipo": "Serviço", "titulo": "Imposto de renda", "grupo": "Contabilidade e Finanças"},
    {"chave": "servico:Abertura de empresa", "tipo": "Serviço", "titulo": "Abertura de empresa", "grupo": "Contabilidade e Finanças"},
    {"chave": "servico:Seguro auto", "tipo": "Serviço", "titulo": "Seguro auto", "grupo": "Contabilidade e Finanças"},
    {"chave": "servico:Seguro residencial", "tipo": "Serviço", "titulo": "Seguro residencial", "grupo": "Contabilidade e Finanças"},
    {"chave": "servico:Seguro de vida", "tipo": "Serviço", "titulo": "Seguro de vida", "grupo": "Contabilidade e Finanças"},
    {"chave": "servico:Limpeza Residencial", "tipo": "Serviço", "titulo": "Limpeza Residencial", "grupo": "Serviços Domésticos"},
    {"chave": "servico:Faxina pós-obra", "tipo": "Serviço", "titulo": "Faxina pós-obra", "grupo": "Serviços Domésticos"},
    {"chave": "servico:Passadoria", "tipo": "Serviço", "titulo": "Passadoria", "grupo": "Serviços Domésticos"},
    {"chave": "servico:Cuidador de idosos", "tipo": "Serviço", "titulo": "Cuidador de idosos", "grupo": "Serviços Domésticos"},
    {"chave": "servico:Manutenção Elétrica", "tipo": "Serviço", "titulo": "Manutenção Elétrica", "grupo": "Marido de Aluguel"},
    {"chave": "servico:Reparos hidráulicos", "tipo": "Serviço", "titulo": "Reparos hidráulicos", "grupo": "Marido de Aluguel"},
    {"chave": "servico:Montagem de móveis", "tipo": "Serviço", "titulo": "Montagem de móveis", "grupo": "Marido de Aluguel"},
    {"chave": "servico:Pequenos reparos", "tipo": "Serviço", "titulo": "Pequenos reparos", "grupo": "Marido de Aluguel"},
    {"chave": "servico:Gestão de redes sociais", "tipo": "Serviço", "titulo": "Gestão de redes sociais", "grupo": "Marketing e Vendas"},
    {"chave": "servico:Tráfego pago", "tipo": "Serviço", "titulo": "Tráfego pago", "grupo": "Marketing e Vendas"},
    {"chave": "servico:Criação de sites", "tipo": "Serviço", "titulo": "Criação de sites", "grupo": "Marketing e Vendas"},
    {"chave": "servico:Identidade visual", "tipo": "Serviço", "titulo": "Identidade visual", "grupo": "Marketing e Vendas"},
    {"chave": "servico:Chatbot para WhatsApp", "tipo": "Serviço", "titulo": "Chatbot para WhatsApp", "grupo": "Automação com IA"},
    {"chave": "servico:Automação de processos", "tipo": "Serviço", "titulo": "Automação de processos", "grupo": "Automação com IA"},
    {"chave": "servico:Consultoria em IA", "tipo": "Serviço", "titulo": "Consultoria em IA", "grupo": "Automação com IA"},
    {"chave": "servico:Design de Interiores", "tipo": "Serviço", "titulo": "Design de Interiores", "grupo": "Engenharia e Reformas"},
    {"chave": "servico:Projeto de reforma", "tipo": "Serviço", "titulo": "Projeto de reforma", "grupo": "Engenharia e Reformas"},
    {"chave": "servico:Laudo técnico", "tipo": "Serviço", "titulo": "Laudo técnico", "grupo": "Engenharia e Reformas"},
    {"chave": "servico:Pintura residencial", "tipo": "Serviço", "titulo": "Pintura residencial", "grupo": "Engenharia e Reformas"},
    {"chave": "servico:Buffet para eventos", "tipo": "Serviço", "titulo": "Buffet para eventos", "grupo": "Gastronomia e Eventos"},
    {"chave": "servico:Chef em domicílio", "tipo": "Serviço", "titulo": "Chef em domicílio", "grupo": "Gastronomia e Eventos"},
    {"chave": "servico:Bolos e doces", "tipo": "Serviço", "titulo": "Bolos e doces", "grupo": "Gastronomia e Eventos"},
    {"chave": "servico:Fotografia", "tipo": "Serviço", "titulo": "Fotografia", "grupo": "Fotografia e Conteúdo"},
    {"chave": "servico:Vídeo para redes sociais", "tipo": "Serviço", "titulo": "Vídeo para redes sociais", "grupo": "Fotografia e Conteúdo"},
    {"chave": "servico:Fotografia de produtos", "tipo": "Serviço", "titulo": "Fotografia de produtos", "grupo": "Fotografia e Conteúdo"},
    {"chave": "servico:Fisioterapia domiciliar", "tipo": "Serviço", "titulo": "Fisioterapia domiciliar", "grupo": "Saúde e Estética"},
    {"chave": "servico:Acompanhamento hospitalar", "tipo": "Serviço", "titulo": "Acompanhamento hospitalar", "grupo": "Saúde e Estética"},
    {"chave": "servico:Personal trainer", "tipo": "Serviço", "titulo": "Personal trainer", "grupo": "Saúde e Estética"},
    {"chave": "servico:Limpeza de pele", "tipo": "Serviço", "titulo": "Limpeza de pele", "grupo": "Saúde e Estética"},
    {"chave": "servico:Aulas Particulares", "tipo": "Serviço", "titulo": "Aulas Particulares", "grupo": "Educação e Cursos"},
    {"chave": "servico:Aulas de idiomas", "tipo": "Serviço", "titulo": "Aulas de idiomas", "grupo": "Educação e Cursos"},
    {"chave": "servico:Reforço escolar", "tipo": "Serviço", "titulo": "Reforço escolar", "grupo": "Educação e Cursos"},
    {"chave": "servico:Fretes e mudanças", "tipo": "Serviço", "titulo": "Fretes e mudanças", "grupo": "Transporte e Logística"},
    {"chave": "servico:Entregas rápidas", "tipo": "Serviço", "titulo": "Entregas rápidas", "grupo": "Transporte e Logística"},
    {"chave": "servico:Motorista particular", "tipo": "Serviço", "titulo": "Motorista particular", "grupo": "Transporte e Logística"},
    {"chave": "servico:Consultoria de Negócios", "tipo": "Serviço", "titulo": "Consultoria de Negócios", "grupo": "Outros Serviços"},
    {"chave": "servico:Assistente virtual", "tipo": "Serviço", "titulo": "Assistente virtual", "grupo": "Outros Serviços"},
    {"chave": "servico:Tradução de documentos", "tipo": "Serviço", "titulo": "Tradução de documentos", "grupo": "Outros Serviços"},
    {"chave": "livro-demo:1", "tipo": "Livro", "titulo": "A Mente que Vence", "grupo": "Livros de exemplo"},
    {"chave": "livro-demo:2", "tipo": "Livro", "titulo": "Escale seu Negócio", "grupo": "Livros de exemplo"},
    {"chave": "livro-demo:3", "tipo": "Livro", "titulo": "O Propósito da Alma", "grupo": "Livros de exemplo"},
    {"chave": "livro-demo:4", "tipo": "Livro", "titulo": "Quando o Amor Chega", "grupo": "Livros de exemplo"},
    {"chave": "livro-demo:5", "tipo": "Livro", "titulo": "Universo Paralelo", "grupo": "Livros de exemplo"},
    {"chave": "livro-demo:6", "tipo": "Livro", "titulo": "Viva com Leveza", "grupo": "Livros de exemplo"},
    {"chave": "livro-demo:7", "tipo": "Livro", "titulo": "O Último Testemunho", "grupo": "Livros de exemplo"},
    {"chave": "livro-demo:9", "tipo": "Livro", "titulo": "O Mundo de Zozo", "grupo": "Livros de exemplo"},
    {"chave": "livro-demo:10", "tipo": "Livro", "titulo": "Educação Financeira na Prática", "grupo": "Livros de exemplo"},
    {"chave": "livro-demo:11", "tipo": "Livro", "titulo": "Recomece Hoje", "grupo": "Livros de exemplo"}];
  function ocultos() {
    if (API.on && OCULTOS) return OCULTOS;
    try { var v = JSON.parse(localStorage.getItem('omega_ocultos') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function oculto(chave) { return ocultos().indexOf(chave) >= 0; }
  function salvarOcultos(lista) {
    lista = (lista || []).filter(function (x) { return typeof x === 'string' && x.length < 200; });
    if (API.on && CTX === 'admin') call('PUT', '/api/admin/config/ocultos', { dados: lista }, adminKey());
    else { try { localStorage.setItem('omega_ocultos', JSON.stringify(lista)); } catch (e) {} }
    OCULTOS = lista; return lista;
  }
  function isAutor(u) { return !!u && (u.tipo === 'autor' || u.tipo === 'ambos'); }
  function isPrestador(u) { return !!u && (u.tipo === 'prestador' || u.tipo === 'ambos'); }

  // ---------- Consultas públicas (usadas pelo site) ----------
  function publicName(u) { return (u.perfil && u.perfil.nome) || (u.cadastro && (u.cadastro.businessName || u.cadastro.authorName)) || u.nome; }
  function activeProviders() { return accounts().filter(function (u) { return u.status === 'ativo' && isPrestador(u); }); }
  // Lista de cartões por categoria: serviços publicados + prestadores sem serviço naquela categoria
  function providersByCategory() {
    var out = {};
    function push(cat, card) { if (!cat) return; (out[cat] = out[cat] || []).push(card); }
    activeProviders().forEach(function (u) {
      var cats = {};
      (u.servicos || []).forEach(function (s) {
        if (s.ativo === false || s.oculto) return;
        var cat = categoria(s.cat); if (!cat) return; cats[cat] = true;
        push(cat, {
          full_name: publicName(u), titulo: s.titulo, description: s.desc, city: s.cidade || (u.cadastro && u.cadastro.city) || '',
          uf: (u.cadastro && u.cadastro.uf) || '', phone: s.whats || u.whats, price_note: s.preco,
          foto: s.foto || (u.perfil && u.perfil.foto) || null, midias: s.midias || []
        });
      });
      ((u.cadastro && u.cadastro.categorias) || []).forEach(function (c) {
        var cat = categoria(c); if (!cat || cats[cat]) return; cats[cat] = true;
        push(cat, {
          full_name: publicName(u), description: (u.perfil && u.perfil.bio) || (u.cadastro && u.cadastro.bio) || u.desc,
          city: (u.cadastro && u.cadastro.city) || '', uf: (u.cadastro && u.cadastro.uf) || '', phone: (u.perfil && u.perfil.whats) || u.whats,
          price_note: 'A combinar', foto: (u.perfil && u.perfil.foto) || null, midias: (u.perfil && u.perfil.midias) || []
        });
      });
    });
    return out;
  }
  function publishedBooks() {
    var out = [];
    accounts().forEach(function (u) {
      if (u.status !== 'ativo' || !isAutor(u) || !u.autorAprovado) return;
      (u.livros || []).forEach(function (l) {
        if (l.ativo === false || l.oculto) return;
        out.push({ livro: l, autor: publicName(u), whats: (u.perfil && u.perfil.whats) || u.whats, autorId: u.id });
      });
    });
    return out;
  }
  function legacyQueue() { return read(LEGACY_QUEUE, []); }
  function saveLegacyQueue(list) { return write(LEGACY_QUEUE, list); }

  // ---------- Arquivos ----------
  function kindOf(file) {
    if (!file) return null;
    if (/^image\//.test(file.type)) return 'image';
    if (/^video\//.test(file.type)) return 'video';
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
    return null;
  }
  function mb(n) { return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB'; }
  // Lê um arquivo e devolve {type, src, name}. Imagens são reduzidas e comprimidas.
  function readMedia(file, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var kind = kindOf(file);
      if (!kind) return reject(new Error('Formato não aceito. Use imagem (JPG/PNG), vídeo (MP4) ou PDF.'));
      if (opts.only && opts.only.indexOf(kind) < 0) return reject(new Error('Este campo aceita apenas: ' + opts.only.join(', ') + '.'));
      if (file.size > LIMITS[kind]) {
        return reject(new Error(kind === 'video'
          ? 'Vídeo muito grande (' + mb(file.size) + '). O limite aqui é ' + mb(LIMITS.video) + '. Para vídeos maiores, cole o link do YouTube ou Google Drive.'
          : 'Arquivo muito grande (' + mb(file.size) + '). O limite é ' + mb(LIMITS[kind]) + '.'));
      }
      if (kind === 'image') {
        var max = opts.max || 1000, img = new Image(), url = URL.createObjectURL(file);
        img.onload = function () {
          var r = Math.min(max / img.width, max / img.height, 1), c = document.createElement('canvas');
          c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
          resolve({ type: 'image', src: c.toDataURL('image/jpeg', opts.quality || 0.78), name: file.name });
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
        img.src = url; return;
      }
      var fr = new FileReader();
      fr.onload = function () { resolve({ type: kind, src: fr.result, name: file.name }); };
      fr.onerror = function () { reject(new Error('Não foi possível ler o arquivo.')); };
      fr.readAsDataURL(file);
    });
  }
  // Converte links de YouTube/Vimeo em endereço de incorporação
  function videoEmbed(url) {
    url = String(url || '').trim(); var m;
    if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/))) return 'https://www.youtube.com/embed/' + m[1];
    if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return 'https://player.vimeo.com/video/' + m[1];
    return null;
  }
  function storageUsage() {
    var total = 0;
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); total += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) {}
    return { bytes: total, limit: 5 * 1024 * 1024, label: mb(total) };
  }

  iniciar();
  if (API.on) { LIMITS.image = 8 * 1024 * 1024; LIMITS.video = 15 * 1024 * 1024; LIMITS.pdf = 10 * 1024 * 1024; }
  try { document.dispatchEvent(new CustomEvent('omega:dados', { detail: { api: API.on } })); } catch (e) {}

  return {
    api: API, trocarSenha: trocarSenha, enviarPedido: enviarPedido, enviarCarta: enviarCarta,
    ocultos: ocultos, oculto: oculto, salvarOcultos: salvarOcultos, EXEMPLOS: EXEMPLOS,
    importarNavegador: importarNavegador, sairAdmin: sairAdmin,
    get CATEGORIAS() { return listaCategorias(); }, get GENEROS() { return catalogo().generos; }, catalogo: catalogo, salvarCatalogo: salvarCatalogo, SERVICOS_PADRAO: SERVICOS_PADRAO, LIMITS: LIMITS,
    norm: norm, categoria: categoria, esc: esc, hashPwd: hashPwd, mb: mb,
    accounts: accounts, saveAccounts: saveAccounts, account: account, byEmail: byEmail,
    saveAccount: saveAccount, updateAccount: updateAccount, createAccount: createAccount,
    login: login, session: session, logout: logout, isAutor: isAutor, isPrestador: isPrestador,
    publicName: publicName, providersByCategory: providersByCategory, publishedBooks: publishedBooks,
    legacyQueue: legacyQueue, saveLegacyQueue: saveLegacyQueue,
    readMedia: readMedia, kindOf: kindOf, videoEmbed: videoEmbed, storageUsage: storageUsage,
    read: read, write: write
  };
})();
