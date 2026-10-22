import { createApp } from "./app";
import { env, assertProductionEnv } from "./config/env";
import { iniciarColetaAgendada } from "./modules/transparencia-api/coletor";
import { iniciarVerificacaoAgendada } from "./modules/transparencia-gerador/links";

assertProductionEnv();

const app = createApp();

app.listen(env.port, () => {
  console.log(`Regula RPPS API rodando em http://localhost:${env.port}`);
});

iniciarColetaAgendada();
iniciarVerificacaoAgendada();
