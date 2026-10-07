// Cores dominantes de uma logo PNG (sem biblioteca de imagem): usadas quando a página do órgão não declara
// as cores em CSS. Só PNG de 8 bits sem entrelaçamento; qualquer outro formato devolve null.

import { inflateSync } from "node:zlib";

interface Rgb { r: number; g: number; b: number }

function lerPng(buf: Buffer): { w: number; h: number; px: Uint8Array; canais: number } | null {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let off = 8, w = 0, h = 0, tipo = 0, prof = 0, entrelacado = 0;
  const idat: Buffer[] = [];
  let paleta: Buffer | null = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const nome = buf.toString("latin1", off + 4, off + 8);
    const dados = buf.subarray(off + 8, off + 8 + len);
    if (nome === "IHDR") { w = dados.readUInt32BE(0); h = dados.readUInt32BE(4); prof = dados[8]; tipo = dados[9]; entrelacado = dados[12]; }
    else if (nome === "PLTE") paleta = dados;
    else if (nome === "IDAT") idat.push(dados);
    else if (nome === "IEND") break;
    off += 12 + len;
  }
  if (!w || !h || prof !== 8 || entrelacado !== 0 || w * h > 16_000_000) return null;
  const canais = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[tipo];
  if (!canais || (tipo === 3 && !paleta)) return null;
  let raw: Buffer;
  try { raw = inflateSync(Buffer.concat(idat)); } catch { return null; }
  const linha = w * canais;
  if (raw.length < (linha + 1) * h) return null;
  const out = new Uint8Array(linha * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (linha + 1)];
    const ini = y * (linha + 1) + 1;
    for (let i = 0; i < linha; i++) {
      const x = raw[ini + i];
      const a = i >= canais ? out[y * linha + i - canais] : 0;
      const b = y > 0 ? out[(y - 1) * linha + i] : 0;
      const c = i >= canais && y > 0 ? out[(y - 1) * linha + i - canais] : 0;
      let v: number;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else return null;
      out[y * linha + i] = v & 255;
    }
  }
  if (tipo === 3 && paleta) {
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) for (let k = 0; k < 3; k++) rgb[i * 3 + k] = paleta[out[i] * 3 + k] ?? 0;
    return { w, h, px: rgb, canais: 3 };
  }
  return { w, h, px: out, canais };
}

const hex = (c: Rgb) => `#${[c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

function luminancia({ r, g, b }: Rgb) {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

// escurece até o texto branco ter contraste de leitura (4,5:1) sobre a cor
function paraTextoBranco(c: Rgb): Rgb {
  let cur = c;
  for (let i = 0; i < 20 && 1.05 / (luminancia(cur) + 0.05) < 4.5; i++) cur = { r: cur.r * 0.9, g: cur.g * 0.9, b: cur.b * 0.9 };
  return cur;
}

function matiz({ r, g, b }: Rgb) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Cor principal (escura o bastante para texto branco) e de destaque, tiradas da logo; null se não der para ler. */
export function coresDaLogo(buf: Buffer): { primaria: string; destaque: string } | null {
  const png = lerPng(buf);
  if (!png) return null;
  const { w, h, px, canais } = png;
  const passo = Math.max(1, Math.floor(Math.sqrt((w * h) / 40000)));
  const baldes = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let y = 0; y < h; y += passo) {
    for (let x = 0; x < w; x += passo) {
      const i = (y * w + x) * canais;
      const alfa = canais === 4 ? px[i + 3] : canais === 2 ? px[i + 1] : 255;
      if (alfa < 128) continue;
      const c = canais >= 3 ? { r: px[i], g: px[i + 1], b: px[i + 2] } : { r: px[i], g: px[i], b: px[i] };
      const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
      if (mx - mn < 40 || mx > 240 && mn > 215 || mx < 25) continue; // cinza, branco e preto não são cor de marca
      const k = (c.r >> 5) * 64 + (c.g >> 5) * 8 + (c.b >> 5);
      const b = baldes.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += c.r; b.g += c.g; b.b += c.b;
      baldes.set(k, b);
    }
  }
  const lista = [...baldes.values()].sort((a, b) => b.n - a.n).map((b) => ({ r: b.r / b.n, g: b.g / b.n, b: b.b / b.n, n: b.n }));
  if (lista.length === 0) return null;
  const prim = lista[0];
  // destaque: a cor mais frequente com matiz bem diferente da principal; sem ela, uma variação mais clara
  const dif = (a: Rgb, b: Rgb) => { const d = Math.abs(matiz(a) - matiz(b)); return Math.min(d, 360 - d); };
  const outra = lista.slice(1).find((c) => dif(c, prim) >= 40 && c.n >= lista[0].n * 0.05);
  const destaque = outra ?? { r: prim.r + (255 - prim.r) * 0.45, g: prim.g + (255 - prim.g) * 0.45, b: prim.b + (255 - prim.b) * 0.45 };
  return { primaria: hex(paraTextoBranco(prim)), destaque: hex(destaque) };
}
