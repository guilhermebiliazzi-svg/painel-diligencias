// app/admin/botoes.ts
// Estilo único dos botões da barra de ações da diligência: mesma altura, texto numa
// linha só, borda suave e cor só para indicar o tipo de ação.

export const BTN =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[13px] font-medium leading-none shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';

export const TOM = {
  neutro: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-300',
  azul: 'border-sky-200 bg-white text-sky-700 hover:bg-sky-50 focus-visible:ring-sky-300',
  verde: 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-300',
  violeta: 'border-violet-200 bg-white text-violet-700 hover:bg-violet-50 focus-visible:ring-violet-300',
  vermelho: 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50 focus-visible:ring-rose-300',
  cheio: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-300',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  erro: 'border-rose-300 bg-rose-50 text-rose-700',
  inativo: 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 shadow-none',
} as const;

export const btn = (tom: keyof typeof TOM) => `${BTN} ${TOM[tom]}`;
