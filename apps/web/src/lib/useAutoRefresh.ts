import { useEffect, useRef } from "react";

// Páginas públicas (Portal Previdenciário/Transparência) não têm como saber que alguém aprovou
// dados novos em outra aba/sessão — sem isso, a página fica com o que carregou na primeira vez até
// alguém apertar F5. Busca de novo sozinha em intervalo e sempre que a aba volta a ficar visível
// (cobre o caso comum: aprovou em outra aba, voltou pra essa).
export function useAutoRefresh(refetch: () => void, intervaloMs = 30000): void {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    const intervalo = setInterval(() => refetchRef.current(), intervaloMs);

    function aoVoltarAoFoco() {
      if (document.visibilityState === "visible") refetchRef.current();
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
