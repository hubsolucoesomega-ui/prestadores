# OmegaHub · site, cadastro de prestadores e painel ADM

## Estrutura

- `index.html`: página inicial (capa, vídeo, categorias e busca de prestadores).
- `cadastro-prestador.html`: formulário de cadastro para prestadores.
- `admin.html`: painel ADM para aprovar ou reprovar cadastros.
- `assets/js/config.js`: configuração pública (URL e chave `anon` do Supabase).
- `assets/js/common.js`: validação de CPF e CNPJ e acesso aos dados.
- `assets/js/cadastro.js` e `assets/js/admin.js`: lógica das duas telas.
- `supabase/schema.sql`: tabelas, regras de acesso (RLS) e vitrine pública.

## Modo demonstração

Com `config.js` vazio, o cadastro e o painel funcionam só neste navegador (localStorage).
Serve para testar o fluxo, não para produção.

## Como ligar ao Supabase (quando o projeto for criado)

1. Crie o projeto no Supabase.
2. No SQL Editor, rode `supabase/schema.sql`.
3. Crie o primeiro administrador: em Authentication > Users, crie o usuário, copie o `id` e rode
   `insert into public.admins (user_id) values ('<id-do-usuario>');`
4. Em `assets/js/config.js`, preencha `supabaseUrl` e `supabaseAnonKey` (chave publishable/anon).
   Nunca use a chave `service_role` no site.
5. Publique o site (GitHub Pages ou outro host estático).

## Pendências antes de publicar de verdade

- **Upload de documentos**: hoje só o nome do arquivo é registrado. Falta criar um bucket privado no
  Storage (`provider-docs`) e enviar os arquivos com caminho do tipo `provider-docs/<id>/<tipo>.pdf`.
  Documentos nunca devem ir para o GitHub.
- **Antispam**: o cadastro é público. Adicione captcha (ex.: Cloudflare Turnstile) antes do lançamento.
- **Verificação automática**: CPF e CNPJ já são validados por dígito. Falta consultar a Receita Federal,
  a situação do CNPJ e os conselhos (OAB, CRP, CRC, SUSEP) por integração ou revisão manual.
- **Notificações**: avisar o prestador por e-mail ou WhatsApp quando aprovado ou reprovado.
- **LGPD**: publicar política de privacidade e termos de uso; registrar o aceite com data.
- **Vitrine**: ligar a página `index.html` à view `providers_public`, para mostrar só prestadores aprovados.

## Segurança

- A chave `anon` é pública por desenho; a segurança vem das regras RLS do `schema.sql`.
- Dados sensíveis (CPF, CNPJ, dados bancários, documentos) ficam só na tabela `providers`, que só o ADM lê.
- Nenhum documento, senha ou chave `service_role` deve entrar no repositório.
