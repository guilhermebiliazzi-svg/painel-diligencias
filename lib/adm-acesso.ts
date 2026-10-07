// Guarda das rotas de administração de contratos.
// O proxy libera /api/adm para qualquer usuário logado (inclusive corretores
// só com Postagens); estas rotas mexem em contrato/documentos, então exigem
// admin ou pode_cobrancas — o mesmo acesso da tela /contratos.
import { getSessaoPerfil } from "@/lib/perfil";

export async function acessoContratos(): Promise<{ ok: true; email: string } | { ok: false; status: number; error: string }> {
  try {
    const { email, perfil } = await getSessaoPerfil();
    if (!email) return { ok: false, status: 401, error: "Faça login." };
    if (!perfil || !perfil.ativo || !(perfil.is_admin || perfil.pode_cobrancas)) {
      return { ok: false, status: 403, error: "Sem acesso a contratos." };
    }
    return { ok: true, email };
  } catch {
    return { ok: false, status: 401, error: "Sessão inválida." };
  }
}
