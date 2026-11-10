// Soluções Omega — Worker "prestadores"
// Serve o site (arquivos estáticos) e a API /api/* com banco central Cloudflare D1.
// Sem o banco ligado (binding DB), a API responde 503 e o site continua no modo navegador.
//
// Variáveis no Cloudflare (Worker > Settings > Variables and Secrets):
//   ADMIN_KEY  (Secret) — chave do Painel ADM. Nunca coloque no código nem no site.

const MAX_BODY = 45 * 1024 * 1024;   // tamanho máximo de uma requisição
const MAX_MIDIA = 15 * 1024 * 1024;  // tamanho máximo de um arquivo (imagem, vídeo ou PDF)
const PARTE = 1800 * 1024;           // D1 aceita até 2 MB por valor; arquivos maiores são divididos
const SESSAO_DIAS = 30;
const CONFIG_OK = ['banners_servicos', 'banners_livros', 'ocultos', 'catalogo'];

let schemaPronto = false;
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS contas (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, pwd TEXT, status TEXT, dados TEXT NOT NULL, criado TEXT, atualizado TEXT)',
  'CREATE TABLE IF NOT EXISTS sessoes (token TEXT PRIMARY KEY, conta_id TEXT NOT NULL, expira INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS midias (id TEXT PRIMARY KEY, dono TEXT NOT NULL, mime TEXT, tamanho INTEGER, partes INTEGER, criado TEXT)',
  'CREATE TABLE IF NOT EXISTS midia_partes (midia_id TEXT NOT NULL, n INTEGER NOT NULL, dados BLOB, PRIMARY KEY (midia_id, n))',
  'CREATE TABLE IF NOT EXISTS pedidos (id TEXT PRIMARY KEY, dados TEXT NOT NULL, criado TEXT)',
  'CREATE TABLE IF NOT EXISTS cartas (id TEXT PRIMARY KEY, dados TEXT NOT NULL, criado TEXT)',
  'CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, dados TEXT NOT NULL, atualizado TEXT)',
  'CREATE TABLE IF NOT EXISTS tentativas (chave TEXT PRIMARY KEY, n INTEGER NOT NULL, ate INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS midias_dono ON midias(dono)',
  'CREATE INDEX IF NOT EXISTS contas_status ON contas(status)'
];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (!env.DB) return json({ erro: 'Banco de dados ainda não ligado.', db: false }, 503);
      if (!schemaPronto) { await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))); schemaPronto = true; }
      return await rotear(req, env, url);
    } catch (e) {
      if (e instanceof Falha) return json({ erro: e.message }, e.status);
      console.error(e && e.stack || e);
      return json({ erro: 'Erro interno. Tente novamente.' }, 500);
    }
  }
};

class Falha extends Error { constructor(msg, status) { super(msg); this.status = status || 400; } }

