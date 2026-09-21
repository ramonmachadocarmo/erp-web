// GS1 Brazil "prefixo 2" variable-weight barcode: 2 + SKU(6) + peso em gramas(5) + DV(1) = 13 dígitos.
// Mesma convenção usada por balanças etiquetadoras (Toledo, Filizola, Urano etc.), para que a
// leitura na separação continue funcionando quando a balança/impressora física for integrada.
const PREFIX = "2";
const MAX_GRAMS = 99999;

function ean13CheckDigit(twelve: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function encodeWeightBarcode(sku: string, weightKg: number): string {
  const skuDigits = String(sku).replace(/\D/g, "").padStart(6, "0").slice(-6);
  const grams = Math.min(MAX_GRAMS, Math.max(0, Math.round(weightKg * 1000)));
  const weightDigits = String(grams).padStart(5, "0");
  const body = `${PREFIX}${skuDigits}${weightDigits}`;
  return `${body}${ean13CheckDigit(body)}`;
}

export function decodeWeightBarcode(raw: string): { sku: string; weightKg: number } | null {
  const code = raw.trim();
  if (!new RegExp(`^${PREFIX}\\d{12}$`).test(code)) return null;
  const body = code.slice(0, 12);
  if (ean13CheckDigit(body) !== Number(code[12])) return null;
  return { sku: code.slice(1, 7), weightKg: Number(code.slice(7, 12)) / 1000 };
}
