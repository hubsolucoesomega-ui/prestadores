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
  function categoria(nome) {
    var k = norm(nome);
    if (!k) return null;
    for (var i = 0; i < CATEGORIAS.length; i++) if (norm(CATEGORIAS[i]) === k) return CATEGORIAS[i];
    for (var a in ALIAS) if (k.indexOf(a) === 0) return ALIAS[a];
    for (var j = 0; j < CATEGORIAS.length; j++) if (norm(CATEGORIAS[j]).indexOf(k) === 0) return CATEGORIAS[j];
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
      API.on = true; MEM = r.data.contas || [];
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
          MEM = r.data.contas || []; snapList('contas', MEM);
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
    importarNavegador: importarNavegador, sairAdmin: sairAdmin,
    CATEGORIAS: CATEGORIAS, GENEROS: GENEROS, LIMITS: LIMITS,
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
