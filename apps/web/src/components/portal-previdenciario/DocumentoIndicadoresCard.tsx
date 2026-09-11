import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "../ui/Card";
import type { PortalDocumentoPublico } from "../../lib/api";

export function formatarCompetencia(iso: string): string {
  const [ano, mes] = iso.slice(0, 7).split("-");
  return `${mes}/${ano}`;
}

export function baixarCsv(nomeArquivo: string, documentos: PortalDocumentoPublico[]) {
  const linhas = ["Documento,Indicador,Competencia,Valor"];
  for (const doc of documentos) {
    for (const indicador of doc.indicadores) {
      for (const v of indicador.valores) {
        linhas.push(`"${doc.nome}","${indicador.nome}",${formatarCompetencia(v.competencia)},"${v.valor}"`);
      }
    }
  }
  const blob = new Blob([linhas.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

// Um documento do Portal Previdenciário (gráfico pra indicadores NUMERICO/MOEDA, tabela pra
// TEXTO/DATA) — reaproveitado tanto pelo relatório multi-documento (PortalPrevidenciarioPage)
// quanto pela página dedicada de um único documento (PortalPrevidenciarioDocumentoPage).
export function DocumentoIndicadoresCard({ documento }: { documento: PortalDocumentoPublico }) {
  return (
    <Card className="p-6">
      <p className="mb-4 font-display text-lg font-bold text-ink">{documento.nome}</p>
      <div className="flex flex-col gap-6">
        {documento.indicadores
          .filter((i) => i.valores.length > 0)
          .map((indicador) => {
            const numerico = indicador.tipo === "NUMERICO" || indicador.tipo === "MOEDA";
            return (
              <div key={indicador.id}>
                <p className="mb-2 text-sm font-medium text-ink">
                  {indicador.nome}
                  {indicador.unidade ? <span className="ml-1 text-xs text-ink-muted">({indicador.unidade})</span> : null}
                </p>
                {numerico ? (
                  <div className="h-56 w-full">
                    <ResponsiveContainer>
                      <LineChart
                        data={indicador.valores.map((v) => ({
                          competencia: formatarCompetencia(v.competencia),
                          valor: Number(String(v.valor).replace(/\./g, "").replace(",", ".")),
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="competencia" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Line type="monotone" dataKey="valor" stroke="var(--nav-active, #0a4d53)" strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {indicador.valores.map((v, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="py-1 text-ink-muted">{formatarCompetencia(v.competencia)}</td>
                          <td className="py-1 text-right text-ink">{v.valor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
      </div>
    </Card>
  );
}
