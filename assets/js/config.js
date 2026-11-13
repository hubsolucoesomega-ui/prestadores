// Configuração pública do site OmegaHub (Cloudflare Workers)
// Dados de prestadores e cadastros ficam no localStorage do navegador.
// Para persistência em servidor, configure um Worker KV ou D1 e adicione o endpoint aqui.
window.OMEGA_CONFIG = {
  storageMode: "local", // "local" = localStorage; "api" = Cloudflare Worker API
  // apiBase: "https://prestadores.hubsolucoesomega.workers.dev/api", // descomente ao integrar Worker API
};
