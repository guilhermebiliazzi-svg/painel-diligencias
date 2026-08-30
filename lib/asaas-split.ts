/**
 * Soma dos splits de uma cobrança do Asaas.
 *
 * O campo vem como jsonb e, dependendo de quem gravou, pode chegar como array
 * ou como string JSON — por isso as duas formas são aceitas. Cada entrada usa
 * `fixedValue` (valor fixo) ou `totalValue` (o que o Asaas devolve confirmado).
 *
 * Serve para calcular a parte da Ville: total da cobrança menos os splits,
 * porque quem tem subconta recebe direto e emite a própria nota.
 */
export function somaSplits(split: any): number {
  let arr = split;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      return 0;
    }
  }
  if (!Array.isArray(arr)) return 0;
  const n = (v: any) => (v == null ? 0 : Number(v) || 0);
  return arr.reduce((a: number, s: any) => a + n(s?.fixedValue ?? s?.totalValue), 0);
}
