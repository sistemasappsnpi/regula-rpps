import { beforeEach, describe, expect, it, vi } from "vitest";

const tenants: Record<string, any> = {};
const criados: string[] = [];
vi.mock("../src/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: async ({ where }: any) => {
        if (where.slug) return tenants[where.slug] ?? null;
        if (where.id) return Object.values(tenants).find((t: any) => t.id === where.id) ?? null;
        return Object.values(tenants).find((t: any) => t.cnpj && t.cnpj === where.cnpj) ?? null;
      },
      create: async ({ data }: any) => {
        criados.push(data.slug);
        return (tenants[data.slug] = { id: `id-${data.slug}`, ...data });
      },
      update: async ({ where, data }: any) => Object.assign(Object.values(tenants).find((t: any) => t.id === where.id), data),
    },
  },
}));
const ensure = vi.fn(async () => undefined);
vi.mock("../src/modules/crp/crp.repository", () => ({ crpRepository: { ensureTenantRows: (...a: any[]) => ensure(...a) } }));
const coletarPortal = vi.fn(async () => [{ codigo: "portal-publicacoes", ok: true }]);
vi.mock("../src/modules/transparencia-api/portal-dados-abertos", () => ({ coletarPortal: (...a: any[]) => coletarPortal(...(a as [])) }));
vi.mock("../src/modules/transparencia-api/sincronizar", () => ({ sincronizarRegistros: async () => ({ total: 1, novos: 1, removidos: 0 }) }));
vi.mock("../src/modules/transparencia-api/arquivos", () => ({ baixarArquivosPendentes: async () => ({ baixados: 0, falhas: [] }) }));

const { garantirClientesNexa, CLIENTES_NEXA } = await import("../src/modules/transparencia-api/clientes-nexa");
const { coletarTudo } = await import("../src/modules/transparencia-api/coletor");

beforeEach(() => {
  for (const k of Object.keys(tenants)) delete tenants[k];
  criados.length = 0;
  ensure.mockClear();
  coletarPortal.mockClear();
});

describe("cadastro automático dos clientes da Nexa", () => {
  it("cria o IPREV-CA (estilo básico, com chave) e grava a chave no IPRES, sem mexer no resto", async () => {
    tenants.ipres = { id: "id-ipres", slug: "ipres", name: "IPRES", transparenciaApiChave: null, portalEstiloPaginas: "completo" };
    const feito = await garantirClientesNexa();
    expect(feito).toHaveLength(2);
    expect(criados).toEqual(["iprevca"]);
    expect(tenants.iprevca).toMatchObject({
      name: "IPREV-CA", portalEstiloPaginas: "basico", portalCorPrimaria: "#2e3869", cnpj: "03.405.084/0001-31",
      portalMenuApiUrl: expect.stringContaining("iprevca.rj.gov.br/dadosabertosexportar?d=menu"),
    });
    expect(tenants.iprevca.transparenciaApiChave).toBe(CLIENTES_NEXA[0].chave);
    expect(ensure).toHaveBeenCalledWith("id-iprevca");
    expect(tenants.ipres.transparenciaApiChave).toBe(CLIENTES_NEXA[1].chave);
    expect(tenants.ipres.portalEstiloPaginas).toBe("completo");
  });

  it("é idempotente e nunca sobrescreve o que o Admin já preencheu", async () => {
    tenants.ipres = { id: "id-ipres", slug: "ipres", transparenciaApiChave: "CHAVE-DO-ADMIN" };
    await garantirClientesNexa();
    tenants.iprevca.portalCorPrimaria = "#000000";
    expect(await garantirClientesNexa()).toEqual([]);
    expect(tenants.ipres.transparenciaApiChave).toBe("CHAVE-DO-ADMIN");
    expect(tenants.iprevca.portalCorPrimaria).toBe("#000000");
    expect(criados).toEqual(["iprevca"]);
  });

  it("cria o cliente sem CNPJ se o CNPJ já estiver em outro cadastro", async () => {
    tenants.outro = { id: "o", slug: "outro", cnpj: "03.405.084/0001-31" };
    await garantirClientesNexa();
    expect(tenants.iprevca.cnpj).toBeNull();
  });

  it("não quebra se o IPRES ainda não existir (outro ambiente)", async () => {
    await expect(garantirClientesNexa()).resolves.toHaveLength(1);
  });
});

describe("o que a coleta pega de cada cliente", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async () => new Response("[]", { status: 200 }));
  });

  it("estilo básico com chave: só a Nexa", async () => {
    tenants.a = { id: "a", transparenciaApiChave: "K", portalMenuApiUrl: "https://x.gov.br/dadosabertosexportar?d=menu", portalEstiloPaginas: "basico" };
    const r = await coletarTudo("a");
    expect(r.length).toBeGreaterThan(15);
    expect(coletarPortal).not.toHaveBeenCalled();
  });

  it("estilo completo com chave (IPRES): a Nexa e também o portal", async () => {
    tenants.b = { id: "b", transparenciaApiChave: "K", portalMenuApiUrl: "https://x.gov.br/dadosabertosexportar?d=menu", portalEstiloPaginas: "completo" };
    const r = await coletarTudo("b");
    expect(coletarPortal).toHaveBeenCalledWith("b", "https://x.gov.br");
    expect(r.some((x) => x.codigo === "portal-publicacoes")).toBe(true);
    expect(r.some((x) => x.codigo === "acordaos-tce")).toBe(true);
  });
});
