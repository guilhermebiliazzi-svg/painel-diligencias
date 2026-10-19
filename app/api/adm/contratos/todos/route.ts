// Lista de contratos cadastrados (ativos e inativos) para a tela /contratos.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { acessoContratos } from "@/lib/adm-acesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ac = await acessoContratos();
  if (!ac.ok) return NextResponse.json({ error: ac.error }, { status: ac.status });
  const { data, error } = await supabaseAdmin()
    .from("adm_contratos")
    .select("id,status,valor_atual_aluguel,data_inicio,tipo_uso,locatario:adm_locatarios(nome),imovel:adm_imoveis(rua,numero,complemento,bairro)")
    .order("id", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("contratos/todos:", error.message);
    return NextResponse.json({ error: "Falha ao carregar os contratos." }, { status: 502 });
  }
  const contratos = (data || []).map((r: any) => {
    const im = r.imovel || {};
    return {
      id: r.id as number,
      status: r.status as string,
      aluguel: r.valor_atual_aluguel != null ? Number(r.valor_atual_aluguel) : null,
      inicio: r.data_inicio as string | null,
      uso: r.tipo_uso as string | null,
      locatario: r.locatario?.nome || "—",
      endereco: [[im.rua, im.numero].filter(Boolean).join(", ") + (im.complemento ? ` ${im.complemento}` : ""), im.bairro]
        .filter(Boolean)
        .join(" — "),
    };
  });
  return NextResponse.json({ contratos });
}
