#!/usr/bin/env bash
# ============================================================
#  Yobante Boutique — Déploiement zero-downtime (mise à jour)
#  Usage : bash deploy/deploy.sh [--mode docker|pm2]
#  À lancer depuis la racine du projet sur le VPS
# ============================================================
set -euo pipefail

APP_DIR="/var/www/yobante-api"
MODE="${DEPLOY_MODE:-docker}"   # docker | pm2

# Parse --mode flag
while [[ $# -gt 0 ]]; do
    case "$1" in
        --mode) MODE="$2"; shift 2 ;;
        *) shift ;;
    esac
done

echo "[deploy] Répertoire : ${APP_DIR}"
echo "[deploy] Mode       : ${MODE}"

# 1. Se positionner dans le bon répertoire
cd "${APP_DIR}"

# 2. Vérifier que .env est présent
if [ ! -f ".env" ]; then
    echo "[deploy] ERREUR : fichier .env manquant dans ${APP_DIR}"
    echo "         Copier .env.example vers .env et remplir toutes les valeurs."
    exit 1
fi

# 3. Créer les dossiers nécessaires si absents
mkdir -p logs uploads

# 4. Backup base de données AVANT déploiement
echo "[deploy] Backup base de données..."
BACKUP_DIR="${APP_DIR}/backups"
mkdir -p "${BACKUP_DIR}"
BACKUP_FILE="${BACKUP_DIR}/yobante_$(date '+%Y%m%d_%H%M%S').sql.gz"
DB_NAME=$(grep '^DB_NAME=' .env | cut -d'=' -f2)
DB_USER=$(grep '^DB_USER=' .env | cut -d'=' -f2)
DB_HOST=$(grep '^DB_HOST=' .env | cut -d'=' -f2)

docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U "${DB_USER}" -h "${DB_HOST}" "${DB_NAME}" | gzip > "${BACKUP_FILE}" 2>/dev/null && echo "[deploy] ✅ Backup créé: ${BACKUP_FILE}" || echo "[deploy] ⚠️  Backup échoué (conteneur peut ne pas être prêt)"

# 5. Récupérer les derniers changements
echo "[deploy] git pull..."
git pull --ff-only

if [[ "$MODE" == "docker" ]]; then
    # ── Mode Docker Compose ──────────────────────────────────────────────────
    echo "[deploy] Build et rechargement des conteneurs..."
    docker compose -f docker-compose.prod.yml pull 2>/dev/null || true
    docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

    echo "[deploy] Migrations s'exécutent automatiquement au démarrage..."
    sleep 10  # Attendre que les migrations se terminent

    echo "[deploy] Statut des conteneurs :"
    docker compose -f docker-compose.prod.yml ps

    echo "[deploy] Nettoyage des images inutilisées..."
    docker image prune -f

    echo "[deploy] Vérification health..."
    sleep 5
    curl -sf http://localhost:5000/health && echo "[deploy] ✅ API opérationnelle" || echo "[deploy] ❌ Health check échoué"

elif [[ "$MODE" == "pm2" ]]; then
    # ── Mode PM2 ─────────────────────────────────────────────────────────────
    echo "[deploy] npm install..."
    npm install --omit=dev --prefer-offline

    echo "[deploy] Lancer les migrations..."
    npm run migrate

    echo "[deploy] pm2 reload (zero-downtime)..."
    pm2 reload ecosystem.config.js --env production --update-env

    echo "[deploy] Statut PM2 :"
    pm2 status yobante-api

else
    echo "[deploy] ERREUR : mode inconnu '${MODE}'. Utiliser 'docker' ou 'pm2'."
    exit 1
fi

echo ""
echo "[deploy] Déploiement terminé — $(date '+%Y-%m-%d %H:%M:%S')"
