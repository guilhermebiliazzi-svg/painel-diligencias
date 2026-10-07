// Bancos mais usados (ISPB = identificador que o Inter exige no Pix por dados bancários).
// "Outro" na tela permite digitar o ISPB de um banco fora da lista.
export const BANCOS: { ispb: string; codigo: string; nome: string }[] = [
  { ispb: "00000000", codigo: "001", nome: "Banco do Brasil" },
  { ispb: "00360305", codigo: "104", nome: "Caixa Econômica Federal" },
  { ispb: "60701190", codigo: "341", nome: "Itaú Unibanco" },
  { ispb: "60746948", codigo: "237", nome: "Bradesco" },
  { ispb: "90400888", codigo: "033", nome: "Santander" },
  { ispb: "18236120", codigo: "260", nome: "Nubank" },
  { ispb: "00416968", codigo: "077", nome: "Banco Inter" },
  { ispb: "30306294", codigo: "208", nome: "BTG Pactual" },
  { ispb: "58160789", codigo: "422", nome: "Safra" },
  { ispb: "92702067", codigo: "041", nome: "Banrisul" },
  { ispb: "01181521", codigo: "748", nome: "Sicredi" },
  { ispb: "02038232", codigo: "756", nome: "Sicoob" },
  { ispb: "10573521", codigo: "323", nome: "Mercado Pago" },
  { ispb: "22896431", codigo: "380", nome: "PicPay" },
  { ispb: "08561701", codigo: "290", nome: "PagBank (PagSeguro)" },
  { ispb: "59588111", codigo: "655", nome: "Banco Votorantim (BV)" },
  { ispb: "62232889", codigo: "707", nome: "Daycoval" },
  { ispb: "07237373", codigo: "004", nome: "Banco do Nordeste" },
];

export function nomeBanco(ispb: string | null | undefined): string {
  if (!ispb) return "—";
  const b = BANCOS.find((x) => x.ispb === ispb);
  return b ? `${b.codigo} · ${b.nome}` : `ISPB ${ispb}`;
}

export const TIPOS_CONTA = [
  { v: "CONTA_CORRENTE", t: "Conta corrente" },
  { v: "CONTA_POUPANCA", t: "Poupança" },
] as const;

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// valida e normaliza os dados da conta (servidor e tela); devolve erro legível
export function normalizarConta(
  b: any
): { ok: true; dados: { titular: string; cpf_cnpj: string; banco_ispb: string; agencia: string; conta: string; tipo_conta: string } } | { ok: false; error: string } {
  const titular = String(b?.titular ?? "").trim().slice(0, 150);
  const cpf = dig(b?.cpf_cnpj);
  const ispb = dig(b?.banco_ispb);
  const agencia = dig(b?.agencia);
  const conta = dig(b?.conta);
  const tipo = b?.tipo_conta === "CONTA_POUPANCA" ? "CONTA_POUPANCA" : "CONTA_CORRENTE";
  const falta: string[] = [];
  if (!titular) falta.push("titular");
  if (cpf.length !== 11 && cpf.length !== 14) falta.push("CPF/CNPJ do titular");
  if (ispb.length !== 8) falta.push("banco");
  if (!agencia) falta.push("agência");
  if (conta.length < 2) falta.push("conta com dígito");
  if (falta.length) return { ok: false, error: `Dados bancários incompletos: ${falta.join(", ")}.` };
  return { ok: true, dados: { titular, cpf_cnpj: cpf, banco_ispb: ispb, agencia, conta, tipo_conta: tipo } };
}
