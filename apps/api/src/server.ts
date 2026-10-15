import { createApp } from "./app";
import { env, assertProductionEnv } from "./config/env";
import { iniciarColetaAgendada } from "./modules/transparencia-api/coletor";

assertProductionEnv();

const app = createApp();

app.listen(env.port, () => {
  console.log(`Regula RPPS API rodando em http://localhost:${env.port}`);
});

iniciarColetaAgendada();
