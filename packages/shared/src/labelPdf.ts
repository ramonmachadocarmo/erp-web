import type { CompanyHeaderInfo } from "./companyHeader";
import { MonoBitmap, rasterizeMonoLogo } from "./logo";

const WIDTHS: number[][] = [
  [2, 1, 2, 2, 2, 2], [2, 2, 2, 1, 2, 2], [2, 2, 2, 2, 2, 1], [1, 2, 1, 2, 2, 3], [1, 2, 1, 3, 2, 2],
  [1, 3, 1, 2, 2, 2], [1, 2, 2, 2, 1, 3], [1, 2, 2, 3, 1, 2], [1, 3, 2, 2, 1, 2], [2, 2, 1, 2, 1, 3],
  [2, 2, 1, 3, 1, 2], [2, 3, 1, 2, 1, 2], [1, 1, 2, 2, 3, 2], [1, 2, 2, 1, 3, 2], [1, 2, 2, 2, 3, 1],
  [1, 1, 3, 2, 2, 2], [1, 2, 3, 1, 2, 2], [1, 2, 3, 2, 2, 1], [2, 2, 3, 2, 1, 1], [2, 2, 1, 1, 3, 2],
  [2, 2, 1, 2, 3, 1], [2, 1, 3, 2, 1, 2], [2, 2, 3, 1, 1, 2], [3, 1, 2, 1, 3, 1], [3, 1, 1, 2, 2, 2],
  [3, 2, 1, 1, 2, 2], [3, 2, 1, 2, 2, 1], [3, 1, 2, 2, 1, 2], [3, 2, 2, 1, 1, 2], [3, 2, 2, 2, 1, 1],
  [2, 1, 2, 1, 2, 3], [2, 1, 2, 3, 2, 1], [2, 3, 2, 1, 2, 1], [1, 1, 1, 3, 2, 3], [1, 3, 1, 1, 2, 3],
  [1, 3, 1, 3, 2, 1], [1, 1, 2, 3, 1, 3], [1, 3, 2, 1, 1, 3], [1, 3, 2, 3, 1, 1], [2, 1, 1, 3, 1, 3],
  [2, 3, 1, 1, 1, 3], [2, 3, 1, 3, 1, 1], [1, 1, 2, 1, 3, 3], [1, 1, 2, 3, 3, 1], [1, 3, 2, 1, 3, 1],
  [1, 1, 3, 1, 2, 3], [1, 1, 3, 3, 2, 1], [1, 3, 3, 1, 2, 1], [3, 1, 3, 1, 2, 1], [2, 1, 1, 3, 3, 1],
  [2, 3, 1, 1, 3, 1], [2, 1, 3, 1, 1, 3], [2, 1, 3, 3, 1, 1], [2, 1, 3, 1, 3, 1], [3, 1, 1, 1, 2, 3],
  [3, 1, 1, 3, 2, 1], [3, 3, 1, 1, 2, 1], [3, 1, 2, 1, 1, 3], [3, 1, 2, 3, 1, 1], [3, 3, 2, 1, 1, 1],
  [3, 1, 4, 1, 1, 1], [2, 2, 1, 4, 1, 1], [4, 3, 1, 1, 1, 1], [1, 1, 1, 2, 2, 4], [1, 1, 1, 4, 2, 2],
  [1, 2, 1, 1, 2, 4], [1, 2, 1, 4, 2, 1], [1, 4, 1, 1, 2, 2], [1, 4, 1, 2, 2, 1], [1, 1, 2, 2, 1, 4],
  [1, 1, 2, 4, 1, 2], [1, 2, 2, 1, 1, 4], [1, 2, 2, 4, 1, 1], [1, 4, 2, 1, 1, 2], [1, 4, 2, 2, 1, 1],
  [2, 4, 1, 2, 1, 1], [2, 2, 1, 1, 1, 4], [4, 1, 3, 1, 1, 1], [2, 4, 1, 1, 1, 2], [1, 3, 4, 1, 1, 1],
  [1, 1, 1, 2, 4, 2], [1, 2, 1, 1, 4, 2], [1, 2, 1, 2, 4, 1], [1, 1, 4, 2, 1, 2], [1, 2, 4, 1, 1, 2],
  [1, 2, 4, 2, 1, 1], [4, 1, 1, 2, 1, 2], [4, 2, 1, 1, 1, 2], [4, 2, 1, 2, 1, 1], [2, 1, 2, 1, 4, 1],
  [2, 1, 4, 1, 2, 1], [4, 1, 2, 1, 2, 1], [1, 1, 1, 1, 4, 3], [1, 1, 1, 3, 4, 1], [1, 3, 1, 1, 4, 1],
  [1, 1, 4, 1, 1, 3], [1, 1, 4, 3, 1, 1], [4, 1, 1, 1, 1, 3], [4, 1, 1, 3, 1, 1], [1, 1, 3, 1, 4, 1],
  [1, 1, 4, 1, 3, 1], [3, 1, 1, 1, 4, 1], [4, 1, 1, 1, 3, 1], [2, 1, 1, 4, 1, 2], [2, 1, 1, 2, 1, 4],
  [2, 1, 1, 2, 3, 2],
];

