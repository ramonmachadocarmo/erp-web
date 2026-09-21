import { jsPDF } from "jspdf";

export type CompanyHeaderInfo = {
  name?: string;
  document?: string;
  addressLine?: string;
  phone?: string;
  email?: string;
  logo?: string;
  logoWidth?: number;
  logoHeight?: number;
};

function addressLine(c: any) {
  return [
    c.street && `${c.street}${c.number ? `, ${c.number}` : ""}`,
    c.complement,
    c.district,
    c.city && `${c.city}${c.state ? `/${c.state}` : ""}`,
    c.zip,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function companyHeaderInfo(c: any): CompanyHeaderInfo | undefined {
  if (!c || (!c.name && !c.logo)) return undefined;
  return {
    name: c.name || "",
    document: c.document || "",
    addressLine: addressLine(c),
    phone: c.phone || "",
    email: c.email || "",
    logo: c.logo || "",
    logoWidth: c.logo_width || 0,
    logoHeight: c.logo_height || 0,
  };
}

const LOGO_BOX = 28; // pt — default square bounding box; square and rectangular logos are both scaled to fit inside it, preserving aspect ratio.

// Draws the company logo/name/document/address/contact block at the top of the
// current page and returns the y position where the document's own content can
// start. Returns startY unchanged if there is nothing to draw.
export function drawCompanyHeader(doc: jsPDF, company: CompanyHeaderInfo | undefined, startY: number, marginLeft: number, pageWidth: number): number {
  if (!company || (!company.name && !company.logo)) return startY;
  let textX = marginLeft;
  let logoBottom = startY;
  if (company.logo && company.logoWidth && company.logoHeight) {
    const scale = Math.min(LOGO_BOX / company.logoWidth, LOGO_BOX / company.logoHeight);
    const w = company.logoWidth * scale;
    const h = company.logoHeight * scale;
    try {
      doc.addImage(company.logo, "JPEG", marginLeft, startY, w, h);
      textX = marginLeft + w + 8;
      logoBottom = startY + h;
    } catch {
      /* malformed image data, skip it */
    }
  }
  let y = startY + 8;
  if (company.name) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(company.name, textX, y);
    y += 5;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (company.document) {
    doc.text(`CNPJ: ${company.document}`, textX, y);
    y += 4;
  }
  if (company.addressLine) {
    doc.text(company.addressLine, textX, y);
    y += 4;
  }
  const contact = [company.phone, company.email].filter(Boolean).join(" · ");
  if (contact) {
    doc.text(contact, textX, y);
    y += 4;
  }
  const bottom = Math.max(y, logoBottom);
  doc.setDrawColor(180);
  doc.line(marginLeft, bottom + 2, pageWidth - marginLeft, bottom + 2);
  doc.setDrawColor(0);
  return bottom + 8;
}
