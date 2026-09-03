# Roadmap

Ordem sugerida para as próximas iterações, cada uma como um "corte vertical" completo (schema + API + tela), igual ao que foi feito para o módulo CRP nesta primeira entrega.

## 1. Módulo Pró-Gestão RPPS
- Tabelas: `pro_gestao_dimensions`, `pro_gestao_actions` (catálogo das 24 ações, 3 dimensões), `tenant_pro_gestao_action_status` (nível atingido por ação, por tenant).
- Diagnóstico automático de nível (I–IV) a partir do progresso por dimensão.
- Tela com progresso por dimensão e simulação de "próximo nível".
- Gate: disponível apenas para tenants com `plan` = `GESTAO` ou `PERFORMANCE`.

## 2. Portal de Transparência Ativa (público)
- Tabela `transparency_documents` (tenant, categoria, título, arquivo, publicado_em, tipo: pdf/dados abertos).
- Rota pública **sem autenticação**, servida por slug do tenant (`/t/:slug/transparencia`), somente leitura, somente itens marcados como públicos.
- Selo de "atualizado em tempo real" com timestamp da última publicação.

## 3. Documentos e Evidências
- Upload de arquivos (local disk ou S3-compatível) vinculados a um critério CRP ou ação Pró-Gestão.
- Retenção mínima de 3 anos (política de não-exclusão automática).
- "Modo auditoria": exportação de pacote consolidado de evidências por dimensão/nível.

## 4. Planos e Feature Gating
- Enum `Plan` já existe no schema (`ESSENCIAL`, `GESTAO`, `PERFORMANCE`).
- Middleware `requirePlan(...)` no backend para bloquear rotas por plano.
- Tela de configurações com comparativo de planos e bloqueio visual (upgrade CTA) no frontend quando o módulo não está incluso.

## 5. Integrações federais (fase posterior, fora do escopo de MVP)
- CADPREV, GESCON, SICONFI, eSocial, SIRC, COMPREV/DATAPREV, PREVIC.
- Nesta fase, implementar como jobs assíncronos (fila) que atualizam `TenantCrpCriterion.status` automaticamente, com log de sincronização por integração.

## 6. Camada de IA (fase posterior)
- Redator automático de relatórios obrigatórios.
- Auditor virtual contínuo (leitura de documentos enviados vs. requisitos textuais de cada ação/critério).
- Ouvidoria com triagem automática no portal público.

## 7. Painel Super Admin
- Visão cross-tenant (todos os RPPS clientes), saúde de compliance agregada, plano contratado, uso.
- Acesso restrito ao papel `SUPER_ADMIN`, nunca vinculado a um `tenantId` específico.
