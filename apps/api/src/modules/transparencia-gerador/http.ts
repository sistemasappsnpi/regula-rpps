// Busca de URLs externas (APIs de dados abertos e página de acesso à informação do cliente).
// O gerador só roda para Super Admin, mas ainda assim não deixa o servidor ser usado para alcançar
// a rede interna: bloqueia hosts locais/privados escritos no endereço.

const USER_AGENT = "PortalTransparencia/1.0";

export function hostPermitido(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (h === "::1" || h === "::" || /^(fc|fd|fe80)/.test(h)) return false;
  const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  return true;
}

function decodificar(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes); // páginas antigas em ISO-8859-1
  }
}

interface Resposta {
  status: number;
  mime: string;
  corpo: ArrayBuffer;
  /** URL final, depois dos redirecionamentos (serve de base para links relativos). */
  url: string;
}

// redirecionamentos seguidos à mão: cada destino passa pela mesma checagem de host
async function buscar(url: string, timeoutMs: number, maxBytes: number): Promise<Resposta | null> {
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    let atual = url;
    for (let i = 0; i < 5; i++) {
      if (!hostPermitido(atual)) return null;
      const res = await fetch(atual, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/html;q=0.9, image/*;q=0.8, */*;q=0.5" },
        signal,
        redirect: "manual",
      });
      const destino = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && destino) {
        atual = new URL(destino, atual).toString();
        continue;
      }
      const tamanho = Number(res.headers.get("content-length") ?? 0);
      if (tamanho > maxBytes) return null;
      const corpo = await res.arrayBuffer();
      if (corpo.byteLength > maxBytes) return null;
      return { status: res.status, mime: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(), corpo, url: atual };
    }
    return null;
  } catch {
    return null;
  }
}

/** Devolve o corpo como texto, ou null se não houve resposta. Qualquer status HTTP conta como resposta. */
export async function fetchTexto(url: string, timeoutMs = 20000): Promise<string | null> {
  const r = await buscar(url, timeoutMs, 50 * 1024 * 1024);
  return r ? decodificar(r.corpo) : null;
}

/** Página HTML com a URL final (após redirecionamentos). Só devolve se o status for 2xx. */
export async function fetchPagina(url: string, timeoutMs = 20000): Promise<{ html: string; url: string } | null> {
  const r = await buscar(url, timeoutMs, 10 * 1024 * 1024);
  return r && r.status >= 200 && r.status < 300 ? { html: decodificar(r.corpo), url: r.url } : null;
}

/** Baixa um arquivo binário (logo/ícone). Só devolve se o status for 2xx e o tamanho couber em `maxBytes`. */
export async function fetchBytes(url: string, maxBytes: number, timeoutMs = 15000): Promise<{ buffer: Buffer; mime: string } | null> {
  const r = await buscar(url, timeoutMs, maxBytes);
  return r && r.status >= 200 && r.status < 300 && r.corpo.byteLength > 0 ? { buffer: Buffer.from(r.corpo), mime: r.mime } : null;
}
