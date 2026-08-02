# Painel interno — home com login (hub)

A raiz `/` de `painel.villejardins.com.br` passou a ser a **home interna da
equipe**: uma tela com login que reúne as áreas da operação (Diligências,
Cobranças, Repasse, Notas) e deixa espaço para telas futuras.

O painel do **cliente** (`/d/<uuid>`) continua **público e intacto** — ele é
acessado pelo link/UUID e não passa por login.

## O que foi adicionado

```
proxy.ts                     # controle de acesso (Next 16: era o middleware)
lib/session-crypto.ts        # assinatura de sessão + hash de senha (crypto nativo)
lib/session.ts               # cria/lê/encerra sessão via cookie
lib/users.ts                 # busca usuário em painel.usuarios_painel (SELECT)
lib/nav.ts                   # config dos cards do hub (URLs vêm de env)
app/page.tsx                 # a HOME/hub (antes era uma landing vazia)
app/actions.ts               # logout
app/login/page.tsx           # tela de login (shell)
app/login/login-form.tsx     # formulário (client)
app/login/actions.ts         # Server Action de login
app/login/types.ts           # tipo compartilhado
sql/2026-08_usuarios_painel.sql   # migração da tabela de usuários
scripts/hash-senha.mjs       # gera o hash de senha p/ cadastrar usuários
.env.example                 # referência das variáveis
```

Nenhuma dependência nova foi adicionada — usa só o `crypto` do Node.

## Como funciona o acesso

- Sessão **stateless**: um cookie `painel_sessao` (HttpOnly) assinado com
  HMAC-SHA256 pela `SESSION_SECRET`. Nada é gravado no banco em runtime.
- O `proxy.ts` roda antes de cada rota e:
  - deixa passar **sem login**: `/login`, `/d/<uuid>` e `/api/diligencia/*`;
  - manda pro `/login` quem tentar qualquer outra rota sem sessão válida.
- As senhas são guardadas como **hash scrypt** (`scrypt$N$r$p$salt$hash`),
  nunca em texto puro.

## Passo a passo para colocar no ar

### 1. Variáveis de ambiente

No `.env.local` (dev) **e** na Vercel (produção → Settings → Environment
Variables), defina:

- `SESSION_SECRET` — segredo da sessão. Gere com `openssl rand -base64 32`
  (já foi gerado um no seu `.env.local` local; na Vercel use um próprio).
- `PAINEL_URL_DILIGENCIAS`, `PAINEL_URL_COBRANCAS`, `PAINEL_URL_REPASSE`,
  `PAINEL_URL_NOTAS` — a URL de cada tela onde ela está publicada hoje.
  Enquanto vazias, o card aparece como "definir URL" (não clicável).

### 2. Criar a tabela de usuários

No **SQL editor do Supabase** (com a role de admin/owner, não a
`painel_looker`), rode o arquivo `sql/2026-08_usuarios_painel.sql`.

### 3. Cadastrar usuários

Gere o INSERT já com o hash da senha e cole no SQL editor:

```bash
node scripts/hash-senha.mjs guilherme "Guilherme Biliazzi" "SuaSenhaForte"
```

Repita para cada pessoa da equipe. Para desativar alguém sem apagar:
`update painel.usuarios_painel set ativo = false where login = 'fulano';`

### 4. Deploy

Faça commit e push (a Vercel builda no push). Confirme que as variáveis de
ambiente do passo 1 estão definidas **na Vercel** também.

## Trocar/segurar senha

- Trocar senha: gere um novo hash com o script e faça
  `update painel.usuarios_painel set senha_hash = '<hash>' where login = '<login>';`
- Sessão dura 7 dias; "Sair" apaga o cookie na hora.

## Evoluções possíveis

- Adicionar uma nova tela é só incluir um item em `lib/nav.ts` (e a env da URL).
- Se as telas forem migradas para dentro deste repo no futuro, os cards podem
  apontar para rotas internas (`/notas`, `/repasse`…) em vez de URLs externas.

## Topologia (importante)

Verificado no ar em ago/2026:

- `painel.villejardins.com.br/` e `/d/<uuid>` são servidos por **este** repo
  (`painel-diligencias`). O hub entra aqui, na raiz.
- `/admin`, `/cobrancas`, `/repasses`, `/notas` são servidos por **outro app**
  no mesmo domínio, cada um com **login próprio**.

Por isso duas coisas foram feitas de propósito:

1. Os cards usam a **URL absoluta** de cada tela (navegação de página cheia
   entre apps), não `<Link>` interno.
2. O `proxy.ts` **deixa esses caminhos passarem intactos** — ele nunca
   redireciona `/admin`, `/cobrancas`, `/repasses` ou `/notas` para o login do
   hub. Assim o acesso às telas existentes não quebra.

### Ressalva: login duplo (por enquanto)

Como cada tela tem login próprio, hoje a pessoa entra no hub e, ao abrir uma
tela, pode ver o login daquela tela também. Isso é esperado no modelo
"linkar para as URLs atuais". Para ter **um login só**, o caminho é consolidar
as telas dentro deste repo (aí os cards viram rotas internas `/notas`,
`/repasses`… atrás da mesma sessão) — dá para fazer isso depois, de forma
incremental.
