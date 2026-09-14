import { prisma } from "./src/db/prisma";

async function main() {
  const docs = await prisma.documentoPersonalizado.findMany({ select: { id: true, codigo: true, nome: true, ativo: true } });
  console.log("documentos_personalizados:", docs);
  const portalDocs = await prisma.portalDocumento.findMany({ select: { id: true, codigo: true, nome: true } });
  console.log("portal_documentos:", portalDocs);
  const tipos = await prisma.construtorTipoDocumento.findMany({ select: { id: true, nome: true, referenciaTipo: true, ativo: true } });
  console.log("construtor_tipos_documento:", tipos);
}

main().catch(console.error).finally(() => prisma.$disconnect());