// ---------------------------------------------------------------- rotas
async function rotear(req, env, url) {
  const m = req.method, p = url.pathname.replace(/\/+$/, '');
  let r;
  if (p === '/api/estado') return json({ ok: true, db: true, admin: !!env.ADMIN_KEY });
  if (p === '/api/publico' && m === 'GET') return publicoTudo(env);
  if ((r = p.match(/^\/api\/midia\/([a-f0-9]{16,64})$/)) && m === 'GET') return servirMidia(env, r[1], req);
  if (p === '/api/cadastro' && m === 'POST') return cadastro(req, env);
  if (p === '/api/login' && m === 'POST') return login(req, env);
  if (p === '/api/logout' && m === 'POST') { const t = bearer(req); if (t) await env.DB.prepare('DELETE FROM sessoes WHERE token = ?').bind(await sha(t)).run(); return json({ ok: true }); }
  if (p === '/api/pedidos' && m === 'POST') return novoPedido(req, env);
  if (p === '/api/cartas' && m === 'POST') return novaCarta(req, env);

  if (p.startsWith('/api/me')) {
    const conta = await contaDaSessao(req, env);
    if (p === '/api/me' && m === 'GET') return json({ conta: privado(conta), cartas: await cartasDoAutor(env, conta) });
    if (p === '/api/me' && m === 'PUT') return salvarMinhaConta(req, env, conta);
    if (p === '/api/me/senha' && m === 'POST') return trocarSenha(req, env, conta);
    if ((r = p.match(/^\/api\/me\/cartas\/([\w-]+)$/)) && m === 'PUT') return marcarCarta(req, env, conta, r[1]);
  }

  if (p.startsWith('/api/admin/')) {
    exigirAdmin(req, env);
    if (p === '/api/admin/tudo' && m === 'GET') return adminTudo(env);
    if (p === '/api/admin/importar' && m === 'POST') return importar(req, env);
    if ((r = p.match(/^\/api\/admin\/contas\/([\w-]+)$/))) {
      if (m === 'PUT') return adminSalvarConta(req, env, r[1]);
      if (m === 'DELETE') return adminExcluirConta(env, r[1]);
    }
    if ((r = p.match(/^\/api\/admin\/(pedidos|cartas)\/([\w-]+)$/))) {
      if (m === 'PUT') { const b = await corpo(req); const d = b.item || {}; d.id = r[2]; await env.DB.prepare(`INSERT INTO ${r[1]} (id, dados, criado) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET dados = excluded.dados`).bind(r[2], JSON.stringify(d), agora()).run(); return json({ item: d }); }
      if (m === 'DELETE') { await env.DB.prepare(`DELETE FROM ${r[1]} WHERE id = ?`).bind(r[2]).run(); return json({ ok: true }); }
    }
    if ((r = p.match(/^\/api\/admin\/config\/([\w-]+)$/)) && m === 'PUT') return salvarConfig(req, env, r[1]);
  }
  return json({ erro: 'Rota não encontrada.' }, 404);
}

// ---------------------------------------------------------------- público
async function publicoTudo(env) {
  const rs = await env.DB.prepare("SELECT dados FROM contas WHERE status = 'ativo'").all();
  const contas = rs.results.map((x) => vitrine(JSON.parse(x.dados)));
  return json({ contas, banners: await banners(env), ocultos: await ocultos(env), catalogo: await catalogoSalvo(env) }, 200, { 'Cache-Control': 'no-store' });
}
async function ocultos(env) {
  const r = await env.DB.prepare("SELECT dados FROM config WHERE chave = 'ocultos'").first();
  return r ? JSON.parse(r.dados) : [];
}
async function banners(env) {
  const rs = await env.DB.prepare("SELECT chave, dados FROM config WHERE chave IN ('banners_servicos','banners_livros')").all();
  const out = { servicos: [], livros: [] };
  rs.results.forEach((x) => { out[x.chave.replace('banners_', '')] = JSON.parse(x.dados); });
  return out;
}
// Só o que pode aparecer no site para qualquer visitante
function vitrine(u) {
  const c = u.cadastro || {}, perfil = Object.assign({}, u.perfil || {});
  ['cpf', 'cnpj', 'email', 'rg', 'endereco', 'documento', 'documentos'].forEach((k) => delete perfil[k]);
  const autorOk = (u.tipo === 'autor' || u.tipo === 'ambos') && u.autorAprovado;
  return {
    id: u.id, nome: u.nome, tipo: u.tipo, status: u.status, autorAprovado: !!u.autorAprovado,
    whats: u.whats || '', desc: u.desc || '', perfil,
    cadastro: { businessName: c.businessName, authorName: c.authorName, city: c.city, uf: c.uf, categorias: c.categorias || [], bio: c.bio, providerType: c.providerType },
    servicos: (u.servicos || []).filter((s) => s && s.ativo !== false && !s.oculto),
    livros: autorOk ? (u.livros || []).filter((l) => l && l.ativo !== false && !l.oculto) : []
  };
}
function privado(u) { const c = Object.assign({}, u); delete c.pwdHash; return c; }

