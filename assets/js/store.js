// OmegaStore — camada única de dados do site (contas, serviços, livros, mídias).
// Hoje grava no localStorage do navegador (modo demonstração).
// Para produção, troque as funções read/write por chamadas a uma API (Cloudflare D1/KV ou Supabase):
// o resto do site só conversa com este módulo.
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

  function read(key, fallback) {
    try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
  }
  // Retorna true/false. Em caso de falta de espaço, lança erro com mensagem amigável.
  function write(key, value) {
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
  function accounts() { return read(ACCOUNTS, []); }
  function saveAccounts(list) { return write(ACCOUNTS, list); }
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
  function logout() { try { sessionStorage.removeItem(SESSION); } catch (e) {} }
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

  return {
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
