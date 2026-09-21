import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { CompanyHeaderInfo, drawCompanyHeader } from "./companyHeader";

export type RoutePdfStop = { seq: number; customer: string; address: string; leg: string };

export type RoutePdf = {
  title: string;
  vehicle: string;
  center: string;
  status: string;
  totals: string;
  stops: RoutePdfStop[];
  company?: CompanyHeaderInfo;
};

export function buildRoutePdf(doc: RoutePdf) {
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
  for (const line of [doc.vehicle, doc.center, `${doc.status} · ${doc.totals}`]) {
    if (!line) continue;
    pdf.text(line, margin, y);
    y += 5;
  }
  autoTable(pdf, {
    startY: y + 3,
    head: [["#", "Cliente / endereço", "Trecho"]],
    body: doc.stops.map((s) => [String(s.seq), `${s.customer} — ${s.address}`, s.leg]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [40, 60, 90] },
    margin: { left: margin, right: margin, top: 20 },
  });
  return pdf;
}

export function openRoutePdf(doc: RoutePdf, filename: string) {
  const pdf = buildRoutePdf(doc);
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