// ---------------------------------------------------------------- cadastro e login
async function cadastro(req, env) {
  await limitar(env, 'cad:' + ip(req), 10, 3600, 'Muitos cadastros a partir desta conexão. Tente mais tarde.');
  const b = await corpo(req), d = b.conta || {};
  const email = String(d.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Falha('Informe um e-mail válido.');
  if (String(b.senha || '').length < 6) throw new Falha('A senha precisa ter pelo menos 6 caracteres.');
  if (await env.DB.prepare('SELECT 1 FROM contas WHERE email = ?').bind(email).first()) throw new Falha('Este e-mail já tem cadastro. Faça login no Painel do Prestador.', 409);
  const tipo = ['prestador', 'autor', 'ambos'].includes(d.tipo) ? d.tipo : 'prestador';
  const u = {
    id: 'p_' + rand(8), nome: texto(d.nome, 120), email, whats: texto(d.whats, 30), tipo, desc: texto(d.desc, 4000),
    status: 'pendente', autorAprovado: false, createdAt: agora(),
    cadastro: d.cadastro || {}, servicos: [], livros: [], pedidos: [], perfil: d.perfil || {}, pagamento: {}, entrega: {}
  };
  const stmts = [];
  extrairMidias(env.DB, u, u.id, stmts);
  stmts.push(env.DB.prepare('INSERT INTO contas (id, email, pwd, status, dados, criado, atualizado) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(u.id, email, await hashNovo(b.senha), u.status, JSON.stringify(u), agora(), agora()));
  await env.DB.batch(stmts);
  return json({ conta: u }, 201);
}

async function login(req, env) {
  const b = await corpo(req), email = String(b.email || '').trim().toLowerCase();
  await limitar(env, 'login:' + email, 8, 900, 'Muitas tentativas. Aguarde 15 minutos e tente de novo.', true);
  const row = await env.DB.prepare('SELECT id, pwd, dados FROM contas WHERE email = ?').bind(email).first();
  if (!row || !(await conferirSenha(env, row, String(b.senha || '')))) throw new Falha('E-mail ou senha incorretos.', 401);
  await env.DB.prepare('DELETE FROM tentativas WHERE chave = ?').bind('login:' + email).run();
  const u = JSON.parse(row.dados);
  if (u.status === 'pendente') throw new Falha('Seu cadastro ainda está em análise pela equipe. Tente entrar novamente depois da aprovação.', 403);
  if (u.status === 'recusado') throw new Falha('Seu cadastro não foi aprovado. Fale com o suporte.', 403);
  if (u.status === 'bloqueado') throw new Falha('Seu acesso está bloqueado. Fale com o suporte.', 403);
  const token = rand(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessoes WHERE expira < ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO sessoes (token, conta_id, expira) VALUES (?, ?, ?)').bind(await sha(token), u.id, Date.now() + SESSAO_DIAS * 864e5)
  ]);
  return json({ token, conta: privado(u), cartas: await cartasDoAutor(env, u) });
}

async function contaDaSessao(req, env) {
  const t = bearer(req); if (!t) throw new Falha('Faça login novamente.', 401);
  const s = await env.DB.prepare('SELECT conta_id, expira FROM sessoes WHERE token = ?').bind(await sha(t)).first();
  if (!s || s.expira < Date.now()) throw new Falha('Sua sessão expirou. Faça login novamente.', 401);
  const row = await env.DB.prepare('SELECT dados FROM contas WHERE id = ?').bind(s.conta_id).first();
  if (!row) throw new Falha('Conta não encontrada.', 401);
  const u = JSON.parse(row.dados);
  if (u.status !== 'ativo') throw new Falha('Seu acesso não está ativo. Fale com o suporte.', 403);
  return u;
}

async function salvarMinhaConta(req, env, atual) {
  const b = await corpo(req), d = b.conta || {};
  // Campos que só a equipe (ou o próprio sistema) altera
  ['id', 'email', 'status', 'autorAprovado', 'createdAt', 'tipo', 'pwdHash'].forEach((k) => { d[k] = atual[k]; });
  delete d.pwdHash;
  return json({ conta: await gravarConta(env, d) });
}

async function trocarSenha(req, env, conta) {
  const b = await corpo(req);
  const row = await env.DB.prepare('SELECT id, pwd FROM contas WHERE id = ?').bind(conta.id).first();
  if (!(await conferirSenha(env, row, String(b.atual || '')))) throw new Falha('Senha atual incorreta.', 400);
  if (String(b.nova || '').length < 6) throw new Falha('A nova senha precisa ter pelo menos 6 caracteres.');
  await env.DB.prepare('UPDATE contas SET pwd = ? WHERE id = ?').bind(await hashNovo(b.nova), conta.id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- contas (gravação comum)
async function gravarConta(env, u) {
  delete u.pwdHash;
  const stmts = [];
  extrairMidias(env.DB, u, u.id, stmts);
  stmts.push(env.DB.prepare('UPDATE contas SET dados = ?, status = ?, atualizado = ? WHERE id = ?').bind(JSON.stringify(u), u.status || 'pendente', agora(), u.id));
  await env.DB.batch(stmts);
  await limparOrfas(env, u.id, u);
  return u;
}

// ---------------------------------------------------------------- pedidos e cartas (público)
async function novoPedido(req, env) {
  await limitar(env, 'ped:' + ip(req), 30, 3600, 'Muitos pedidos a partir desta conexão. Tente mais tarde.');
  const b = await corpo(req), p = b.pedido || {};
  if (!Array.isArray(p.itens) || !p.itens.length || p.itens.length > 50) throw new Falha('Pedido sem itens.');
  if (!p.cliente || !p.cliente.nome) throw new Falha('Informe seus dados.');
  let id = /^OM\d{5,12}$/.test(p.id || '') ? p.id : 'OM' + String(Date.now()).slice(-7);
  if (await env.DB.prepare('SELECT 1 FROM pedidos WHERE id = ?').bind(id).first()) id = id + rand(2).toUpperCase();
  p.id = id; p.status = 'aguardando_pagamento'; p.criadoEm = agora();
  await env.DB.prepare('INSERT INTO pedidos (id, dados, criado) VALUES (?, ?, ?)').bind(id, JSON.stringify(p), agora()).run();
  // Avisa cada autor parceiro e baixa o estoque dos livros físicos
  const porAutor = {};
  p.itens.forEach((i) => { if (i && i.autorId) (porAutor[i.autorId] = porAutor[i.autorId] || []).push(i); });
  for (const autorId of Object.keys(porAutor)) {
    const row = await env.DB.prepare('SELECT dados FROM contas WHERE id = ?').bind(autorId).first();
    if (!row) continue;
    const u = JSON.parse(row.dados); u.pedidos = u.pedidos || [];
    porAutor[autorId].forEach((i) => {
      const qty = Math.max(1, Math.min(999, parseInt(i.qty, 10) || 1));
      u.pedidos.push({ id: id + '-' + i.livroId, pedidoId: id, cliente: p.cliente.nome, contato: p.cliente.whats, item: qty + '× ' + i.titulo, valor: Number(i.preco || 0) * qty, status: 'novo', data: p.data, pagamento: p.pagamento, entrega: p.entrega });
      const l = (u.livros || []).find((x) => x.id === i.livroId);
      if (l && l.formato !== 'ebook' && typeof l.estoque === 'number') l.estoque = Math.max(0, l.estoque - qty);
    });
    await env.DB.prepare('UPDATE contas SET dados = ?, atualizado = ? WHERE id = ?').bind(JSON.stringify(u), agora(), autorId).run();
  }
  return json({ pedido: p }, 201);
}

async function novaCarta(req, env) {
  await limitar(env, 'carta:' + ip(req), 20, 3600, 'Muitas cartas a partir desta conexão. Tente mais tarde.');
  const b = await corpo(req), c = b.carta || {};
  const carta = { id: 'c_' + rand(8), autor: texto(c.autor, 200), livro: texto(c.livro, 200), nome: texto(c.nome, 120), texto: texto(c.texto, 5000), data: texto(c.data, 30), lida: false };
  if (!carta.nome || carta.texto.length < 20) throw new Falha('Carta incompleta.');
  await env.DB.prepare('INSERT INTO cartas (id, dados, criado) VALUES (?, ?, ?)').bind(carta.id, JSON.stringify(carta), agora()).run();
  return json({ carta }, 201);
}

function nomesDoAutor(u) {
  const c = u.cadastro || {}, p = u.perfil || {};
  return [u.nome, c.businessName, c.authorName, p.nome].filter(Boolean).map(norm);
}
async function cartasDoAutor(env, u) {
  const nomes = nomesDoAutor(u);
  const rs = await env.DB.prepare('SELECT dados FROM cartas ORDER BY criado').all();
  return rs.results.map((x) => JSON.parse(x.dados)).filter((c) => nomes.includes(norm(c.autor)));
}
async function marcarCarta(req, env, conta, id) {
  const row = await env.DB.prepare('SELECT dados FROM cartas WHERE id = ?').bind(id).first();
  if (!row) throw new Falha('Carta não encontrada.', 404);
  const c = JSON.parse(row.dados);
  if (!nomesDoAutor(conta).includes(norm(c.autor))) throw new Falha('Esta carta não é sua.', 403);
  const b = await corpo(req); c.lida = !!(b.item && b.item.lida);
  await env.DB.prepare('UPDATE cartas SET dados = ? WHERE id = ?').bind(JSON.stringify(c), id).run();
  return json({ item: c });
}

// ---------------------------------------------------------------- admin
function exigirAdmin(req, env) {
  if (!env.ADMIN_KEY) throw new Falha('Defina o segredo ADMIN_KEY no Worker para usar o Painel ADM.', 503);
  const k = bearer(req) || '';
  if (!igual(k, env.ADMIN_KEY)) throw new Falha('Chave do administrador inválida.', 401);
}
async function adminTudo(env) {
  const [c, p, ca] = await env.DB.batch([
    env.DB.prepare('SELECT dados FROM contas ORDER BY criado'),
    env.DB.prepare('SELECT dados FROM pedidos ORDER BY criado'),
    env.DB.prepare('SELECT dados FROM cartas ORDER BY criado')
  ]);
  const pa = (r) => r.results.map((x) => JSON.parse(x.dados));
  return json({ contas: pa(c).map(privado), pedidos: pa(p), cartas: pa(ca), banners: await banners(env), ocultos: await ocultos(env), catalogo: await catalogoSalvo(env) });
}
async function adminSalvarConta(req, env, id) {
  const b = await corpo(req), d = b.conta || {};
  const row = await env.DB.prepare('SELECT dados FROM contas WHERE id = ?').bind(id).first();
  if (!row) throw new Falha('Conta não encontrada.', 404);
  const atual = JSON.parse(row.dados);
  d.id = id; d.email = atual.email; d.createdAt = atual.createdAt;
  if (!['pendente', 'ativo', 'recusado', 'bloqueado'].includes(d.status)) d.status = atual.status;
  return json({ conta: await gravarConta(env, d) });
}
async function adminExcluirConta(env, id) {
  const ids = (await env.DB.prepare('SELECT id FROM midias WHERE dono = ?').bind(id).all()).results.map((x) => x.id);
  const stmts = [
    env.DB.prepare('DELETE FROM contas WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM sessoes WHERE conta_id = ?').bind(id),
    env.DB.prepare('DELETE FROM midias WHERE dono = ?').bind(id)
  ];
  ids.forEach((m) => stmts.push(env.DB.prepare('DELETE FROM midia_partes WHERE midia_id = ?').bind(m)));
  await env.DB.batch(stmts);
  return json({ ok: true });
}
async function catalogoSalvo(env) {
  const r = await env.DB.prepare("SELECT dados FROM config WHERE chave = 'catalogo'").first();
  return r ? JSON.parse(r.dados) : null;
}
async function salvarCatalogo(req, env) {
  const b = await corpo(req), t = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  let lim = null;
  if (b.dados) {
    const o = b.dados;
    lim = {
      servicos: (Array.isArray(o.servicos) ? o.servicos : []).slice(0, 80).map((c) => ({ title: t(c.title, 120), items: (Array.isArray(c.items) ? c.items : []).slice(0, 300).map((s) => ({ name: t(s.name, 160), description: t(s.description, 400), price: t(s.price, 80), icon: t(s.icon, 40) || 'briefcase' })).filter((s) => s.name) })).filter((c) => c.title),
      generos: (Array.isArray(o.generos) ? o.generos : []).slice(0, 80).map((g) => ({ key: t(g.key, 60), label: t(g.label, 120) })).filter((g) => g.key && g.label)
    };
  }
  if (lim) await env.DB.prepare('INSERT INTO config (chave, dados, atualizado) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET dados = excluded.dados, atualizado = excluded.atualizado').bind('catalogo', JSON.stringify(lim), agora()).run();
  else await env.DB.prepare("DELETE FROM config WHERE chave = 'catalogo'").run();
  return json({ dados: lim });
}
async function salvarConfig(req, env, chave) {
  if (!CONFIG_OK.includes(chave)) throw new Falha('Configuração desconhecida.', 404);
  if (chave === 'catalogo') return salvarCatalogo(req, env);
  const b = await corpo(req), bruto = Array.isArray(b.dados) ? b.dados : [];
  // Banners são objetos (imagem + textos). "ocultos" é uma lista de textos curtos.
  const dados = chave.startsWith('banners_') ? limparBanners(bruto) : bruto.filter((x) => typeof x === 'string' && x.length < 200).slice(0, 500);
  const dono = 'config:' + chave, stmts = [];
  extrairMidias(env.DB, dados, dono, stmts);
  stmts.push(env.DB.prepare('INSERT INTO config (chave, dados, atualizado) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET dados = excluded.dados, atualizado = excluded.atualizado').bind(chave, JSON.stringify(dados), agora()));
  await env.DB.batch(stmts);
  await limparOrfas(env, dono, dados);
  return json({ dados });
}

// Copia para o banco os dados que estavam guardados em um navegador. Nunca sobrescreve o que já existe.
async function importar(req, env) {
  const b = await corpo(req), res = { contas: 0, contasExistentes: 0, pedidos: 0, cartas: 0, banners: 0 };
  for (const u of (Array.isArray(b.contas) ? b.contas : [])) {
    if (!u || !u.email || !u.id) continue;
    const email = String(u.email).trim().toLowerCase();
    if (await env.DB.prepare('SELECT 1 FROM contas WHERE email = ? OR id = ?').bind(email, u.id).first()) { res.contasExistentes++; continue; }
    const pwd = u.pwdHash ? 'legado$' + u.pwdHash : null; delete u.pwdHash; u.email = email;
    if (!['pendente', 'ativo', 'recusado', 'bloqueado'].includes(u.status)) u.status = 'pendente';
    const stmts = []; extrairMidias(env.DB, u, u.id, stmts);
    stmts.push(env.DB.prepare('INSERT INTO contas (id, email, pwd, status, dados, criado, atualizado) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(u.id, email, pwd, u.status, JSON.stringify(u), u.createdAt || agora(), agora()));
    await env.DB.batch(stmts); res.contas++;
  }
  for (const p of (Array.isArray(b.pedidos) ? b.pedidos : [])) {
    if (!p || !p.id) continue;
    const r = await env.DB.prepare('INSERT OR IGNORE INTO pedidos (id, dados, criado) VALUES (?, ?, ?)').bind(String(p.id), JSON.stringify(p), p.criadoEm || agora()).run();
    res.pedidos += r.meta.changes || 0;
  }
  for (const c of (Array.isArray(b.cartas) ? b.cartas : [])) {
    if (!c || !c.texto) continue;
    c.id = c.id || 'c_' + (await sha([c.autor, c.nome, c.texto, c.data].join('|'))).slice(0, 16);
    const r = await env.DB.prepare('INSERT OR IGNORE INTO cartas (id, dados, criado) VALUES (?, ?, ?)').bind(c.id, JSON.stringify(c), agora()).run();
    res.cartas += r.meta.changes || 0;
  }
  for (const k of ['servicos', 'livros']) {
    const lista = b.banners && Array.isArray(b.banners[k]) ? b.banners[k] : null;
    if (!lista || !lista.length) continue;
    const chave = 'banners_' + k;
    // Só não sobrescreve se já existir banner de verdade; uma lista vazia pode ser substituída.
    const atual = await env.DB.prepare('SELECT dados FROM config WHERE chave = ?').bind(chave).first();
    if (atual) { let a = []; try { a = JSON.parse(atual.dados); } catch (e) {} if (Array.isArray(a) && a.length) continue; }
    const limpa = limparBanners(lista);
    if (!limpa.length) continue;
    const stmts = []; extrairMidias(env.DB, limpa, 'config:' + chave, stmts);
    stmts.push(env.DB.prepare('INSERT INTO config (chave, dados, atualizado) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET dados = excluded.dados, atualizado = excluded.atualizado').bind(chave, JSON.stringify(limpa), agora()));
    await env.DB.batch(stmts); res.banners++;
  }
  return json(res);
}

// ---------------------------------------------------------------- arquivos (imagens, vídeos, PDFs)
// Troca cada "data:...;base64,..." grande por um endereço /api/midia/<id> e grava o arquivo no banco.
// Mantém só os campos que um banner pode ter, com tamanho limitado.
// O campo src não é cortado: pode ser um data: URI grande, que extrairMidias grava no banco.
function limparBanners(lista) {
  const txt = (v, n) => (typeof v === 'string' ? v : '').trim().slice(0, n);
  return lista
    .filter((x) => x && typeof x === 'object' && typeof x.src === 'string' && x.src.length > 0)
    .slice(0, 20)
    .map((x) => ({
      type: ['image', 'video', 'pdf'].includes(x.type) ? x.type : 'image',
      src: x.src,
      srcMob: typeof x.srcMob === 'string' ? x.srcMob : '',
      name: txt(x.name, 160),
      title: txt(x.title, 120),
      eyebrow: txt(x.eyebrow, 80),
      headline: txt(x.headline, 160),
      sub: txt(x.sub, 300),
      ctaText: txt(x.ctaText, 60),
      ctaLink: txt(x.ctaLink, 400)
    }));
}

function extrairMidias(db, obj, dono, stmts) {
  const visitar = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'string' && v.length > 600 && v.startsWith('data:')) o[k] = gravarMidia(db, v, dono, stmts);
      else if (v && typeof v === 'object') visitar(v);
    }
  };
  visitar(obj);
}
function gravarMidia(db, dataUri, dono, stmts) {
  const m = /^data:([\w.+\/-]+)?(;[\w=-]+)*;base64,/.exec(dataUri.slice(0, 200));
  if (!m) return dataUri;
  const bin = atob(dataUri.slice(m[0].length));
  if (bin.length > MAX_MIDIA) throw new Falha('Arquivo grande demais (máximo ' + Math.round(MAX_MIDIA / 1048576) + ' MB). Para vídeos maiores, use um link do YouTube.', 413);
  const id = rand(16), partes = Math.max(1, Math.ceil(bin.length / PARTE));
  stmts.push(db.prepare('INSERT INTO midias (id, dono, mime, tamanho, partes, criado) VALUES (?, ?, ?, ?, ?, ?)').bind(id, dono, m[1] || 'application/octet-stream', bin.length, partes, agora()));
  for (let n = 0; n < partes; n++) {
    const pedaco = bin.slice(n * PARTE, (n + 1) * PARTE), bytes = new Uint8Array(pedaco.length);
    for (let i = 0; i < pedaco.length; i++) bytes[i] = pedaco.charCodeAt(i);
    stmts.push(db.prepare('INSERT INTO midia_partes (midia_id, n, dados) VALUES (?, ?, ?)').bind(id, n, bytes));
  }
  return '/api/midia/' + id;
}

async function limparOrfas(env, dono, obj) {
  const usados = new Set(), txt = JSON.stringify(obj);
  txt.replace(/\/api\/midia\/([a-f0-9]{16,64})/g, (_, id) => usados.add(id));
  const ids = (await env.DB.prepare('SELECT id FROM midias WHERE dono = ?').bind(dono).all()).results.map((x) => x.id).filter((id) => !usados.has(id));
  if (!ids.length) return;
  const stmts = [];
  ids.forEach((id) => { stmts.push(env.DB.prepare('DELETE FROM midia_partes WHERE midia_id = ?').bind(id)); stmts.push(env.DB.prepare('DELETE FROM midias WHERE id = ?').bind(id)); });
  await env.DB.batch(stmts);
}

async function servirMidia(env, id, req) {
  const m = await env.DB.prepare('SELECT mime, tamanho FROM midias WHERE id = ?').bind(id).first();
  if (!m) return new Response('Arquivo não encontrado', { status: 404 });
  const rs = await env.DB.prepare('SELECT dados FROM midia_partes WHERE midia_id = ? ORDER BY n').bind(id).all();
  const total = new Uint8Array(m.tamanho); let pos = 0;
  rs.results.forEach((x) => { const b = new Uint8Array(x.dados); total.set(b, pos); pos += b.length; });
  const h = { 'Content-Type': m.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('Range') || '');
  if (range) {
    let ini = range[1] === '' ? Math.max(0, total.length - parseInt(range[2], 10)) : parseInt(range[1], 10);
    let fim = range[1] !== '' && range[2] !== '' ? Math.min(parseInt(range[2], 10), total.length - 1) : total.length - 1;
    if (ini > fim || ini >= total.length) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + total.length } });
    return new Response(total.slice(ini, fim + 1), { status: 206, headers: Object.assign(h, { 'Content-Range': `bytes ${ini}-${fim}/${total.length}`, 'Content-Length': String(fim - ini + 1) }) });
  }
  return new Response(total, { headers: Object.assign(h, { 'Content-Length': String(total.length) }) });
}

