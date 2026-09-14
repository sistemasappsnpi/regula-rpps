-- Cópia opcional do PDF dentro do banco (fallback quando o arquivo não existe em disco no
-- ambiente atual) — permite mover um upload inteiro (linha + conteúdo) via SQL puro, sem precisar
-- de acesso ao sistema de arquivos do servidor.
ALTER TABLE `documento_uploads` ADD COLUMN `conteudoArquivo` LONGBLOB NULL;
