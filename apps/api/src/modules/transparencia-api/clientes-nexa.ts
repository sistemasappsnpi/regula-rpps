import { prisma } from "../../db/prisma";
import { crpRepository } from "../crp/crp.repository";

// Cadastro inicial de clientes que usam a API Nexa de Transparência, feito sozinho na subida da API (sem passar pelo
// Admin): cria o cliente se ele ainda não existe e grava a chave só se o campo estiver vazio — o que o Admin
// já preencheu nunca é sobrescrito. As chaves abaixo são credenciais do órgão (mesmo papel de
// Tenant.transparenciaApiChave): depois de gravadas no banco este arquivo não precisa mais existir.
// Pedido do Luis em 2026-10-23: IPREV-CA (novo, estilo básico, só Nexa) e IPRES (já existe; passa a coletar a Nexa).

interface ClienteNexa {
  slug: string;
  chave: string;
  // dados para criar o cliente quando ele ainda não existe (null = o cliente já deve existir)
  novo: {
    name: string;
    federatedEntity: string;
    cnpj: string;
    site: string;
    logoUrl: string;
    enderecoPublico: string;
    telefonePublico: string;
    portalMenuApiUrl: string;
    portalRodapeApiUrl: string;
    portalCorPrimaria: string;
    portalCorDestaque: string;
    portalEstiloPaginas: "completo" | "basico";
  } | null;
}

const IPREVCA = "https://www.transparencia.iprevca.rj.gov.br";

export const CLIENTES_NEXA: ClienteNexa[] = [
  {
    slug: "iprevca",
    chave: "CJF0093J4DY345NK",
    novo: {
      name: "IPREV-CA",
      federatedEntity: "Casimiro de Abreu",
      cnpj: "03.405.084/0001-31",
      site: IPREVCA,
      logoUrl: `${IPREVCA}/imagens/logo.png`,
      enderecoPublico: "R. Nilo Peçanha, 29 - Centro, Casimiro de Abreu - RJ, 28860-000",
      telefonePublico: "(22) 2778-2036",
      portalMenuApiUrl: `${IPREVCA}/dadosabertosexportar?d=menu&a=&f=json&itens_por_pagina=100000`,
      portalRodapeApiUrl: `${IPREVCA}/dadosabertosexportar?d=rodape&a=&f=json&itens_por_pagina=100000`,
      portalCorPrimaria: "#2e3869",
      portalCorDestaque: "#c9a227",
      portalEstiloPaginas: "basico",
    },
  },
  { slug: "ipres", chave: "DKFJEYTC04KDJS63", novo: null },
];

export async function garantirClientesNexa(clientes: ClienteNexa[] = CLIENTES_NEXA): Promise<string[]> {
  const feito: string[] = [];
  for (const c of clientes) {
    try {
      let tenant = await prisma.tenant.findUnique({ where: { slug: c.slug }, select: { id: true, transparenciaApiChave: true } });
      if (!tenant && c.novo) {
        // CNPJ é único: se já existir outro cadastro com ele, cria sem CNPJ em vez de falhar
        const cnpjLivre = !(await prisma.tenant.findUnique({ where: { cnpj: c.novo.cnpj }, select: { id: true } }));
        const criado = await prisma.tenant.create({
          data: { slug: c.slug, ...c.novo, cnpj: cnpjLivre ? c.novo.cnpj : null, transparenciaApiChave: c.chave },
          select: { id: true, transparenciaApiChave: true },
        });
        await crpRepository.ensureTenantRows(criado.id);
        tenant = criado;
        feito.push(`${c.slug}: cliente criado com a chave da Nexa`);
        continue;
      }
      if (!tenant) continue; // cliente esperado ainda não existe neste ambiente (ex.: banco de desenvolvimento)
      if (!tenant.transparenciaApiChave) {
        await prisma.tenant.update({ where: { id: tenant.id }, data: { transparenciaApiChave: c.chave } });
        feito.push(`${c.slug}: chave da Nexa gravada`);
      }
    } catch (err) {
      // um cliente com problema não pode derrubar a subida da API nem impedir os outros
      console.error(`[clientes-nexa] ${c.slug}:`, err instanceof Error ? err.message : err);
    }
  }
  for (const linha of feito) console.log(`[clientes-nexa] ${linha}`);
  return feito;
}
