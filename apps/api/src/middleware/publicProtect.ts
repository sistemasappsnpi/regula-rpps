import type { NextFunction, Request, Response } from "express";

// Proteção das rotas públicas (sem login), que qualquer visitante/robô pode chamar à vontade:
// limite de requisições por IP e cache em memória com TTL. Sem dependências externas — o processo
// é único (um container de API), então memória local basta.

interface Janela {
  inicio: number;
  total: number;
}

export function limitarPorIp(maxPorJanela: number, janelaMs = 60_000) {
  const porIp = new Map<string, Janela>();

  // evita o mapa crescer sem fim com IPs que não voltam
  setInterval(() => {
    const agora = Date.now();
    for (const [ip, j] of porIp) if (agora - j.inicio > janelaMs) porIp.delete(ip);
  }, janelaMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    // atrás do nginx (e talvez de outro proxy na frente dele) req.ip seria o do proxy: usa o cliente original
    const xff = req.headers["x-forwarded-for"];
    const ip = (typeof xff === "string" ? xff.split(",")[0].trim() : "") || req.ip || "desconhecido";
    const agora = Date.now();
    let j = porIp.get(ip);
    if (!j || agora - j.inicio > janelaMs) {
      j = { inicio: agora, total: 0 };
      porIp.set(ip, j);
    }
    j.total += 1;
    if (j.total > maxPorJanela) {
      res.setHeader("Retry-After", String(Math.ceil((j.inicio + janelaMs - agora) / 1000)));
      res.status(429).json({ error: "Muitas requisições. Tente novamente em instantes." });
      return;
    }
    next();
  };
}

interface Entrada<T> {
  em: number;
  valor: T;
}

const MAX_ENTRADAS = 500;

/**
 * Cache com TTL que também junta chamadas simultâneas da mesma chave (só uma busca real por vez) e,
 * se a busca falhar, devolve o último valor bom em vez de repetir a falha para todo mundo.
 */
export function criarCache<T>(ttlMs: number) {
  const dados = new Map<string, Entrada<T>>();
  const emVoo = new Map<string, Promise<T>>();

  return async function obter(chave: string, buscar: () => Promise<T>): Promise<T> {
    const e = dados.get(chave);
    if (e && Date.now() - e.em < ttlMs) return e.valor;

    const andando = emVoo.get(chave);
    if (andando) return andando;

    const p = buscar()
      .then((valor) => {
        if (dados.size >= MAX_ENTRADAS) dados.delete(dados.keys().next().value as string);
        dados.set(chave, { em: Date.now(), valor });
        return valor;
      })
      .catch((err) => {
        if (e) return e.valor; // serve o antigo se a origem caiu
        throw err;
      })
      .finally(() => emVoo.delete(chave));
    emVoo.set(chave, p);
    return p;
  };
}
