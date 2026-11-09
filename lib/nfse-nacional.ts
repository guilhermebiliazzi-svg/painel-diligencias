/**
 * NFS-e pelo Sistema Nacional (Emissor Nacional).
 *
 * Desde 01/11/2026 as ME/EPP do Simples em São Paulo emitem pelo Emissor
 * Nacional; o web service da Prefeitura só aceita fatos geradores até 31/10.
 * A emissão continua passando pelo Render (que guarda o certificado A1).
 *
 * NFSE_EMISSOR=sp volta para o web service da Prefeitura (emergência).
 */

export const EMISSOR_NACIONAL = (process.env.NFSE_EMISSOR || "nacional").toLowerCase() !== "sp";

/** Série da DPS na automação (faixa 00001–49999 = aplicativo próprio). */
export const SERIE_DPS = "1";

/**
 * Série usada no "teste" (produção restrita, sem efeito fiscal). O número
 * não sai do contador do banco: testes não queimam números de produção.
 */
export const SERIE_TESTE = "49999";
export const numeroTeste = () => Number(String(Date.now()).slice(-12));

/** Série antiga (RPS do web service da Prefeitura). */
export const SERIE_RPS_SP = "VJ01";

/** O DANFSe (PDF oficial) só sai com o certificado; o painel faz a ponte. */
export const linkDanfse = (chave: string) => `/api/adm/notas/danfse/${String(chave).replace(/\D/g, "")}`;

export function headersRender(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.NFSE_SP_TOKEN) h["x-nfse-token"] = process.env.NFSE_SP_TOKEN;
  return h;
}

export const rotaEmitir = () => (EMISSOR_NACIONAL ? "/nfse-nacional/emitir" : "/nfse-sp/emitir");
