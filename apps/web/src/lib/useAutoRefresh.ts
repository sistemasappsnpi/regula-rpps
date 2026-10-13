import { useEffect, useRef } from "react";

// Páginas públicas (Portal Previdenciário/Transparência) não têm como saber que alguém aprovou
// dados novos em outra aba/sessão — sem isso, a página fica com o que carregou na primeira vez até
// alguém apertar F5. Busca de novo sozinha em intervalo e quando a aba volta a ficar visível
// (cobre o caso comum: aprovou em outra aba, voltou pra essa).
//
// Cuidado com a carga no servidor: cada aba aberta no mundo todo chama isso. Por isso o intervalo é
// de 5 min (era 30s), aba em segundo plano não busca nada, e voltar ao foco só rebusca se já passou
// um tempo mínimo desde a última busca (alternar de aba várias vezes não gera uma rajada).
const INTERVALO_PADRAO_MS = 5 * 60_000;
const MINIMO_ENTRE_BUSCAS_MS = 60_000;

export function useAutoRefresh(refetch: () => void, intervaloMs = INTERVALO_PADRAO_MS): void {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    let ultima = Date.now();

    function buscar() {
      ultima = Date.now();
      refetchRef.current();
    }

    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") buscar();
    }, intervaloMs);

    function aoVoltarAoFoco() {
      if (document.visibilityState === "visible" && Date.now() - ultima >= MINIMO_ENTRE_BUSCAS_MS) buscar();
    }

    document.addEventListener("visibilitychange", aoVoltarAoFoco);
    window.addEventListener("focus", aoVoltarAoFoco);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltarAoFoco);
      window.removeEventListener("focus", aoVoltarAoFoco);
    };
  }, [intervaloMs]);
}
