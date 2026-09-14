// Indicadores tipo DATA são guardados como texto livre no formato brasileiro "dd/mm/aaaa" (o
// mesmo que a IA usa ao citar o documento-fonte) — nunca ISO. Estas funções só existem pra fazer
// a ponte com <input type="date">, que exige "aaaa-mm-dd" independente de locale.
export function dataBrParaInput(v: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

export function dataInputParaBr(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}
