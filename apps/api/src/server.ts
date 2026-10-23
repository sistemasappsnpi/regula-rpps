import { createApp } from "./app";
import { env, assertProductionEnv } from "./config/env";
import { iniciarColetaAgendada } from "./modules/transparencia-api/coletor";
import { garantirClientesNexa } from "./modules/transparencia-api/clientes-nexa";
import { iniciarVerificacaoAgendada } from "./modules/transparencia-gerador/links";
import { garantirExemploCamara } from "./modules/transparencia-gerador/tipos";

assertProductionEnv();

const app = createApp();

app.listen(env.port, () => {
  console.log(`Regula RPPS API rodando em http://localhost:${env.port}`);
});

// cadastra/atualiza os clientes da Nexa ANTES da primeira coleta (que roda 1 min depois de subir)
void garantirClientesNexa().finally(() => iniciarColetaAgendada());
void garantirExemploCamara();
iniciarVerificacaoAgendada();