const START_B = 104;
const STOP = [2, 3, 3, 1, 1, 1, 2];

export type LabelAddress = {
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export type Label = {
  orderNo: string;
  sepNo: string;
  customer: string;
  address: LabelAddress;
  volume: number;
  volumes: number;
};

// Splits an address into short physical lines instead of one long joined string, which used
// to get cut off (pdfStr's length cap) before ever reaching the zip — CEP now always gets
// its own line so it's never the part that's sacrificed.
function addressLines(a: LabelAddress): string[] {
  const lines: string[] = [];
  const streetLine = [a.street, a.number].filter(Boolean).join(", ");
  if (streetLine) lines.push(streetLine);
  const compDistrict = [a.complement, a.district].filter(Boolean).join(" - ");
  if (compDistrict) lines.push(compDistrict);
  const cityState = [a.city, a.state].filter(Boolean).join("/");
  if (cityState) lines.push(cityState);
  if (a.zip) lines.push(`CEP ${a.zip}`);
  return lines;
}

function ascii(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function pdfStr(s: string, maxLen = 72) {
  return ascii(s).slice(0, maxLen).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function patternBits(ws: number[]) {
  return ws.map((n, i) => (i % 2 === 0 ? "1" : "0").repeat(n)).join("");
}

function code128Bits(data: string) {
  const payload = ascii(data) || "0";
  const codes = [START_B];
  for (const ch of payload) {
    const v = ch.charCodeAt(0) - 32;
    codes.push(v < 0 || v > 94 ? 16 : v);
  }
  let sum = START_B;
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103);
  return `${codes.map((c) => patternBits(WIDTHS[c])).join("")}${patternBits(STOP)}`;
}

function barcodeOps(value: string, x: number, y: number, w: number, h: number) {
  const bits = code128Bits(value);
  const unit = w / bits.length;
  const ops: string[] = ["0 g"];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] !== "1") {
      i++;
      continue;
    }
    let j = i;
    while (bits[j] === "1") j++;
    ops.push(`${(x + i * unit).toFixed(2)} ${y.toFixed(2)} ${((j - i) * unit).toFixed(2)} ${h.toFixed(2)} re f`);
    i = j;
  }
  return ops.join("\n");
}

// Small footprint, top-left corner only — this label is 176x113pt (~62x40mm) and every
// other line of text is already packed tight; there's no room for a bigger mark.
const SHIP_LOGO_MAX_W = 16;
const SHIP_LOGO_MAX_H = 14;

