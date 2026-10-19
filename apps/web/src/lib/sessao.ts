// Marcas curtas em sessionStorage que evitam loop entre a tela /login e o login do APP CENTRAL.
// Tudo com validade de poucos segundos/minuto: depois disso a entrada direta volta a valer.

const CHAVE_SAIDA = "regula_saida_em";
const CHAVE_TENTATIVA = "regula_central_tentativa_em";

function ler(chave: string): number {
  try {
    return Number(sessionStorage.getItem(chave)) || 0;
  } catch {
    return 0;
  }
}

function gravar(chave: string): void {
  try {
    sessionStorage.setItem(chave, String(Date.now()));
  } catch {
    // sem sessionStorage (modo privado restrito): o anti-loop cai só nas outras travas
  }
}

// o usuário acabou de sair: a tela /login não deve jogá-lo de volta no login da Central
export function marcarSaida(): void {
  gravar(CHAVE_SAIDA);
}

export function saidaRecente(): boolean {
  return Date.now() - ler(CHAVE_SAIDA) < 60_000;
}

// a tela /login acabou de mandar o navegador pra Central: se voltar pra cá em seguida (login que não
// "pegou"), mostra a tela com os botões em vez de repetir o redirect em loop
export function marcarTentativaCentral(): void {
  gravar(CHAVE_TENTATIVA);
}

export function tentativaCentralRecente(): boolean {
  return Date.now() - ler(CHAVE_TENTATIVA) < 20_000;
}
