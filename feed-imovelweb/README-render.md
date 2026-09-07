# Serviço do feed unificado ImovelWeb — como subir no Render

Três arquivos: `app.py`, `unificar_feeds.py`, `requirements.txt`.

## 1. Repositório

Ponha os três num repositório (pode ser uma pasta nova no
`painel-diligencias` ou um repo próprio — o Render aceita subpasta).

## 2. Criar o Web Service no Render

- **Environment:** Python 3
- **Build command:** `pip install -r requirements.txt`
- **Start command:** `uvicorn app:app --host 0.0.0.0 --port $PORT`
- **Health check path:** `/saude`
- **Plano:** o gratuito hiberna depois de 15 min parado e demora ~50 s para
  acordar. Como o n8n espera 4 minutos antes de conferir o status, funciona —
  mas se quiser previsibilidade, o plano pago evita a hibernação.

## 3. Variáveis de ambiente no Render

| variável | valor |
|---|---|
| `FEED_TOKEN` | um segredo qualquer, longo. O n8n manda no header `x-feed-token`. |
| `SUPABASE_URL` | `https://nrgsutbwxysgzgaixlhe.supabase.co` |
| `SUPABASE_SERVICE_KEY` | a service role do projeto (a mesma que o painel usa) |
| `SUPABASE_BUCKET` | `criativos-imoveis` |
| `FEED_PREFIXO` | `feeds` |
| `DIR_SAIDA` | `/tmp/feeds` |
| `GZIP` | deixe vazio por ora; `1` se o ImovelWeb aceitar gzip |

## 4. Antes do primeiro envio: o limite do Storage

O bucket vem com **50 MB por arquivo** e a Ville tem **52,4 MB**. Sem aumentar,
o upload dela volta **HTTP 413** e o serviço registra o erro na sucursal.

No Supabase: *Storage → Configuration → Upload file size limit*. Suba para
100 MB e sobra folga para o estoque crescer.

## 5. As URLs que vão para o ImovelWeb

```
https://nrgsutbwxysgzgaixlhe.supabase.co/storage/v1/object/public/criativos-imoveis/feeds/remax_ville.xml
https://nrgsutbwxysgzgaixlhe.supabase.co/storage/v1/object/public/criativos-imoveis/feeds/remax_homemark.xml
https://nrgsutbwxysgzgaixlhe.supabase.co/storage/v1/object/public/criativos-imoveis/feeds/remax_alcance.xml
```

São fixas: o portal lê sempre o mesmo endereço e o arquivo é sobrescrito
(`x-upsert: true`).

## 6. Teste manual antes de ligar o cron

```
curl https://SEU-SERVICO.onrender.com/saude

curl -X POST -H "x-feed-token: SEU_TOKEN" \
     https://SEU-SERVICO.onrender.com/gerar

curl -H "x-feed-token: SEU_TOKEN" \
     https://SEU-SERVICO.onrender.com/status
```

O `/gerar` devolve `202` na hora com um `job_id` — ele não espera o trabalho
terminar. O `/status` mostra o andamento e, no fim, o total de cada sucursal e
a URL pública. Para gerar só uma: `/gerar?sucursal=ville`.

## 7. O workflow do n8n

Importe `WF_Feed_ImovelWeb.json` e configure duas variáveis de ambiente no n8n:

| variável | valor |
|---|---|
| `FEED_RENDER_URL` | `https://SEU-SERVICO.onrender.com` (sem barra no fim) |
| `FEED_TOKEN` | o mesmo do Render |

`WA_PHONE_NUMBER_ID`, `WA_TOKEN` e `ADMIN_WHATSAPP` já existem — são as mesmas
que os outros workflows usam para falar no seu WhatsApp.

O cron roda **05:13 UTC (02:13 de Brasília)**. Esse minuto foi escolhido a
dedo: o `:00` é da EVA e `:07`, `:22`, `:23`, `:37` e `:52` já estão ocupados
pelos workflows pesados, por causa do incidente de OOM de 23/08.

## 8. O que o WhatsApp vai dizer

Só chega mensagem quando há problema — feed que não gerou, erro de upload,
cota estourada ou **queda brusca de volume**, que costuma ser fonte fora do ar
e não imóvel vendido. Dia normal é silêncio; os números ficam no log da
execução.

As referências de volume (Ville 2.671, Homemark 2.186, Alcance 444) estão no
nó `Avaliar`, na constante `REFERENCIA`. Se o estoque mudar de patamar,
atualize lá, senão o alerta vira ruído.
