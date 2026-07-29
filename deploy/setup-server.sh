#!/usr/bin/env bash
# ============================================================
#  Yobante Boutique — Setup initial VPS Ubuntu 22.04 / 24.04
#  Usage  : sudo bash deploy/setup-server.sh [--domain api.example.com]
#  Lancer UNE SEULE FOIS après le premier login root sur le VPS
# ============================================================
set -euo pipefail

# ── Paramètres configurables ─────────────────────────────────────────────────
APP_USER="nodeapp"
APP_DIR="/var/www/yobante-api"
NODE_VERSION="22"
DOMAIN="${DOMAIN:-YOUR_DOMAIN}"   # passer via : DOMAIN=api.yobante.com sudo bash setup-server.sh

# Parse --domain flag
while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="$2"; shift 2 ;;
        *) shift ;;
    esac
done

if [[ "$DOMAIN" == "YOUR_DOMAIN" ]]; then
    echo "ATTENTION : DOMAIN non défini. Utilisation : DOMAIN=api.example.com sudo bash setup-server.sh"
    echo "           Ou : sudo bash deploy/setup-server.sh --domain api.example.com"
    exit 1
fi

echo "==> [1/10] Mise à jour des paquets"
apt-get update -qq && apt-get upgrade -y -qq

echo "==> [2/10] Installation des dépendances système"
apt-get install -y -qq \
    curl wget git ufw \
    nginx certbot python3-certbot-nginx \
    postgresql postgresql-contrib \
    libvips libvips-dev \
    ca-certificates \
    docker.io docker-compose-plugin

echo "==> [3/10] Installation Node.js ${NODE_VERSION} via NodeSource"
curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
apt-get install -y -qq nodejs

echo "==> [4/10] Installation PM2 globalement"
npm install -g pm2

echo "==> [5/10] Création de l'utilisateur applicatif '${APP_USER}'"
id "${APP_USER}" &>/dev/null || useradd -m -s /bin/bash "${APP_USER}"
usermod -aG docker "${APP_USER}"

echo "==> [6/10] Création de l'arborescence de l'application"
mkdir -p "${APP_DIR}"
mkdir -p "${APP_DIR}/logs"
mkdir -p "${APP_DIR}/uploads"
mkdir -p "/var/www/certbot"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
chmod 750 "${APP_DIR}"

echo "==> [7/10] Configuration du pare-feu (UFW)"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> [8/10] Configuration Nginx"
# Copier le fichier WebSocket map dans conf.d
cp "$(dirname "$0")/nginx-websocket-map.conf" /etc/nginx/conf.d/websocket-map.conf

# Copier et activer le site
cp "$(dirname "$0")/nginx.conf" /etc/nginx/sites-available/yobante-api
sed -i "s/YOUR_DOMAIN/${DOMAIN}/g" /etc/nginx/sites-available/yobante-api
ln -sf /etc/nginx/sites-available/yobante-api /etc/nginx/sites-enabled/yobante-api
rm -f /etc/nginx/sites-enabled/default

# Test syntaxe Nginx avant rechargement
nginx -t && systemctl reload nginx

echo "==> [9/10] Obtention du certificat SSL via Certbot"
certbot --nginx \
    -d "${DOMAIN}" \
    --non-interactive \
    --agree-tos \
    --email "admin@${DOMAIN}" \
    --redirect

echo "==> [10/10] Configuration du renouvellement automatique des certificats"
# Certbot installe un timer systemd automatiquement — vérification :
systemctl status certbot.timer --no-pager || true
# Ajouter une vérification cron en secours
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -

echo ""
echo "============================================"
echo " Setup terminé pour ${DOMAIN} !"
echo ""
echo " Étapes suivantes :"
echo "   1. git clone <repo> ${APP_DIR}"
echo "   2. cd ${APP_DIR}"
echo "   3. cp .env.example .env && nano .env   (remplir TOUTES les valeurs)"
echo ""
echo " Option A — Docker Compose (recommandé) :"
echo "   4. docker compose -f docker-compose.prod.yml up -d --build"
echo "   5. docker compose -f docker-compose.prod.yml logs -f backend"
echo ""
echo " Option B — PM2 direct :"
echo "   4. npm install --omit=dev"
echo "   5. npm run pm2:start"
echo "   6. pm2 save && pm2 startup (suivre les instructions)"
echo "============================================"
