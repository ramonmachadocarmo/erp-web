import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { CompanyHeaderInfo, drawCompanyHeader } from "./companyHeader";

export type PurchaseDocItem = { code: string; description: string; qty: string; unitPrice: string; total: string };

export type PurchaseDocColumnKey = keyof PurchaseDocItem;

export const PURCHASE_DOC_COLUMNS: { key: PurchaseDocColumnKey; label: string }[] = [
  { key: "code", label: "Código" },
  { key: "description", label: "Descrição" },
  { key: "qty", label: "Qtd" },
  { key: "unitPrice", label: "Preço unit." },
  { key: "total", label: "Total" },
];

export type PurchaseDoc = {
  title: string;
  headerLines: string[];
  items: PurchaseDocItem[];
  totalLabel: string;
  company?: CompanyHeaderInfo;
  // Which item columns to print, and in what order — defaults to all of them
  // (PURCHASE_DOC_COLUMNS). Lets a caller offer a "hide column" picker before
  // printing without needing its own PDF table-building logic.
  columns?: PurchaseDocColumnKey[];
};

export function buildPurchaseDocPdf(doc: PurchaseDoc) {
  const pdf = new jsPDF();
  const margin = 14;
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = drawCompanyHeader(pdf, doc.company, 10, margin, pageWidth);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(doc.title, margin, y + 6);
  y += 12;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  for (const line of doc.headerLines) {
    pdf.text(line, margin, y);
    y += 5;
  }
  const columns = doc.columns?.length
    ? doc.columns.map((key) => PURCHASE_DOC_COLUMNS.find((c) => c.key === key)).filter((c): c is typeof PURCHASE_DOC_COLUMNS[number] => !!c)
    : PURCHASE_DOC_COLUMNS;
  autoTable(pdf, {
    startY: y + 3,
    head: [columns.map((c) => c.label)],
    body: doc.items.map((it) => columns.map((c) => it[c.key])),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [40, 60, 90] },
    margin: { left: margin, right: margin, top: 20 },
  });
  const finalY = (pdf as any).lastAutoTable.finalY as number;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(doc.totalLabel, pageWidth - margin, finalY + 10, { align: "right" });
  return pdf;
}

export function openPurchaseDocPdf(doc: PurchaseDoc, filename: string) {
  const pdf = buildPurchaseDocPdf(doc);
  const url = URL.createObjectURL(pdf.output("blob"));
  const w = window.open(url, "_blank");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