function pageContent(label: Label, w: number, h: number, company: WeightLabelCompany | undefined) {
  const m = 8;
  const order = pdfStr(label.orderNo);
  const vol = pdfStr(`${label.volume}/${label.volumes}`);
  const sepLine = company?.name ? `Sep. ${label.sepNo} · ${company.name}` : `Sep. ${label.sepNo}`;
  const lines = addressLines(label.address).map((l) => pdfStr(l, 40));

  let titleX = m;
  const logo: string[] = [];
  if (company?.logo) {
    const scale = Math.min(SHIP_LOGO_MAX_W / company.logo.width, SHIP_LOGO_MAX_H / company.logo.height, 1);
    const boxW = company.logo.width * scale;
    const boxH = company.logo.height * scale;
    const y = h - 2 - boxH;
    logo.push(`q ${boxW.toFixed(2)} 0 0 ${boxH.toFixed(2)} ${m.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q`);
    titleX = m + boxW + 3;
  }

  const addressOps = lines.map((l, i) => `BT /F1 6 Tf ${m} ${(h - 41 - i * 7).toFixed(1)} Td (${l}) Tj ET`);

  return [
    ...logo,
    `BT /F1 8 Tf ${titleX.toFixed(1)} ${(h - 12).toFixed(1)} Td (Pedido ${order}) Tj ET`,
    `BT /F1 10 Tf ${(w - m - vol.length * 5.6).toFixed(1)} ${(h - 13).toFixed(1)} Td (${vol}) Tj ET`,
    `BT /F1 7 Tf ${m} ${(h - 22).toFixed(1)} Td (${pdfStr(sepLine, 40)}) Tj ET`,
    `BT /F1 8 Tf ${m} ${(h - 32).toFixed(1)} Td (${pdfStr(label.customer)}) Tj ET`,
    ...addressOps,
    barcodeOps(label.orderNo, m, 16, w - m * 2, 22),
    `BT /F1 7 Tf ${((w - order.length * 4) / 2).toFixed(1)} 8 Td (${order}) Tj ET`,
  ].join("\n");
}

