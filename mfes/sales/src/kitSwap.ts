// Regra de troca de item numa cesta/kit: o cliente tira um item da receita e leva outro no
// lugar, sem alterar o preço da cesta. O substituto entra na quantidade de mesmo valor de
// venda (arredondada ao passo da unidade de medida) e o valor do item nunca pode passar do
// valor do item original em mais de MAX_PREMIUM.

/** Acréscimo máximo, sobre o valor do item removido, que a troca pode custar à loja. */
export const MAX_PREMIUM = 0.15;

const FRACTIONAL_UOMS = new Set(["KG", "L", "LT", "M", "MT"]);

/** Menor fração vendável: 0,1 para unidades de peso/volume/comprimento; inteiros para o resto (UN, CX...). */
export function qtyStep(uom?: string) {
  return FRACTIONAL_UOMS.has((uom || "").trim().toUpperCase()) ? 0.1 : 1;
}

function round(n: number) {
  return Number(n.toFixed(4));
}

export type Equivalence = { ok: true; quantity: number } | { ok: false; reason: string };

/**
 * Quantidade do substituto para repor `target` (valor do item removido) ao preço unitário `price`.
 * Prefere arredondar para baixo (o cliente nunca leva mais que o valor removido), desde que isso
 * não perca mais que MAX_PREMIUM do valor; senão sobe um passo, desde que não exceda MAX_PREMIUM.
 * Ex.: R$ 12 de banana -> tangerina a R$ 22/kg = 0,5 kg; laranja a R$ 14/kg = 0,8 kg;
 * um item vendido por unidade a R$ 14 = 1 un = +16,7% -> recusado.
 */
export function equivalentQuantity(target: number, price: number, step: number): Equivalence {
  if (!(target > 0)) return { ok: false, reason: "O item original não tem preço de venda, então não há valor equivalente para calcular." };
  if (!(price > 0)) return { ok: false, reason: "O item escolhido não tem preço de venda cadastrado." };
  const raw = target / price / step;
  const down = round(Math.floor(raw + 1e-9) * step);
  const up = round(Math.ceil(raw - 1e-9) * step);
  if (down >= step && down * price >= target * (1 - MAX_PREMIUM)) return { ok: true, quantity: down };
  if (up >= step && up * price <= target * (1 + MAX_PREMIUM)) return { ok: true, quantity: up };
  const min = round(step * price);
  return {
    ok: false,
    reason: `A menor quantidade vendável (${step}) custa ${min.toFixed(2)}, mais de ${Math.round(MAX_PREMIUM * 100)}% acima do item trocado (${target.toFixed(2)}).`,
  };
}

/** Uma quantidade digitada à mão também respeita o teto de valor do item original. */
export function withinPremium(quantity: number, price: number, base: number) {
  if (!(base > 0) || !(price > 0)) return true;
  return quantity * price <= base * (1 + MAX_PREMIUM) + 1e-9;
}
