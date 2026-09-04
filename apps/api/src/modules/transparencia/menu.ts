import { prisma } from "../../db/prisma";

export interface MenuSecao {
  label: string;
  itens: { label: string; href: string }[];
}

/**
 * Menu de navegação do portal público de transparência de um RPPS — compartilhado entre a
 * página principal (/transparencia/:slug) e as páginas de documentos personalizados
 * publicados (/documentos-publicos/:slug/:codigo), pra manter a mesma navegação em qualquer
 * página do portal daquele tenant. Ver PortalPublicoLayout.tsx no frontend.
 */
export async function montarMenuPublico(tenantId: string, slug: string): Promise<MenuSecao[]> {
  const secoes: MenuSecao[] = [
    {
      label: "Institucional",
      itens: [
        { label: "Sobre o RPPS", href: `/transparencia/${slug}#sobre` },
        { label: "Documentos publicados", href: `/transparencia/${slug}#documentos` },
      ],
    },
  ];

  const publicacoes = await prisma.tenantDocumentoPersonalizadoPublicacao.findMany({
    where: { tenantId, status: "APROVADO" },
    include: { documento: { select: { codigo: true, nome: true, sortOrder: true } } },
  });

  if (publicacoes.length > 0) {
    secoes.push({
      label: "Documentos Personalizados",
      itens: publicacoes
        .sort((a, b) => a.documento.sortOrder - b.documento.sortOrder)
        .map((p) => ({ label: p.documento.nome, href: `/documentos-publicos/${slug}/${p.documento.codigo}` })),
    });
  }

  return secoes;
}
