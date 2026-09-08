#!/bin/sh
# Migra do MySQL embutido (container "mysql" do docker-compose.prod.yml) pra um banco externo
# dedicado, em um passo só: exporta o banco atual, importa no banco novo, atualiza DATABASE_URL
# no .env.production e reinicia a API pra já consultar o banco novo. Roda no servidor de
# produção, de dentro da pasta do projeto (onde está o .env.production).
#
# Uso:
#   ./scripts/migrate-to-external-db.sh <host> <porta> <usuario> <senha> <nome_do_banco>
#
# Exemplo:
#   ./scripts/migrate-to-external-db.sh db01.npibrasil.com 3306 previdencianpi_user 'S3nh@Forte' previdencianpi_db
set -e

HOST="$1"; PORT="$2"; DBUSER="$3"; DBPASS="$4"; DBNAME="$5"

if [ -z "$HOST" ] || [ -z "$PORT" ] || [ -z "$DBUSER" ] || [ -z "$DBPASS" ] || [ -z "$DBNAME" ]; then
  echo "Uso: $0 <host> <porta> <usuario> <senha> <nome_do_banco>"
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"

if [ ! -f .env.production ]; then
  echo "ERRO: .env.production não encontrado nesta pasta. Rode este script de dentro do projeto, no servidor de produção."
  exit 1
fi

COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"

echo "==> 1/4 — Exportando o banco atual (embutido)..."
$COMPOSE exec -T mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" regula_rpps' > backup.sql
if [ ! -s backup.sql ]; then
  echo "ERRO: backup.sql ficou vazio — abortei sem mexer em mais nada. Confira se o container 'mysql' está rodando."
  exit 1
fi
echo "    Backup gerado: $(wc -l < backup.sql) linhas."

echo "==> 2/4 — Importando no banco novo ($HOST:$PORT/$DBNAME)..."
docker run --rm -i --network host -v "$(pwd)/backup.sql:/backup.sql" mysql:8.4 \
  sh -c "mysql -h '$HOST' -P '$PORT' -u '$DBUSER' -p'$DBPASS' '$DBNAME' < /backup.sql"

echo "==> 3/4 — Atualizando DATABASE_URL no .env.production..."
cp .env.production .env.production.bak-antes-da-migracao
NEW_URL="mysql://${DBUSER}:${DBPASS}@${HOST}:${PORT}/${DBNAME}"
if grep -q '^DATABASE_URL=' .env.production; then
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=${NEW_URL}#" .env.production
else
  echo "DATABASE_URL=${NEW_URL}" >> .env.production
fi

echo "==> 4/4 — Reiniciando a API já apontando pro banco novo..."
$COMPOSE up -d api

echo ""
echo "Pronto. Confira o site — se logar e os dados estiverem lá, migrou certo."
echo ""
echo "Depois de confirmar (e só depois), apague os arquivos com dado sensível:"
echo "    rm backup.sql .env.production.bak-antes-da-migracao"
echo ""
echo "Se algo der errado e precisar voltar pro banco embutido:"
echo "    cp .env.production.bak-antes-da-migracao .env.production"
echo "    docker compose --profile local-db --env-file .env.production -f docker-compose.prod.yml up -d"
