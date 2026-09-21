import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { CompanyHeaderInfo, drawCompanyHeader } from "@erp/shared";

export type Column = { key: string; label: string };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// CSV/XLSX take raw row values (numbers stay numbers) so the file is usable
// for further spreadsheet math, not just for reading.
export function exportCsv(filename: string, columns: Column[], rows: Record<string, any>[]) {
  const esc = (v: any) => `"${(v == null ? "" : String(v)).replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => esc(c.label)).join(";")];
  for (const row of rows) lines.push(columns.map((c) => esc(row[c.key])).join(";"));
  const bom = "﻿";
  downloadBlob(new Blob([bom + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" }), filename);
}

export function exportXlsx(filename: string, columns: Column[], rows: Record<string, any>[]) {
  const data = rows.map((row) => {
    const out: Record<string, any> = {};
    for (const c of columns) out[c.label] = row[c.key] ?? "";
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.label) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Relatório");
  XLSX.writeFile(wb, filename);
}

// PDF takes already-formatted display strings (currency/qty formatting etc)
// since it's meant to be read on paper, not recomputed.
export function exportPdf(filename: string, title: string, columns: Column[], rows: Record<string, any>[], company?: CompanyHeaderInfo) {
  const doc = new jsPDF({ orientation: "landscape" });
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = drawCompanyHeader(doc, company, 8, margin, pageWidth);
  doc.setFontSize(12);
  doc.text(title, margin, y + 4);
  doc.setFontSize(8);
  doc.text(new Date().toLocaleString("pt-BR"), margin, y + 9);
  autoTable(doc, {
    startY: y + 13,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => (row[c.key] == null ? "" : String(row[c.key])))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [40, 60, 90] },
  });
  doc.save(filename);
}

export type KitPdfItem = { product_sku: string; product_name: string; role: string; quantity: string; unit_cost: string; line_cost: string; proportional_sale_price: string };
export type KitPdfRow = { code: string; name: string; cost: string; suggested_price: string; margin_percent: string; items: KitPdfItem[] };

// One item sub-table per kit (header row: código/nome/custo/preço/margem, then
// its own items table with a totals row appended) instead of one flat row per
// kit with every item crammed into a single cell.
export function exportKitsPdf(filename: string, title: string, kits: KitPdfRow[], company?: CompanyHeaderInfo) {
  const doc = new jsPDF({ orientation: "landscape" });
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const itemCols = ["Produto", "Papel", "Qtd", "Custo unit.", "Custo", "Preço venda (prop.)"];
  const headerY = drawCompanyHeader(doc, company, 8, margin, pageWidth);
  doc.setFontSize(12);
  doc.text(title, margin, headerY + 4);
  doc.setFontSize(8);
  doc.text(new Date().toLocaleString("pt-BR"), margin, headerY + 9);
  let y = headerY + 15;
  const pageHeight = doc.internal.pageSize.getHeight();
  for (const kit of kits) {
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 15;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`${kit.code} — ${kit.name}`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Custo: ${kit.cost}    Preço sugerido: ${kit.suggested_price}    Margem: ${kit.margin_percent}`, 14, y + 5);
    autoTable(doc, {
      startY: y + 8,
      head: [itemCols],
      body: kit.items.map((it) => [it.product_name, it.role, it.quantity, it.unit_cost, it.line_cost, it.proportional_sale_price]),
      foot: [["Total", "", "", "", kit.cost, kit.suggested_price]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [40, 60, 90] },
      footStyles: { fillColor: [30, 42, 58], fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }
  doc.save(filename);
}
