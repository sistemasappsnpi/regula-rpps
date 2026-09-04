# Roadmap

Ordem sugerida para as próximas iterações, cada uma como um "corte vertical" completo (schema + API + tela).

## ~~1. Módulo Pró-Gestão RPPS~~ — feito

Implementado de ponta a ponta para as 24 ações / 3 dimensões, com catálogo seedado a partir de
`/knowledge-base/pro-gestao-acoes.json` (nunca hardcoded em código de aplicação):
- Formulário dinâmico por nível de aderência (I–IV), cumulativo — nunca esconde campo já
  preenchido em nível anterior. Nível é decidido pelo Admin Global por RPPS (`Tenant.nivelProGestaoAlvo`),
  não escolhido pelo próprio tenant.
- Upload de PDF existente com extração assistida por IA (Claude via Anthropic API, com
  fallback funcional sem chave configurada), aprovação campo a campo com citação de
  página/trecho de origem.
- Motor de dependências entre documentos: detecta quando os documentos-fonte de uma ação
  composta (ex.: Transparência) estão prontos, gera rascunho citando a fonte de cada dado,
  exige aprovação humana explícita e marca como desatualizado se a fonte mudar depois.
- Painel com progresso por dimensão e quantas ações faltam para cada nível de certificação.

Pendente: "selo de atualizado em tempo real" com base na periodicidade de cada item (a
informação de periodicidade por nível já existe no `knowledge-base/pro-gestao-acoes.json`,
falta a lógica de alerta de desatualização por prazo).

## ~~2. Portal de Transparência Ativa (público)~~ — feito

Rota pública sem autenticação (`/transparencia/:slug`), servida a partir do documento composto
aprovado da ação "Transparência" do Pró-Gestão — nunca a partir de PDF anexado, sempre dado
estruturado já aprovado por um humano. Busca, filtro por documento-fonte e exportação (geral e
por item).

Estendido com `PortalPublicoLayout` (compartilhado com Documentos Personalizados, ver item 9):
menu de navegação montado dinamicamente via API (`montarMenuPublico`, une seções institucionais
fixas + uma seção por Documento Personalizado publicado) e rodapé padrão estilo portal de
transparência governamental (CNPJ, endereço/telefone/e-mail do RPPS — editáveis pelo Admin Global
em RPPS clientes → Dados Básicos —, controles de acessibilidade A-/A/A+, linha de crédito à API).

## ~~3. Documentos e Evidências (upload)~~ — feito, sem o "modo auditoria"

Upload de PDF vinculado a uma ação do Pró-Gestão, com texto extraído por página e retenção em
disco local. Pendente: vincular upload também a critérios do CRP (hoje o schema já tem o campo
`criterionCode` em `DocumentoUpload` pronto para isso, só falta a rota); trocar disco local por
armazenamento compatível com S3 quando sair do ambiente de desenvolvimento (ver
`/docs/stack-proposta.md`); "modo auditoria" de exportação consolidada de evidências.

## 4. Planos e Feature Gating por plano (`requirePlan`) — não iniciado

O que existe hoje (ver item 7) é diferente disto: cada `Feature` tem um `PlanFeature` (default
por plano, seedado e só editável via reseed) que cada `Tenant` e cada `User` pode sobrepor
individualmente — não há mais tela de edição do "plano" em si nem endpoint que bloqueie uma rota
inteira por `Tenant.plan` diretamente. Falta, se ainda fizer sentido no produto:
- Middleware `requirePlan(...)` no backend para bloquear rotas por plano (hoje o bloqueio real é
  por feature efetiva do tenant/usuário, não pelo enum `Plan` puro).
- Tela de comparativo de planos com bloqueio visual (upgrade CTA) no frontend do tenant, hoje
  inexistente — antes havia uma tela "Planos e Recursos" no Admin, removida a pedido por ser
  redundante com a Aba Permissões do cliente.

## 5. Integrações federais (fase posterior, fora do escopo de MVP)
- CADPREV, GESCON, SICONFI, eSocial, SIRC, COMPREV/DATAPREV, PREVIC.
- Nesta fase, implementar como jobs assíncronos (fila) que atualizam `TenantCrpCriterion.status` automaticamente, com log de sincronização por integração.

## 6. Camada de IA (continuação)

