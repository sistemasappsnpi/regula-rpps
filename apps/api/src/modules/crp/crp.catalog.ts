export interface CrpCriterionSeed {
  code: string;
  category: string;
  title: string;
  description: string;
  legalBasis: string;
  periodicity: string;
  sortOrder: number;
}

/**
 * Catálogo oficial dos 22 critérios do CRP, conforme
 * "Entendendo o Certificado de Regularidade Previdenciária" (CGNAL/DRPPS/SRPC/MPS, jul/2025).
 */
export const CRP_CRITERIA: CrpCriterionSeed[] = [
  {
    code: "CRP-01",
    category: "Legislação do Ente",
    title: "Atendimento à solicitação de legislação, documentos ou informações pela SRPC",
    description:
      "Envio, pelo GESCON, da legislação previdenciária/estatutária ou outro documento/informação solicitado pela Secretaria de Regime Próprio e Complementar.",
    legalBasis: "Lei 9.717/98, art. 9º, I e parágrafo único; Portaria MTP 1.467/2022, art. 247, XII e art. 250, II.",
    periodicity: "Sob demanda",
    sortOrder: 1,
  },
  {
    code: "CRP-02",
    category: "Legislação do Ente",
    title: "Observância dos limites de contribuição do ente",
    description:
      "A alíquota patronal não pode ser inferior à contribuição do servidor ativo, nem superior ao dobro dela.",
    legalBasis: "Lei 9.717/98, art. 2º; Portaria MTP 1.467/2022, art. 11, art. 247, I/II e art. 250, I/II.",
    periodicity: "Legislação vigente",
    sortOrder: 2,
  },
  {
    code: "CRP-03",
    category: "Legislação do Ente",
    title: "Observância dos limites de contribuição dos segurados e beneficiários",
    description:
      "Alíquota dos segurados não inferior à estabelecida para os servidores da União (14%, EC 103/2019), salvo comprovação de ausência de déficit atuarial.",
    legalBasis: "EC 103/2019, art. 9º, §§4º e 5º; Lei 9.717/98, art. 2º; Portaria MTP 1.467/2022, art. 11.",
    periodicity: "Legislação vigente",
    sortOrder: 3,
  },
  {
    code: "CRP-04",
    category: "Legislação do Ente",
    title: "Plano de benefícios integrado apenas por aposentadorias e pensões por morte",
    description: "Os benefícios concedidos pelo RPPS devem estar limitados a aposentadorias e pensão por morte.",
    legalBasis: "EC 103/2019, art. 9º, §§2º e 3º; Portaria MTP 1.467/2022, art. 157 e art. 247, IV.",
    periodicity: "Legislação vigente",
    sortOrder: 4,
  },
  {
    code: "CRP-05",
    category: "Legislação do Ente",
    title: "Filiação ao RPPS e regras de concessão, cálculo e reajustamento dos benefícios (art. 40 CF)",
    description:
      "Vinculação exclusiva de servidores titulares de cargo efetivo e observância dos parâmetros gerais de concessão/cálculo/reajuste.",
    legalBasis: "CF, art. 40, §1º, I-III e §§3º-5º, 7º, 8º; Lei 9.717/98, art. 1º, V; Portaria MTP 1.467/2022, art. 3º e 164.",
    periodicity: "Legislação vigente",
    sortOrder: 5,
  },
  {
    code: "CRP-06",
    category: "Fiscalização",
    title: "Aplicações financeiras (Resolução CMN) - adequação do DAIR e da Política de Investimentos",
    description: "Aferição da regularidade dos investimentos frente à Resolução CMN e à Política de Investimentos aprovada.",
    legalBasis: "Lei 9.717/98, art. 1º, §1º e art. 6º, IV-VI; Portaria MTP 1.467/2022, art. 247, IX; Resolução CMN 4.963/2021.",
    periodicity: "Auditoria indireta (mensal, via DAIR)",
    sortOrder: 6,
  },
  {
    code: "CRP-07",
    category: "Fiscalização",
    title: "Atendimento à fiscalização",
    description: "Disponibilização, no prazo, de documentos/informações solicitados por auditor fiscal do MPS.",
    legalBasis: "Lei 9.717/98, art. 9º, I e parágrafo único; Portaria MTP 1.467/2022, art. 247, XII e art. 250, III.",
    periodicity: "Sob demanda",
    sortOrder: 7,
  },
  {
    code: "CRP-08",
    category: "Fiscalização",
    title: "Caráter contributivo - repasse das contribuições",
    description: "Conformidade do repasse à unidade gestora das contribuições correntes e parcelas de parcelamentos.",
    legalBasis: "CF, art. 40, caput; Lei 9.717/98, art. 1º, II; Portaria MTP 1.467/2022, art. 7º, II, 'a'.",
    periodicity: "Auditoria indireta (bimestral, via DIPR)",
    sortOrder: 8,
  },
  {
    code: "CRP-09",
    category: "Fiscalização",
    title: "Existência e funcionamento de unidade gestora e regime próprio únicos",
    description: "Cada ente federativo deve ter apenas um RPPS e uma única unidade gestora.",
    legalBasis: "CF, art. 40, §20; EC 103/2019, art. 9º, §6º; Portaria MTP 1.467/2022, art. 71 e art. 247, V.",
    periodicity: "Verificação contínua",
    sortOrder: 9,
  },
  {
    code: "CRP-10",
    category: "Fiscalização",
    title: "Requisitos dos dirigentes, conselheiros e comitê de investimentos",
    description: "Cumprimento dos requisitos de nomeação e permanência do art. 8º-B da Lei 9.717/98.",
    legalBasis: "Lei 9.717/98, art. 8º-B; Portaria MTP 1.467/22, arts. 76 a 78 e art. 247, VII.",
    periodicity: "Auditoria indireta contínua",
    sortOrder: 10,
  },
  {
    code: "CRP-11",
    category: "Fiscalização",
    title: "Utilização dos recursos previdenciários",
    description: "Recursos usados apenas para pagamento de benefícios e custeio administrativo (taxa de administração).",
    legalBasis: "CF, art. 167, XII; Lei 9.717/98, art. 1º, III; Portaria MTP 1.467/2022, arts. 81 a 84.",
    periodicity: "Auditoria indireta (via DIPR)",
    sortOrder: 11,
  },
  {
    code: "CRP-12",
    category: "Equilíbrio Financeiro e Atuarial",
    title: "Encaminhamento de NTA, DRAA e resultados das análises",
    description: "Envio anual do Demonstrativo de Resultado da Avaliação Atuarial com as informações da avaliação do exercício.",
    legalBasis: "CF, art. 40, caput; Lei 9.717/98, art. 1º e art. 9º, parágrafo único; Portaria MTP 1.467/2022, art. 25.",
    periodicity: "Anual",
    sortOrder: 12,
  },
  {
    code: "CRP-13",
    category: "Informações Contábeis",
    title: "Envio da Matriz de Saldos Contábeis (MSC) por meio do SICONFI",
    description: "Envio mensal da MSC conforme MCASP/PCASP, até o último dia do mês seguinte à competência.",
    legalBasis: "Lei 9.717/98, art. 9º, parágrafo único; Portaria MTP 1.467/2022, art. 85 e art. 247, XIII.",
    periodicity: "Mensal",
    sortOrder: 13,
  },
  {
    code: "CRP-14",
    category: "Informações Previdenciárias e Repasses",
    title: "DIPR - Consistência e Caráter Contributivo",
    description: "Regularidade do recolhimento das contribuições patronais/servidores e do pagamento de parcelamentos.",
    legalBasis: "Lei 9.717/98, art. 1º, II/III; Portaria MTP 1.467/2022, art. 7º, II e art. 81.",
    periodicity: "Bimestral",
    sortOrder: 14,
  },
  {
    code: "CRP-15",
    category: "Informações Previdenciárias e Repasses",
    title: "DIPR - Encaminhamento",
    description: "Envio do DIPR e da declaração de veracidade até o último dia do mês seguinte ao encerramento do bimestre.",
    legalBasis: "Lei 9.717/98, art. 1º, II e art. 9º, parágrafo único; Portaria MTP 1.467/2022, art. 241, V, 'b'.",
    periodicity: "Bimestral",
    sortOrder: 15,
  },
  {
    code: "CRP-16",
    category: "Investimentos",
    title: "DPIN - Consistência",
    description: "Consistência da Política Anual de Investimentos frente à Resolução CMN vigente.",
    legalBasis: "Lei 9.717/98, art. 1º, §1º e art. 6º, IV; Resolução CMN 4.963/2021, art. 4º.",
    periodicity: "Anual",
    sortOrder: 16,
  },
  {
    code: "CRP-17",
    category: "Investimentos",
    title: "DPIN - Encaminhamento",
    description: "Envio do DPIN do exercício seguinte, junto com a Política de Investimentos aprovada, até 31/12.",
    legalBasis: "Res. CMN 4.963/21, art. 4º e 29; Portaria MTP 1.467/22, art. 101, §4º e art. 102.",
    periodicity: "Anual (até 31/12)",
    sortOrder: 17,
  },
  {
    code: "CRP-18",
    category: "Investimentos",
    title: "DAIR - Consistência",
    description: "Consistência das aplicações e investimentos frente aos limites da Resolução CMN e à Política de Investimentos.",
    legalBasis: "Lei 9.717/98, art. 1º, §1º e art. 6º, IV; Res. CMN 4.963/21, art. 29; Portaria MTP 1.467/22, art. 114.",
    periodicity: "Mensal",
    sortOrder: 18,
  },
  {
    code: "CRP-19",
    category: "Investimentos",
    title: "DAIR - Encaminhamento",
    description: "Envio mensal do DAIR e da declaração de veracidade, até o último dia do mês seguinte à competência.",
    legalBasis: "Lei 9.717/98, art. 1º, §1º e art. 6º, IV; Portaria MTP 1.467/22, art. 114 e art. 247, XIII.",
    periodicity: "Mensal",
    sortOrder: 19,
  },
  {
    code: "CRP-20",
    category: "Previdência Complementar",
    title: "Instituição do RPC - aprovação da lei",
    description: "Criação, por lei local, do Regime de Previdência Complementar, obrigatória para todos os entes com RPPS.",
    legalBasis: "CF, art. 40, §§14-16; EC 103/2019, art. 9º, §6º; Portaria MTP 1.467/2022, art. 158.",
    periodicity: "Única (obrigação permanente)",
    sortOrder: 20,
  },
  {
    code: "CRP-21",
    category: "Previdência Complementar",
    title: "Instituição do RPC - aprovação do convênio de adesão",
    description:
      "Exigível apenas para entes com servidores acima do teto do RGPS: aprovação, pela PREVIC, do convênio de adesão a um plano de benefícios.",
    legalBasis: "CF, art. 40, §§14-16; EC 103/19, art. 9º, §6º; Portaria MTP 1.467/22, art. 158.",
    periodicity: "Condicional (se houver servidores acima do teto)",
    sortOrder: 21,
  },
  {
    code: "CRP-22",
    category: "Compensação Previdenciária",
    title: "Termo de Adesão e contrato com a DATAPREV (COMPREV)",
    description: "Adesão formal ao procedimento de compensação previdenciária e contrato para uso do sistema COMPREV.",
    legalBasis: "CF, art. 40, §9º e art. 201, §§9º e 9º-A; Lei 9.717/98, art. 1º, §2º; Portaria MTP 1.467/22, art. 247, XI.",
    periodicity: "Única (obrigação permanente)",
    sortOrder: 22,
  },
];