export function buildLabelPdf(labels: Label[], company?: WeightLabelCompany) {
  const w = 176.0;
  const h = 113.4;
  const pages = labels.length
    ? labels
    : [{ orderNo: "0", sepNo: "-", customer: "", address: {}, volume: 1, volumes: 1 }];
  const objs: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "", // placeholder — filled in once page object numbers are known below
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let imageObjNum: number | null = null;
  if (company?.logo) {
    imageObjNum = objs.length + 1;
    objs.push(monoImageXObject(company.logo));
  }
  const firstPageObjNum = objs.length + 1;
  const resources = imageObjNum
    ? `/Resources << /Font << /F1 3 0 R >> /XObject << /Im1 ${imageObjNum} 0 R >> >>`
    : "/Resources << /Font << /F1 3 0 R >> >>";
  for (let i = 0; i < pages.length; i++) {
    const content = pageContent(pages[i], w, h, company) + "\n";
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ${resources} /Contents ${firstPageObjNum + 1 + i * 2} 0 R >>`,
    );
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
  }
  objs[1] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${firstPageObjNum + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  return assemblePdf(objs);
}

export function openLabelPdf(labels: Label[], filename: string, tab?: Window | null, company?: WeightLabelCompany) {
  openPdf(buildLabelPdf(labels, company), filename, tab);
}

// Convenience for callers holding a plain CompanyHeaderInfo (logo as a JPEG data URL, not yet
// rasterized) — mirrors printWeightLabelPdf's same two-step "rasterize, then build" split.
export async function openLabelPdfForCompany(labels: Label[], filename: string, tab: Window | null | undefined, company?: CompanyHeaderInfo) {
  const logo = company?.logo
    ? await rasterizeMonoLogo(company.logo, SHIP_LOGO_MAX_W * 3, SHIP_LOGO_MAX_H * 3).catch(() => undefined)
    : undefined;
  openLabelPdf(labels, filename, tab, { name: company?.name, logo });
}

export type WeightLabel = {
  sku: string;
  name: string;
  weightKg: number;
  unitPrice: number;
  barcode: string;
  printedAt: string;
};

export type WeightLabelCompany = { name?: string; logo?: MonoBitmap };
export type WeightLabelOptions = { withPrice?: boolean };

function money(n: number) {
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

// Logo drawn top-right, capped to this box (pt) so it never collides with the company-name
// text (top-left) or the product-name line just below — there's very little vertical room
// to spare on an 85pt-tall label.
const LOGO_MAX_W = 34;
const LOGO_MAX_H = 18;

function monoImageXObject(bmp: MonoBitmap) {
  let hex = "";
  for (let i = 0; i < bmp.bits.length; i++) hex += bmp.bits[i].toString(16).padStart(2, "0");
  const stream = `${hex}>`;
  return `<< /Type /XObject /Subtype /Image /Width ${bmp.width} /Height ${bmp.height} /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /ASCIIHexDecode /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
}

// Places the bitmap's unit square via the `cm` matrix — PDF images have no intrinsic
// point size, they're always drawn into whatever box the content stream scales them to.
function logoDrawOp(bmp: MonoBitmap, w: number, h: number) {
  const scale = Math.min(LOGO_MAX_W / bmp.width, LOGO_MAX_H / bmp.height, 1);
  const boxW = bmp.width * scale;
  const boxH = bmp.height * scale;
  const x = w - 4 - boxW;
  const y = h - 2 - boxH;
  return `q ${boxW.toFixed(2)} 0 0 ${boxH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q`;
}

// Etiqueta 50x30mm (rolo de coluna única da balança) — 1mm = 2.83464567pt.
function weightPageContent(label: WeightLabel, w: number, h: number, company: WeightLabelCompany | undefined, withPrice: boolean) {
  const m = 4;
  const nameLine = pdfStr(`${label.sku} ${label.name}`, 32);
  const priceLine = withPrice
    ? pdfStr(`${label.weightKg.toFixed(3)}kg x ${money(label.unitPrice)}/kg`, 34)
    : pdfStr(`${label.weightKg.toFixed(3)} kg`, 34);
  const barcode = pdfStr(label.barcode);
  const printedAt = pdfStr(label.printedAt, 24);
  const companyLine = company?.name ? [`BT /F1 5 Tf ${m} ${(h - 7).toFixed(1)} Td (${pdfStr(company.name, 40)}) Tj ET`] : [];
  const logo = company?.logo ? [logoDrawOp(company.logo, w, h)] : [];
  const totalLine = withPrice ? [`BT /F1 10 Tf ${m} ${(h - 41).toFixed(1)} Td (Total: ${money(label.weightKg * label.unitPrice)}) Tj ET`] : [];
  return [
    ...logo,
    ...companyLine,
    `BT /F1 8 Tf ${m} ${(h - 22).toFixed(1)} Td (${nameLine}) Tj ET`,
    `BT /F1 7.5 Tf ${m} ${(h - 30).toFixed(1)} Td (${priceLine}) Tj ET`,
    ...totalLine,
    `BT /F1 5.5 Tf ${Math.max(m, w - m - printedAt.length * 3).toFixed(1)} ${(h - 41).toFixed(1)} Td (${printedAt}) Tj ET`,
    `BT /F1 6 Tf ${((w - barcode.length * 3.1) / 2).toFixed(1)} 26 Td (${barcode}) Tj ET`,
    barcodeOps(label.barcode, m, 6, w - m * 2, 16),
  ].join("\n");
}

export function buildWeightLabelPdf(labels: WeightLabel[], company?: WeightLabelCompany, opts?: WeightLabelOptions) {
  const w = 141.7;
  const h = 85.0;
  const withPrice = opts?.withPrice ?? true;
  const pages = labels.length
    ? labels
    : [{ sku: "000000", name: "", weightKg: 0, unitPrice: 0, barcode: "0", printedAt: "" }];
  const objs: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "", // placeholder — filled in once page object numbers are known below
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let imageObjNum: number | null = null;
  if (company?.logo) {
    imageObjNum = objs.length + 1;
    objs.push(monoImageXObject(company.logo));
  }
  const firstPageObjNum = objs.length + 1;
  const resources = imageObjNum
    ? `/Resources << /Font << /F1 3 0 R >> /XObject << /Im1 ${imageObjNum} 0 R >> >>`
    : "/Resources << /Font << /F1 3 0 R >> >>";
  for (let i = 0; i < pages.length; i++) {
    const content = weightPageContent(pages[i], w, h, company, withPrice) + "\n";
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ${resources} /Contents ${firstPageObjNum + 1 + i * 2} 0 R >>`,
    );
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
  }
  objs[1] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${firstPageObjNum + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  return assemblePdf(objs);
}

export function openWeightLabelPdf(labels: WeightLabel[], filename: string, tab?: Window | null, company?: WeightLabelCompany, opts?: WeightLabelOptions) {
  openPdf(buildWeightLabelPdf(labels, company, opts), filename, tab);
}

// Endpoint of the tiny local print-helper (see infra/print-helper/ on the Pi) that pipes the
// PDF bytes straight to `lp -d HZD950 -o orientation-requested=3 -o media=Custom.50x30mm -`.
// We go through it instead of window.print() because Chrome's own print pipeline (a) hides the
// orientation control entirely for PDF sources and (b) silently attaches its own orientation
// guess to the CUPS job for this landscape-shaped page — and ANY non-default orientation on the
// HZD950/TSPL queue makes it consume 2 physical labels per job, regardless of which layer
// requested the rotation (Chrome, `-o orientation-requested=`, or a PDF /Rotate entry all
// reproduce it). `lp` with no rotation flag is the one path that's been reliable in testing, so
// the helper is what actually talks to CUPS now; the browser never gets a chance to touch it.
const PRINT_HELPER_URL = "http://127.0.0.1:9123/print";

// Impressão direta (sem abrir aba) para a etiqueta de peso na estação de pesagem: manda o PDF
// pro print-helper local, que imprime via `lp` com as opções fixas (sem diálogo, sem o Chrome
// decidindo orientação sozinho). Se o helper não estiver rodando (ainda não configurado nessa
// estação, ou caiu), cai de volta pro iframe+print() antigo — pior experiência (abre diálogo,
// pode sair errado), mas não trava a impressão.
export async function printWeightLabelPdf(labels: WeightLabel[], company?: CompanyHeaderInfo, opts?: WeightLabelOptions) {
  // Supersampled a bit above the box the logo is actually drawn into (LOGO_MAX_W/H) so the
  // 1-bit threshold below still has enough source pixels to look clean at print size.
  const logo = company?.logo
    ? await rasterizeMonoLogo(company.logo, LOGO_MAX_W * 3, LOGO_MAX_H * 3).catch(() => undefined)
    : undefined;
  const bytes = buildWeightLabelPdf(labels, { name: company?.name, logo }, opts);
  const sentToHelper = await printViaHelper(bytes).catch(() => false);
  if (!sentToHelper) printPdfSilently(bytes);
}

async function printViaHelper(bytes: Uint8Array): Promise<boolean> {
  try {
    const res = await fetch(PRINT_HELPER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: bytes,
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false; // helper not running / not reachable on this station — fall back below
  }
}

function printPdfSilently(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };
  iframe.src = url;
  document.body.appendChild(iframe);
  setTimeout(() => {
    iframe.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

function assemblePdf(objs: string[]) {
  let body = "%PDF-1.4\n";
  const xref = [0];
  objs.forEach((obj, i) => {
    xref.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const start = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  xref.slice(1).forEach((off) => {
    body += `${String(off).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new TextEncoder().encode(body);
}

function openPdf(bytes: Uint8Array, filename: string, tab?: Window | null) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  if (tab && !tab.closed) {
    tab.location.replace(url);
  } else {
    const w = window.open(url, "_blank");
    if (!w) {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
