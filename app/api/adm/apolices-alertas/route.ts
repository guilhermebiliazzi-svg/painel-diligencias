// Apólices (seguro-fiança, capitalização, residencial…) vencendo nos próximos 30 dias
// ou já vencidas, de contratos ativos. Alimenta a faixa de avisos do /cobrancas.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { acessoContratos } from "@/lib/adm-acesso";
import { ALERTA_APOLICE_DIAS, diasAte, hojeSP, nomeTipoSeguro } from "@/lib/contrato-documentos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ac = await acessoContratos();
  if (!ac.ok) return NextResponse.json({ error: ac.error }, { status: ac.status });

  const limite = new Date(Date.parse(hojeSP() + "T00:00:00Z") + ALERTA_APOLICE_DIAS * 86400000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabaseAdmin()
    .from("adm_seguros")
    .select(
      "id,tipo,seguradora,numero_apolice,vigencia_fim,contrato_id," +
        "adm_contratos!inner(id,status,adm_locatarios(nome),adm_imoveis(rua,numero,complemento))"
    )
    .eq("ativo", true)
    .eq("adm_contratos.status", "ativo")
    .not("vigencia_fim", "is", null)
    .lte("vigencia_fim", limite)
    .order("vigencia_fim", { ascending: true });

  if (error) return NextResponse.json({ error: "Falha ao carregar apólices.", detail: error.message }, { status: 502 });

  const alertas = ((data as any[]) || []).map((s) => {
    const dias = diasAte(s.vigencia_fim) ?? 0;
    const c = s.adm_contratos || {};
    const im = c.adm_imoveis;
    const nome = nomeTipoSeguro(s.tipo) + (s.seguradora ? ` ${s.seguradora}` : "");
    return {
      seguro_id: s.id,
      contrato_id: s.contrato_id,
      locatario: c.adm_locatarios?.nome || "—",
      endereco: im ? `${im.rua || ""}, ${im.numero || ""}${im.complemento ? " " + im.complemento : ""}` : "",
      vigencia_fim: s.vigencia_fim,
      dias,
      cor: dias <= 7 ? "vermelho" : "amarelo",
      detalhe:
        dias < 0
          ? `${nome} venceu há ${-dias} dia${dias === -1 ? "" : "s"}`
          : dias === 0
          ? `${nome} vence hoje`
          : `${nome} vence em ${dias} dia${dias === 1 ? "" : "s"}`,
    };
  });

  return NextResponse.json({ alertas });
}
