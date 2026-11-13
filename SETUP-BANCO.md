# Ligar o banco central (Cloudflare D1)

Sem estes passos o site continua funcionando como antes: os dados ficam só no navegador.

## 1. Criar o banco
Cloudflare > **Storage & Databases** > **D1 SQL Database** > **Create database**
- Nome: `omegahub`
- Copie o **Database ID** que aparece depois de criar.

As tabelas são criadas sozinhas no primeiro acesso. Não é preciso rodar SQL.

## 2. Ligar o banco ao site
No GitHub, abra `wrangler.toml` e troque o final por:

```toml
[[d1_databases]]
binding = "DB"
database_name = "omegahub"
database_id = "COLE_AQUI_O_ID"
```

O Database ID não é uma senha. Pode ficar no GitHub.

## 3. Criar a chave do Painel ADM
Cloudflare > **Workers & Pages** > **prestadores** > **Settings** > **Variables and Secrets** > **Add**
- Type: **Secret**
- Name: `ADMIN_KEY`
- Value: uma senha longa só sua (ex.: 20 caracteres misturados)

Essa chave nunca vai no GitHub nem no site. O Painel ADM pede a chave ao abrir.

## 4. Publicar e conferir
Depois do deploy, abra `https://SEU-SITE/api/estado`. O certo é aparecer `"db":true,"admin":true`.

## 5. Trazer os cadastros antigos
Os cadastros feitos antes estão guardados no navegador onde foram feitos.
Em **cada navegador/aparelho** que tem cadastros, abra o Painel ADM e clique em
**Enviar dados deste navegador para o banco**. Nada que já está no banco é apagado ou substituído.
As senhas antigas continuam valendo e são convertidas para o formato seguro no primeiro login.

## Limites
- Arquivos: até 15 MB cada (imagem, vídeo ou PDF). Vídeos maiores: link do YouTube.
- Plano gratuito do D1: 5 GB de armazenamento no total.
