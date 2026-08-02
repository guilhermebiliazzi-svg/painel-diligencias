# Configuração do login (Google + Supabase Auth) — o que só você faz

Isto é o **caminho crítico**: o código do login só funciona depois que estes
passos estiverem prontos. Os valores do seu projeto já vão preenchidos.

Seu projeto Supabase:
- Project ref: `nrgsutbwxysgzgaixlhe`
- URL do projeto: `https://nrgsutbwxysgzgaixlhe.supabase.co`
- Callback do Supabase (usado no Google): `https://nrgsutbwxysgzgaixlhe.supabase.co/auth/v1/callback`
- Site (produção): `https://painel.villejardins.com.br`

## 1. Rodar a migração
No SQL editor do Supabase, rode `sql/2026-08_auth_perfis.sql`. Isso cria a
tabela de perfis/permissões e já te cadastra como admin.

## 2. Criar o cliente OAuth no Google Cloud
1. https://console.cloud.google.com → crie/escolha um projeto.
2. "APIs e serviços" → "Tela de permissão OAuth" → tipo **Externo**, preencha
   nome do app (ex.: "Painel Ville Jardins"), e-mail de suporte e logo (opcional).
3. "Credenciais" → "Criar credenciais" → "ID do cliente OAuth" → **App da Web**.
4. Em **URIs de redirecionamento autorizados**, adicione exatamente:
   `https://nrgsutbwxysgzgaixlhe.supabase.co/auth/v1/callback`
5. Salve. Guarde o **Client ID** e o **Client Secret**.

## 3. Ativar o Google no Supabase
1. Supabase → Authentication → Providers → **Google** → ligar.
2. Cole o **Client ID** e o **Client Secret** do passo 2. Salvar.
3. Authentication → URL Configuration:
   - **Site URL**: `https://painel.villejardins.com.br`
   - **Redirect URLs** (adicione as duas):
     `https://painel.villejardins.com.br/auth/callback`
     `http://localhost:3000/auth/callback`

## 4. E-mails de convite com a cara da empresa (recomendado)
Por padrão o Supabase envia e-mails de um remetente genérico e com limite baixo.
Para um produto, configure um SMTP próprio:
1. Crie conta no **Resend** (ou SendGrid) e valide o domínio villejardins.com.br.
2. Supabase → Project Settings → Authentication → **SMTP Settings** → preencha
   host/porta/usuário/senha do Resend e o remetente (ex.: `acesso@villejardins.com.br`).
3. Authentication → Email Templates → ajuste o texto do **Invite** (convite).

## 5. Pegar as chaves e colocar no ambiente
Supabase → Project Settings → **API**:
- `Project URL`  → variável `NEXT_PUBLIC_SUPABASE_URL`
- `anon public`  → variável `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` → variável `SUPABASE_SERVICE_ROLE_KEY`  (⚠️ secreta, só no servidor)

Coloque as três no `.env.local` (dev) **e** na Vercel (produção). No seu
`.env.local` local eu já deixei os campos prontos (só colar os valores).

> A `service_role` é uma chave poderosa (ignora as regras de segurança do banco).
> Nunca a exponha no navegador nem a comite no git — só como variável de ambiente.

Quando terminar os passos 1 a 5, me avisa que eu ligo o código do login.