A extração de PDF e a composição de rascunhos citando fonte já estão implementadas (item 1). O
Construtor de Documentos (item 8) cobre composição livre a partir de múltiplas fontes com prompt
por tipo de documento. O que falta desta frente:
- Auditor virtual contínuo: comparar documentos já enviados contra o texto integral do
  requisito (hoje a IA só extrai campos pontuais, não avalia conformidade do documento inteiro).
- Ouvidoria com triagem automática no portal público.
- Regra de transição do ISP (Resolução CMN nº 5.272/2025) para reduzir o quantitativo de ações
  exigidas por certificação — documentada em `knowledge-base/pro-gestao-acoes.json` (`_meta`),
  mas não implementada por depender de um dado externo (nota do ISP) fora dos dois manuais-fonte.

## ~~7. Painel Admin Global (Super Admin) e permissionamento~~ — feito

O conceito de "papel" (`Role`: RPPS_ADMIN/SERVIDOR/AUDITOR) foi removido por completo — não
gateava nada funcionalmente. No lugar, um sistema de permissões em cascata de 3 níveis, cada um
podendo sobrepor o anterior:

`PlanFeature` (default do plano, seedado) → `TenantFeature` (override por RPPS cliente, editável
em Admin → RPPS clientes → Permissões) → `UserFeature` (override por usuário individual — tanto
para features de tenant quanto para as seções do próprio Admin Global, editável em Admin →
Usuários → Permissões).

Implementado:
- `User.isSuperAdmin`, desacoplado de `Membership` (nunca vinculado a um `tenantId`); login
  reconhece o Super Admin e o backend bloqueia cruzamento nos dois sentidos (`requireTenant` vs.
  `requireSuperAdmin`); `GET /auth/me` decide para qual área a sessão vai.
- Cadastro de usuários (Admin → Usuários) restrito a contas Super Admin, cada uma com
  permissionamento individual sobre as seções do Admin Global — guarda contra autobloqueio
  (Super Admin não consegue tirar o próprio acesso à seção "Usuários").
- RPPS clientes: modal "Editar Cliente" com abas Dados Básicos / Usuários / Permissões; link de
  primeiro acesso por tenant para autocadastro (telefone + senha) de usuários já pré-cadastrados
  pelo e-mail.
- Parametrizações globais: Entidades Certificadoras, Construtor de Documentos (tipos/prompts de
  IA), Documentos Personalizados (ver item 9).
- Auditoria (feed cross-tenant de tudo que foi feito no sistema) e Relatórios (CSV, múltiplos
  tipos), ambos com seletor de limite (25–500) para não sobrecarregar o banco em consultas amplas.

Pendente para uma próxima sessão:
- Um usuário poder acumular Super Admin **e** membership de tenant ao mesmo tempo, com troca de
  contexto na UI (hoje o login manda o Super Admin sempre para `/admin`, sem opção de entrar
  como tenant mesmo que tenha membership).
- Testes automatizados para os endpoints `/admin/*`, `/documentos-personalizados/*` e para
  `requireTenant`/`requireSuperAdmin`/`requireFeature`/`requireAdminFeature` (hoje só validados
  manualmente via API).

## ~~8. Construtor de Documentos (IA)~~ — feito

Super Admin cadastra tipos de documento com prompt de instrução e referência normativa opcional
(ação do Pró-Gestão ou critério do CRP — dá à IA o contexto de objetivo/campos/base legal). O
tenant escolhe o tipo (combobox com busca) + N documentos-fonte já enviados, a IA monta o
documento final citando trecho/página de cada fonte, com aprovação humana explícita antes de
virar histórico.

## ~~9. Documentos Personalizados~~ — feito

Tipo documental livre (fora do catálogo oficial do Pró-Gestão/CRP — ex.: DIPR), criado do zero
pelo Super Admin em Parametrizações (nome + campos com descrição/obrigatoriedade, sem código de
ação nem nível de aderência associado). Cada RPPS preenche (todo campo opcional, "Salvar" único
no final) e publica (ato explícito, sobrescreve a publicação anterior) na própria aba
"Documentos" → "Personalizados". Publicação vira página pública própria
(`/documentos-publicos/:slug/:codigo`), no mesmo portal (menu + rodapé) da Transparência
principal — ver item 2.
