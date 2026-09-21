const MAX_DIMENSION = 360;

export type MonoBitmap = { width: number; height: number; bits: Uint8Array };

// Rasterizes a company logo (a JPEG data URL, as stored by readLogoFile above) down to a
// small 1-bit black & white bitmap: row-major, MSB-first, each row padded to a whole byte —
// the shape labelPdf.ts's hand-built PDF image XObject expects, since that writer has no
// JPEG/color decoding of its own, only room to draw already-decoded pixels. maxWidthPx/
// maxHeightPx bound the box the logo must fit inside, aspect ratio preserved.
export function rasterizeMonoLogo(dataUrl: string, maxWidthPx: number, maxHeightPx: number): Promise<MonoBitmap> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Falha ao carregar logo"));
    img.onload = () => {
      const scale = Math.min(1, maxWidthPx / img.width, maxHeightPx / img.height);
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas indisponível"));
        return;
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);
      const rowBytes = Math.ceil(width / 8);
      const bits = new Uint8Array(rowBytes * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          // DeviceGray/1bpp: bit 0 = black (the unset default), bit 1 = white — only pixels
          // above the threshold need their bit set.
          if (luminance >= 150) {
            bits[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
          }
        }
      }
      resolve({ width, height, bits });
    };
    img.src = dataUrl;
  });
}

export function readLogoFile(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler arquivo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo não é uma imagem válida"));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponível"));
          return;
        }
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.85), width, height });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
