import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type PortalPrevidenciario } from "../lib/api";
import { Card } from "../components/ui/Card";
import { PortalPrevidenciarioLayout } from "../components/layout/PortalPrevidenciarioLayout";

// Página pública (sem autenticação) do Portal Previdenciário — módulo novo, distinto do Portal
// de Transparência (/transparencia/:slug). Por ora só traz o menu e o rodapé vindos ao vivo das
// APIs externas configuradas pra este RPPS; o conteúdo central (gráficos, relatórios, dados
// estruturados do CADPREV/PDF) ainda não foi definido.
export function PortalPrevidenciarioPage() {
  const { slug } = useParams<{ slug: string }>();
  const [dados, setDados] = useState<PortalPrevidenciario | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api
      .portalPrevidenciario(slug)
      .then(setDados)
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar o Portal Previdenciário."));
  }, [slug]);

  if (erro) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <Card className="max-w-md p-6 text-center">
          <p className="text-sm text-ink-muted">{erro}</p>
        </Card>
      </div>
    );
  }

  return (
    <PortalPrevidenciarioLayout
      tenantNome={dados?.tenant.name ?? "Portal Previdenciário"}
      menu={dados?.menu ?? null}
      rodape={dados?.rodape ?? null}
      sincronizadoEm={dados?.sincronizadoEm ?? null}
    >
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-2xl font-bold text-ink">{dados?.tenant.name ?? "Carregando…"}</h1>
        {dados && <p className="mt-1 text-sm text-ink-muted">{dados.tenant.federatedEntity}</p>}

        <Card className="mt-8 p-6">
          <p className="text-sm text-ink-muted">
            Conteúdo em construção: aqui vão entrar os gráficos, relatórios e dados estruturados do
            Portal Previdenciário deste RPPS.
          </p>
        </Card>
      </div>
    </PortalPrevidenciarioLayout>
  );
}
