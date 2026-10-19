// Descobre, a partir do cadastro do cliente, de onde vêm os dados abertos do portal de transparência dele.
// Sem dependências de propósito: é importado por vários arquivos do módulo e não pode formar ciclo.

// O "portal de transparência" (plataforma usada por IPRES, Angraprev, Mesquitaprev, Búzios Prev…) expõe
// conjuntos de dados abertos públicos em <origem>/dadosabertosexportar?d=<conjunto>&a=<ano>&f=json.
// O cliente já tem a URL do menu cadastrada (Tenant.portalMenuApiUrl), que é desse mesmo endereço — daí a origem.
export function urlPortalBase(portalMenuApiUrl: string | null | undefined): string | null {
  if (!portalMenuApiUrl) return null;
  try {
    const u = new URL(portalMenuApiUrl);
    if (!/dadosabertosexportar/i.test(u.pathname)) return null;
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

// Servidores dos quais é seguro baixar PDF para este cliente: o do próprio portal (com e sem "www.").
export function hostsDoPortal(base: string | null): string[] {
  if (!base) return [];
  try {
    const h = new URL(base).hostname.toLowerCase().replace(/^www\./, "");
    return [h];
  } catch {
    return [];
  }
}
