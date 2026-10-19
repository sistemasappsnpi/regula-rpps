import { useEffect, useState } from "react";

// Animações de entrada dos gráficos do Portal Previdenciário. O CSS já respeita "reduzir movimento"
// (index.css), mas as animações do Recharts são em JS — por isso este hook.

export const DURACAO_GRAFICO = 1800;
export const ATRASO_GRAFICO = 250;

export function useAnimarGraficos(): boolean {
  const [animar, setAnimar] = useState(() => !(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const aoMudar = () => setAnimar(!mq.matches);
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, []);
  return animar;
}

// false no primeiro quadro, true logo depois: barras CSS saem de largura 0 e crescem com transition
export function useMontado(): boolean {
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setMontado(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return montado;
}

// entrada escalonada dos cartões: o i-ésimo aparece um pouco depois do anterior
export function entradaEscalonada(indice: number, base = 0): React.CSSProperties {
  return { animation: `fade-up .7s cubic-bezier(.22,.8,.3,1) ${base + indice * 110}ms both` };
}
