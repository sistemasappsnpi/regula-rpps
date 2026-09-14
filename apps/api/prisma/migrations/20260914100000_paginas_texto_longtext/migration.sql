-- Documentos com muitas páginas de texto extraído passavam do limite de 64KB do TEXT puro
-- (erro P2000 ao subir um DAIR maior). LONGTEXT suporta até 4GB.
ALTER TABLE `documento_uploads` MODIFY `paginasTexto` LONGTEXT NOT NULL;