// ---------------------------------------------------------------- senhas
async function hashNovo(senha) {
  const salt = rand(16), it = 100000;
  return 'pbkdf2$' + it + '$' + salt + '$' + await pbkdf2(String(senha), salt, it);
}
async function conferirSenha(env, row, senha) {
  if (!row || !row.pwd) return false;
  const p = row.pwd.split('$');
  if (p[0] === 'pbkdf2') return igual(await pbkdf2(senha, p[2], +p[1]), p[3]);
  if (p[0] === 'legado' && igual(hashLegado(senha), p.slice(1).join('$'))) {
    // Conta importada do modo navegador: troca pelo formato seguro no primeiro login
    await env.DB.prepare('UPDATE contas SET pwd = ? WHERE id = ?').bind(await hashNovo(senha), row.id).run();
    return true;
  }
  return false;
}
async function pbkdf2(senha, saltHex, it) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexBytes(saltHex), iterations: it }, key, 256);
  return hex(bits);
}
// Mesmo cálculo do site antigo (só para aceitar senhas de contas importadas)
function hashLegado(s) {
  let h = 0; s = String(s || '');
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return 'h' + Math.abs(h).toString(36) + '_' + s.length;
}

// ---------------------------------------------------------------- utilidades
async function limitar(env, chave, max, janela, msg, soContar) {
  const now = Date.now(), row = await env.DB.prepare('SELECT n, ate FROM tentativas WHERE chave = ?').bind(chave).first();
  if (row && row.ate > now && row.n >= max) throw new Falha(msg, 429);
  if (!row || row.ate <= now) await env.DB.prepare('INSERT INTO tentativas (chave, n, ate) VALUES (?, 1, ?) ON CONFLICT(chave) DO UPDATE SET n = 1, ate = excluded.ate').bind(chave, now + janela * 1000).run();
  else await env.DB.prepare('UPDATE tentativas SET n = n + 1 WHERE chave = ?').bind(chave).run();
}
async function corpo(req) {
  const len = +(req.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) throw new Falha('Envio grande demais. Reduza os arquivos ou use links do YouTube.', 413);
  const t = await req.text();
  if (t.length > MAX_BODY) throw new Falha('Envio grande demais.', 413);
  try { return JSON.parse(t || '{}'); } catch (e) { throw new Falha('Dados inválidos.'); }
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}) });
}
function bearer(req) { const a = req.headers.get('Authorization') || ''; return a.startsWith('Bearer ') ? a.slice(7).trim() : ''; }
function ip(req) { return req.headers.get('CF-Connecting-IP') || 'local'; }
function agora() { return new Date().toISOString(); }
function texto(v, n) { return String(v == null ? '' : v).slice(0, n); }
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
function rand(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return hex(b); }
function hex(buf) { return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
function hexBytes(h) { const b = new Uint8Array(h.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b; }
async function sha(t) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))); }
function igual(a, b) {
  a = String(a); b = String(b); let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
