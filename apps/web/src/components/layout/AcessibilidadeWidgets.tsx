import { useEffect, useState } from "react";
import { Contrast, Volume2 } from "lucide-react";

// VLibras (tradutor de Libras do governo, vlibras.gov.br) + barra de acessibilidade (alto
// contraste, tamanho de fonte, leitura em voz alta) — pras páginas públicas do cidadão (Portal de
// Transparência e Portal Previdenciário). Script de terceiro carregado sob demanda; o resto é
// puro React/CSS, sem depender de nada específico de um documento/tenant.

const PASSOS_FONTE = [0.9, 1, 1.1, 1.2, 1.3];
const INDICE_PADRAO = 1;

// A tag <script> só é injetada uma vez por sessão (module-level, sobrevive a
// remontagens do componente). Mas `new VLibras.Widget(...)` precisa rodar A CADA montagem: cada
// navegação entre páginas públicas desmonta e remonta este componente (rotas diferentes do React
// Router, sem layout compartilhado persistente), trocando os elementos [vw]/[vw-access-button]
// no DOM — sem reconstruir o widget contra o elemento novo, o botão flutuante do VLibras para de
// responder depois da primeira navegação.
let vlibrasScriptCarregando = false;
let vlibrasPronto = false;

function inicializarVLibrasQuandoPronto(): () => void {
  const vlibras = (window as unknown as { VLibras?: { Widget: new (url: string) => unknown } }).VLibras;
  if (vlibrasPronto && vlibras) {
    new vlibras.Widget("https://vlibras.gov.br/app");
    return () => {};
  }

  if (!vlibrasScriptCarregando) {
    vlibrasScriptCarregando = true;
    const script = document.createElement("script");
    script.src = "https://vlibras.gov.br/app/vlibras-plugin.js";
    script.onload = () => {
      vlibrasPronto = true;
      const v = (window as unknown as { VLibras?: { Widget: new (url: string) => unknown } }).VLibras;
      if (v) new v.Widget("https://vlibras.gov.br/app");
    };
    document.body.appendChild(script);
    return () => {};
  }

  // Um mount anterior já disparou o carregamento do script — só espera terminar.
  const intervalo = setInterval(() => {
    const v = (window as unknown as { VLibras?: { Widget: new (url: string) => unknown } }).VLibras;
    if (vlibrasPronto && v) {
      clearInterval(intervalo);
      new v.Widget("https://vlibras.gov.br/app");
    }
  }, 150);
  return () => clearInterval(intervalo);
}

// `mostrarFonte` desliga os botões A-/A+ quando a página já tem o próprio controle de tamanho de
// texto (ver PortalPublicoLayout.tsx) — pra não ter dois mecanismos de fonte concorrendo.
export function AcessibilidadeWidgets({ mostrarFonte = true }: { mostrarFonte?: boolean }) {
  const [indiceFonte, setIndiceFonte] = useState(INDICE_PADRAO);
  const [contraste, setContraste] = useState(false);
  const [lendo, setLendo] = useState(false);

  useEffect(() => {
    return inicializarVLibrasQuandoPronto();
  }, []);

  useEffect(() => {
    try {
      const salvo = Number.parseInt(localStorage.getItem("a11yFontIdx") ?? "", 10);
      if (!Number.isNaN(salvo) && PASSOS_FONTE[salvo] !== undefined) setIndiceFonte(salvo);
      if (localStorage.getItem("a11yContrast") === "1") setContraste(true);
    } catch {
      /* localStorage indisponível (modo privado etc.) — segue com o padrão */
    }
  }, []);

  useEffect(() => {
    if (!mostrarFonte) return;
    document.documentElement.style.fontSize = `${PASSOS_FONTE[indiceFonte] * 100}%`;
    try {
      localStorage.setItem("a11yFontIdx", String(indiceFonte));
    } catch {
      /* ignora — não é crítico persistir */
    }
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, [indiceFonte, mostrarFonte]);

  useEffect(() => {
    if (contraste) document.documentElement.setAttribute("data-contrast", "high");
    else document.documentElement.removeAttribute("data-contrast");
    try {
      localStorage.setItem("a11yContrast", contraste ? "1" : "0");
    } catch {
      /* ignora — não é crítico persistir */
    }
    return () => {
      document.documentElement.removeAttribute("data-contrast");
    };
  }, [contraste]);

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  function alternarLeitura() {
    if (!("speechSynthesis" in window)) return;
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setLendo(false);
      return;
    }
    // Lê só o conteúdo principal (<main>), nunca o menu/rodapé repetido em toda página.
    const texto = document.querySelector("main")?.textContent?.trim();
    if (!texto) return;
    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = "pt-BR";
    utter.onend = () => setLendo(false);
    setLendo(true);
    window.speechSynthesis.speak(utter);
  }

  const classeBotao = (ativo: boolean) =>
    `flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold shadow-soft transition-colors ${
      ativo ? "border-petrol bg-petrol text-white" : "border-border bg-white text-ink-muted hover:border-petrol hover:text-petrol"
    }`;

  return (
    <>
      {/* Marcação exata que o script do vlibras.gov.br procura no DOM (atributos, não classes) —
          via dangerouslySetInnerHTML porque JSX/TSX não aceita atributos custom sem hífen tipados
          nos elementos intrínsecos; é HTML estático, sem entrada de usuário nenhuma. */}
      <div
        dangerouslySetInnerHTML={{
          __html:
            '<div vw class="enabled"><div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div></div>',
        }}
      />

      <div
        className="fixed bottom-20 right-4 z-30 flex flex-col gap-2 sm:bottom-6 sm:right-[5.5rem]"
        role="group"
        aria-label="Acessibilidade"
      >
        <button
          type="button"
          onClick={() => setContraste((v) => !v)}
          aria-pressed={contraste}
          aria-label="Alternar alto contraste"
          title="Alto contraste"
          className={classeBotao(contraste)}
        >
          <Contrast size={16} />
        </button>
        {mostrarFonte && (
          <>
            <button
              type="button"
              onClick={() => setIndiceFonte((i) => Math.max(i - 1, 0))}
              aria-label="Diminuir fonte"
              title="Diminuir fonte"
              className={classeBotao(false)}
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => setIndiceFonte((i) => Math.min(i + 1, PASSOS_FONTE.length - 1))}
              aria-label="Aumentar fonte"
              title="Aumentar fonte"
              className={classeBotao(false)}
            >
              A+
            </button>
          </>
        )}
        <button
          type="button"
          onClick={alternarLeitura}
          aria-pressed={lendo}
          aria-label="Ouvir o conteúdo da página"
          title="Ouvir o conteúdo da página"
          className={classeBotao(lendo)}
        >
          <Volume2 size={16} />
        </button>
      </div>
    </>
  );
}
