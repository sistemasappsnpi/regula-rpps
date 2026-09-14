export interface MenuSecao {
  label: string;
  itens: { label: string; href: string }[];
}

/**
 * Menu de navegação do portal público de transparência de um RPPS (/transparencia/:slug) — ver
 * PortalPublicoLayout.tsx no frontend. Documentos Personalizados (DPIN, DAIR etc.) hoje vivem no
 * Portal Previdenciário (/portal-previdenciario/:slug/:codigo), um menu separado.
 */
export async function montarMenuPublico(_tenantId: string, slug: string): Promise<MenuSecao[]> {
  return [
    {
      label: "Institucional",
      itens: [
        { label: "Sobre o RPPS", href: `/transparencia/${slug}#sobre` },
        { label: "Documentos publicados", href: `/transparencia/${slug}#documentos` },
      ],
    },
  ];
}
