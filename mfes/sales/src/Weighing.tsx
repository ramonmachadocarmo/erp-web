import { useEffect, useRef, useState } from "react";
import { Autocomplete, CompanyHeaderInfo, encodeWeightBarcode, printWeightLabelPdf } from "@erp/shared";
import { formatDateTime } from "./helpers";

type Product = { id: string; sku: string; name: string; sale_uom?: string; sale_price?: number; kind?: string };

// Minimal Web Serial typings (not part of TS's DOM lib) — only the surface used below.
interface SerialPortLike {
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: "none" | "even" | "odd" }): Promise<void>;
  close(): Promise<void>;
  setSignals(signals: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}
declare global {
  interface Navigator {
    serial?: { requestPort(): Promise<SerialPortLike> };
  }
}

export const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400];
const POLL_BYTE = new Uint8Array([0x05]); // ENQ — solicita leitura de peso
const POLL_INTERVAL_MS = 400;

// A maioria das balanças de balcão (Toledo/Filizola/Urano e afins) não transmite sozinha: ficam
// caladas até receber um "ENQ" (byte 0x05) do host, respondendo então com um quadro contendo o peso.
// Por isso o host precisa perguntar (ver POLL_BYTE/POLL_INTERVAL_MS abaixo). O quadro da Urano
// POP-S, por exemplo, não usa CRLF como separador — é delimitado por bytes de controle (STX/ETX e
// afins) e traz várias grandezas (tara, preço, total); por isso extraímos especificamente o campo
// "PESO L: <n>kg" quando presente, caindo para "primeiro número da linha" nos formatos mais simples
// (ex.: Toledo/Filizola no padrão "ST,GS,+00012.345kg").
function parseWeightLine(line: string): number | null {
  const peso = line.match(/PESO\s*L\s*:?\s*(-?\d+(?:[.,]\d+)?)\s*kg/i);
  if (peso) {
    const n = Number(peso[1].replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const m = line.match(/([+-]?\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Ponto único onde a leitura do peso é obtida. Hoje é digitação manual; quando a balança física
// for integrada (serial/USB), basta trocar a origem deste valor — o resto do fluxo não muda.
function useWeightReading() {
  const [weightKg, setWeightKg] = useState("");
  return { weightKg, setWeightKg };
}

export function useScaleSerial(onReading: (kg: number) => void) {
  // Web Serial only exists on `navigator` inside a secure context (HTTPS, or the browser's own
  // localhost/127.0.0.1) — Chromium strips the API entirely otherwise, indistinguishable from
  // "this browser doesn't support it" unless we check isSecureContext ourselves. This matters
  // here specifically because the PDV/weighing station is commonly a separate device reached by
  // the host's LAN IP (see shell/vite.config.ts's DEV_HOST), which is plain HTTP and therefore
  // insecure even though the browser is a fully Web-Serial-capable Chrome/Edge/Chromium.
  const secureContext = typeof window !== "undefined" && window.isSecureContext;
  const hasSerialApi = typeof navigator !== "undefined" && !!navigator.serial;
  const supported = secureContext && hasSerialApi;
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastLine, setLastLine] = useState("");
  const portRef = useRef<SerialPortLike | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const pollRef = useRef<number | null>(null);
  const stopRef = useRef(false);

  async function disconnect() {
    stopRef.current = true;
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    try {
      await readerRef.current?.cancel();
    } catch {
      /* already closed */
    }
    readerRef.current = null;
    try {
      writerRef.current?.releaseLock();
    } catch {
      /* already released */
    }
    writerRef.current = null;
    try {
      await portRef.current?.close();
    } catch {
      /* already closed */
    }
    portRef.current = null;
    setConnected(false);
  }

  async function connect(baudRate: number) {
    if (!supported || !navigator.serial) {
      setError("Navegador sem suporte a Web Serial (use Chrome ou Edge).");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const port = await navigator.serial.requestPort();
      // 8 bits, sem paridade, 2 stop bits: parâmetros de fábrica da Urano POP-S (e comuns a outras
      // balanças de balcão nacionais).
      await port.open({ baudRate, dataBits: 8, stopBits: 2, parity: "none" });
      try {
        // Muitos adaptadores USB-serial de balança usam DTR/RTS para habilitar a transmissão;
        // sem isso o adaptador abre normalmente mas nunca envia dado nenhum.
        await port.setSignals({ dataTerminalReady: true, requestToSend: true });
      } catch {
        /* nem todo adaptador suporta — ignora */
      }
      portRef.current = port;
      stopRef.current = false;
      setConnected(true);
      const stream = port.readable?.pipeThrough(new TextDecoderStream());
      const reader = stream?.getReader();
      if (!reader) throw new Error("Porta serial sem canal de leitura");
      readerRef.current = reader;
      if (port.writable) {
        const writer = port.writable.getWriter();
        writerRef.current = writer;
        pollRef.current = window.setInterval(() => {
          writer.write(POLL_BYTE).catch(() => {
            /* balança pode ignorar polls enquanto processa a resposta anterior */
          });
        }, POLL_INTERVAL_MS);
      }
      let buffer = "";
      (async () => {
        try {
          while (!stopRef.current) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;
            buffer += value;
            // Quebra tanto em CRLF (Toledo/Filizola) quanto em runs de bytes de controle
            // (STX/ETX e afins, como no quadro da Urano POP-S, que não usa CRLF).
            const lines = buffer.split(/[\x00-\x1f]+/);
            buffer = lines.pop() || "";
            for (const raw of lines) {
              const line = raw.trim();
              if (!line) continue;
              setLastLine(line);
              const kg = parseWeightLine(line);
              if (kg != null) onReading(kg);
            }
          }
        } catch (err: any) {
          if (!stopRef.current) setError(err.message || "Erro na leitura da balança");
        }
      })();
    } catch (err: any) {
      setError(err.message || "Falha ao conectar com a balança");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { supported, insecureContext: !secureContext, connected, busy, error, lastLine, connect, disconnect };
}

export function Weighing({ products, company }: { products: Product[]; company?: CompanyHeaderInfo }) {
  const weighable = products.filter((p) => p.kind !== "FIXED_ASSET" && p.sale_uom === "KG");
  const [productId, setProductId] = useState("");
  const { weightKg, setWeightKg } = useWeightReading();
  const [baudRate, setBaudRate] = useState(9600);
  const [lastPrinted, setLastPrinted] = useState<{ sku: string; weightKg: number; barcode: string } | null>(null);
  const productRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);
  const scale = useScaleSerial((kg) => setWeightKg(kg.toFixed(3)));

  useEffect(() => {
    productRef.current?.focus();
  }, []);

  useEffect(() => {
    if (productId) weightRef.current?.focus();
  }, [productId]);

  const product = weighable.find((p) => p.id === productId) || null;
  const unitPrice = Number(product?.sale_price || 0);
  const weight = Number(weightKg.replace(",", "."));
  const validWeight = Number.isFinite(weight) && weight > 0;
  const total = validWeight ? weight * unitPrice : 0;

  function print(withPrice: boolean) {
    if (!product || !validWeight) return;
    const barcode = encodeWeightBarcode(product.sku, weight);
    const printedAt = formatDateTime(new Date());
    printWeightLabelPdf(
      [{ sku: product.sku, name: product.name, weightKg: weight, unitPrice, barcode, printedAt }],
      company,
      { withPrice },
    );
    setLastPrinted({ sku: product.sku, weightKg: weight, barcode });
    setWeightKg("");
    setProductId("");
    productRef.current?.focus();
  }

  return (
    <div className="card">
      <p className="muted">Selecione o produto, informe o peso lido na balança e imprima a etiqueta com o código de barras (peso embutido) a ser bipado na separação.</p>
      <div className="row" style={{ marginTop: 12, alignItems: "flex-end" }}>
        {scale.supported ? (
          <>
            {!scale.connected && (
              <div className="field field-narrow">
                <label>Baud rate</label>
                <select value={baudRate} onChange={(e) => setBaudRate(Number(e.target.value))}>
                  {BAUD_RATES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              className="secondary"
              disabled={scale.busy}
              onClick={() => (scale.connected ? scale.disconnect() : scale.connect(baudRate))}
            >
              {scale.connected ? "Desconectar balança" : scale.busy ? "Conectando..." : "Conectar balança"}
            </button>
            <p className="muted" style={{ marginBottom: 8 }}>
              {scale.connected ? `Balança conectada${scale.lastLine ? ` · última leitura: ${scale.lastLine}` : ""}` : "Balança desconectada — peso pode ser digitado manualmente."}
            </p>
          </>
        ) : scale.insecureContext ? (
          <p className="muted" style={{ marginBottom: 8 }}>
            Leitura automática indisponível: esta página foi aberta por um endereço não seguro ({typeof window !== "undefined" ? window.location.origin : ""}).
            O navegador só habilita a leitura da balança via HTTPS ou em "localhost". Acesse via HTTPS, ou abra o Chrome/Edge/Chromium com a flag
            <code> --unsafely-treat-insecure-origin-as-secure={typeof window !== "undefined" ? window.location.origin : "http://SEU-ENDERECO"} --user-data-dir=C:\temp\balanca-profile</code> para liberar este endereço específico.
          </p>
        ) : (
          <p className="muted" style={{ marginBottom: 8 }}>Leitura automática da balança disponível apenas no Chrome, Edge ou Chromium (Web Serial).</p>
        )}
      </div>
      {scale.error && <p className="error">{scale.error}</p>}
      <div className="row" style={{ marginTop: 12 }}>
        <div className="field">
          <label>Produto (vendido por peso)</label>
          <Autocomplete
            ref={productRef}
            required
            value={productId}
            options={weighable.map((p) => ({ value: p.id, code: p.sku, description: p.name }))}
            onChange={setProductId}
          />
        </div>
        <div className="field field-narrow">
          <label>Peso (kg)</label>
          <input
            ref={weightRef}
            type="number"
            step="0.001"
            min="0"
            value={weightKg}
            disabled={!product}
            onChange={(e) => setWeightKg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                print(true);
              }
            }}
          />
        </div>
        <button type="button" disabled={!product || !validWeight} onClick={() => print(true)}>
          Imprimir etiqueta
        </button>
        <button type="button" className="secondary" disabled={!product || !validWeight} onClick={() => print(false)}>
          Imprimir sem preço
        </button>
      </div>
      {product && (
        <p className="muted" style={{ marginTop: 8 }}>
          Preço/kg: {unitPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          {validWeight && <> · Total: {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</>}
        </p>
      )}
      {lastPrinted && (
        <p className="muted" style={{ marginTop: 4 }}>
          Última etiqueta: {lastPrinted.sku} · {lastPrinted.weightKg.toFixed(3)} kg · código {lastPrinted.barcode}
        </p>
      )}
      {weighable.length === 0 && (
        <p className="error" style={{ marginTop: 12 }}>Nenhum produto com unidade de venda KG cadastrado.</p>
      )}
    </div>
  );
}
