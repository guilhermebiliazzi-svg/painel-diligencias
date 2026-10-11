// Qual workflow do n8n emite cada tipo de certidão (usado pelo "Reemitir" do painel).
// null = card manual (upload): o painel não mostra "Reemitir" para ele.
export type RotaCertidao = 'wf03' | 'wf04' | 'wf08';

export function rotaDoTipo(tipo: string | null | undefined): RotaCertidao | null {
  if (!tipo) return null;
  if (tipo.startsWith('cnd_federal')) return 'wf03';
  if (tipo.startsWith('tjsp_') || tipo.startsWith('trf_') || tipo.startsWith('trt2_')) return 'wf04';
  if (
    tipo.startsWith('cndt_tst') ||
    tipo.startsWith('pge_sp_') ||
    tipo.startsWith('sefaz_sp_') ||
    tipo.startsWith('mobiliaria_') ||
    tipo === 'crf_fgts' ||
    tipo.startsWith('sit_cadastral_') ||
    tipo.startsWith('cenprot_') ||
    tipo === 'iptu_pref_sp' ||
    tipo === 'dados_cadastrais_imovel' || // automática desde 11/10/2026 (WF-08, Infosimples)
    tipo === 'prefeitura_iss'
  )
    return 'wf08';
  return null;
}
