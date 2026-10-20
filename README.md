# RECONNECT — Retiro de Jovens (05 a 09/02/2027)

Site estático (`public/`) + funções do Netlify (`netlify/functions/`) + banco no Supabase.
O arquivo `server.js` é só para testar no computador (grava em `data/`); **na internet vale o Netlify + Supabase**.

## Publicar (com a conta nova)

### 1. Supabase (banco de dados)
1. Crie um projeto em supabase.com (plano gratuito serve).
2. Vá em **SQL Editor > New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**. (Se você já tinha criado a tabela antes, rode só a última linha do arquivo, que adiciona a coluna `info` com contato de emergência e saúde.)
3. Em **Project Settings > API**, copie: **Project URL** e a chave **service_role** (secreta; nunca vai para o GitHub nem para o site).

### 2. GitHub
Suba esta pasta para um repositório (o `.gitignore` já protege `data/` e `.env`).

### 3. Netlify
1. **Add new site > Import from Git** e escolha o repositório. O `netlify.toml` já configura tudo (publish `public`, functions `netlify/functions`).
2. Em **Site configuration > Environment variables**, crie:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = chave service_role
   - `ADMIN_PASSWORD` = senha única (modo temporário; só vale enquanto as duas variáveis abaixo não existirem)
   - `SUPABASE_PUBLISHABLE_KEY` = chave pública (publishable/anon) do Supabase
   - `ADMIN_EMAILS` = e-mails autorizados no painel, separados por vírgula
3. Faça o deploy (ou **Trigger deploy** depois de criar as variáveis).

### 4. Ver as inscrições
**Login por e-mail + senha:** no Supabase, em **Authentication > Users > Add user**, crie uma conta por pessoa (marque *Auto Confirm User*) e desative cadastros públicos em **Authentication > Sign In / Providers** (*Allow new users to sign up* desligado). Depois defina `SUPABASE_PUBLISHABLE_KEY` e `ADMIN_EMAILS` no Netlify e faça um novo deploy. Só e-mails da lista entram. Depois de entrar, o botão **Usuários** do painel cria e remove outros acessos (e-mail + senha); os e-mails de `ADMIN_EMAILS` ficam fixos e só saem pelo Netlify.
Abra `https://SEU-SITE.netlify.app/admin` e entre com e-mail e senha. Lá você vê todos os cadastros, confirma o pagamento, cancela e baixa o CSV.

## Para abrir as inscrições
1. `config.json`: `"registrationOpen": true`
2. Preços em `prices` (valor cheio) e `discountPrices` (valor à vista / combo familiar, 10%); faixa etária: 0–4 anos grátis, 5–9 meia, 10+ integral (regras em `public/js/pricing.js`). Preencha também `pix.key`, `pix.holder`, `contactWhatsapp` e a lista `districts` (se vazia, o distrito vira campo de texto).
3. Pagamento (regras em `public/js/pricing.js`): **Pix** à vista (-10%); **crediário** 2x/3x, uma parcela por mês, controlado no painel (`crediario.until` = última data para escolher essa opção, ex.: `"2026-12-31"`; vazio = sem limite; `crediario.enabled`); **cartão** (InfinitePay, taxa repassada ao cliente): total = preço ÷ (1 − taxa), então a organização recebe o preço cheio e a taxa fica com a maquininha. `installmentFees` guarda a taxa de cada parcela e `cardInstallments` lista as parcelas liberadas (hoje 2x, 3x, 4x, 7x, 9x e 12x; para liberar outras, informe o valor da InfinitePay e inclua a taxa). Só para os distritos de `cardDistricts` (Veiga Jardim).
4. Faça commit/push: o Netlify publica sozinho.
(Alternativa rápida: variável `REGISTRATION_OPEN=true` no Netlify + novo deploy.)

## Conteúdo (sem mexer em código): `public/js/content.js`
Programação, line-up, local (nome, endereço, link do mapa, fotos), novidades, 6 fotos do retiro e `photosLink` (link do álbum completo).

## Imagens: `public/img/`
`logo-conecta-azul.png`, `logo-iasd.png`, `hero.jpg` (opcional, foto de fundo do topo), `local/`, `retiro/`, `lineup/`.

## Segurança e LGPD
- A chave `service_role` e o `ADMIN_PASSWORD` ficam só nas variáveis do Netlify.
- No Supabase a tabela tem RLS ligada e sem policies: o navegador não consegue ler nem gravar direto; só as funções.
- Há CPF e telefone no banco: limite quem tem acesso ao Supabase/Netlify e apague os dados depois do evento.

## Testar no computador
`node server.js` → http://localhost:3000 (admin em `/admin`, qualquer e-mail + a senha local `troque-esta-senha`, ou defina `ADMIN_PASSWORD`).

## Dados do responsável e menores de idade
- **Todos** os participantes informam alergia, restrição alimentar, medicamento controlado e acessibilidade; só o 1º (responsável) informa o contato de emergência e a autorização de uso de imagem (obrigatória). Isso aparece só no painel (Detalhes e Validar entrada) e no CSV; **a consulta pública nunca mostra**.
- Se houver menor de idade sem o responsável legal, o formulário exige a ciência da **autorização assinada**, entregue no dia. Modelo imprimível: `/autorizacao.html` (a organização deve revisar o texto).
