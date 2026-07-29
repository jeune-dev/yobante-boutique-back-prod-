# 🚀 GUIDE DÉPLOIEMENT YOBANTE - CONTABO

## 📋 PRÉ-REQUIS

### Serveur Contabo
- VPS Ubuntu 22.04 LTS ou supérieur
- RAM: 2GB minimum (4GB recommandé)
- Storage: 50GB minimum
- SSH access avec clé SSH

### Outils Locaux
- Git installed
- SSH key pair généré (`ssh-keygen -t rsa -b 4096`)
- Accès au repository privé GitHub configuré

---

## PHASE 1: Configuration Initiale du Serveur

### 1.1 SSH Connection
```bash
ssh root@YOUR_SERVER_IP
```

### 1.2 Mise à jour du système
```bash
apt-get update
apt-get upgrade -y
```

### 1.3 Installation des dépendances
```bash
apt-get install -y \
  curl wget git \
  build-essential python3 \
  docker.io docker-compose-plugin \
  nginx certbot python3-certbot-nginx \
  nodejs npm
```

### 1.4 Installation Node.js 22
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node --version  # Vérifier v22.x.x
```

### 1.5 Installation PM2 (optionnel, pour non-Docker)
```bash
npm install -g pm2
pm2 completion install
```

---

## PHASE 2: Préparation du Déploiement

### 2.1 Configuration SSH pour Repository Privé

**Sur votre machine locale:**
```bash
# Générer clé SSH si pas encore faite
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa_github

# Afficher la clé publique
cat ~/.ssh/id_rsa_github.pub
```

**Sur GitHub:**
1. Settings → SSH and GPG keys → New SSH key
2. Coller la clé publique
3. Name: "Contabo Yobante Deployment"

**Sur le serveur Contabo:**
```bash
# Copier la clé privée SSH
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Créer le fichier config SSH
cat > ~/.ssh/config << 'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_rsa_github
    AddKeysToAgent yes
EOF

chmod 600 ~/.ssh/config

# Tester la connexion
ssh -T git@github.com
```

### 2.2 Créer la structure de répertoires
```bash
mkdir -p /var/www/yobante-api
mkdir -p /var/www/yobante-api/logs
mkdir -p /var/www/yobante-api/uploads
mkdir -p /var/www/certbot

cd /var/www/yobante-api
```

### 2.3 Cloner le repository privé
```bash
# Depuis /var/www/yobante-api
git clone git@github.com:VOTRE_USERNAME/yobante-boutique-back.git .

# Vérifier le clone
git remote -v
git branch -a
```

---

## PHASE 3: Configuration Application

### 3.1 Créer .env production
```bash
cat > /var/www/yobante-api/.env << 'ENVEOF'
# Application
NODE_ENV=production
PORT=5000
CLUSTER_WORKERS=2

# Database PostgreSQL
DB_HOST=postgres
DB_PORT=5432
DB_NAME=yobante_production
DB_USER=yobante_user
DB_PASSWORD=GENERATE_SECURE_PASSWORD_HERE
DB_SSL=true
DB_POOL_MAX=20
DB_POOL_MIN=2

# JWT Secrets (générer avec: openssl rand -hex 32)
JWT_SECRET=LONG_RANDOM_SECRET_HERE
JWT_REFRESH_SECRET=DIFFERENT_LONG_SECRET_HERE
JWT_RESET_SECRET=ANOTHER_DIFFERENT_SECRET_HERE
JWT_EXPIRES_IN=1h

# CORS
CORS_ORIGIN=https://app.votredomaine.com

# Email (Resend)
RESEND_API_KEY=re_YOUR_RESEND_KEY
MAIL_FROM=noreply@yobante.com

# Admin Initial
ADMIN_EMAIL=admin@yobante.com
ADMIN_PASSWORD=STRONG_ADMIN_PASSWORD_HERE
ADMIN_NOM=Admin
ADMIN_PRENOM=Yobante

# Upload
CLOUDINARY_CLOUD_NAME=YOUR_CLOUDINARY_NAME
CLOUDINARY_API_KEY=YOUR_KEY
CLOUDINARY_API_SECRET=YOUR_SECRET

# Paiement
WAVE_API_KEY=YOUR_WAVE_KEY
WAVE_API_SECRET=YOUR_WAVE_SECRET
WAVE_API_URL=https://api.wave.com/v1

ORANGE_MONEY_API_KEY=YOUR_ORANGE_KEY
ORANGE_MONEY_API_SECRET=YOUR_ORANGE_SECRET
ORANGE_MONEY_MERCHANT_ID=YOUR_MERCHANT_ID
ORANGE_MONEY_API_URL=https://api.orange.com/orangemoney

# URLs
API_PUBLIC_URL=https://api.yobante.com
MOBILE_APP_RETURN_URL=yobante://paiement/succes

# Logging
LOG_LEVEL=info

# Frais livraison défaut
FRAIS_LIVRAISON_DEFAUT=15
ENVEOF

chmod 600 /var/www/yobante-api/.env
```

### 3.2 Installer les dépendances
```bash
cd /var/www/yobante-api
npm install --omit=dev
```

### 3.3 Exécuter les migrations DB
```bash
npm run migrate
```

### 3.4 Seeder admin (optionnel)
```bash
npm run seed:admin
```

---

## PHASE 4: Configuration Docker (Recommandé)

### 4.1 Lancer l'application Docker
```bash
cd /var/www/yobante-api

# Démarrer les services
docker compose -f docker-compose.prod.yml up -d

# Vérifier les logs
docker compose -f docker-compose.prod.yml logs -f backend

# Vérifier les services
docker compose -f docker-compose.prod.yml ps
```

### 4.2 Vérifier PostgreSQL
```bash
# Tester la connexion
docker compose -f docker-compose.prod.yml exec postgres psql -U yobante_user -d yobante_production -c "SELECT version();"
```

---

## PHASE 5: Configuration Nginx & SSL

### 5.1 Copier la configuration Nginx
```bash
# Depuis le repo
cp /var/www/yobante-api/deploy/nginx.conf /etc/nginx/sites-available/yobante-api

# Remplacer YOUR_DOMAIN par votre domaine
sed -i 's/YOUR_DOMAIN/api.yobante.com/g' /etc/nginx/sites-available/yobante-api

# Activer le site
ln -sf /etc/nginx/sites-available/yobante-api /etc/nginx/sites-enabled/yobante-api

# Désactiver le default
rm -f /etc/nginx/sites-enabled/default

# Copier WebSocket map
cp /var/www/yobante-api/deploy/nginx-websocket-map.conf /etc/nginx/conf.d/

# Tester la syntaxe Nginx
nginx -t
```

### 5.2 Obtenir le certificat SSL
```bash
certbot --nginx \
  -d api.yobante.com \
  -d www.api.yobante.com \
  --non-interactive \
  --agree-tos \
  --email admin@yobante.com \
  --redirect
```

### 5.3 Redémarrer Nginx
```bash
systemctl restart nginx
systemctl enable nginx
```

---

## PHASE 6: Configuration Firewall (UFW)

### 6.1 Configurer UFW
```bash
# Réinitialiser UFW
ufw --force reset

# Règles par défaut
ufw default deny incoming
ufw default allow outgoing

# Règles d'accès
ufw allow ssh           # Port 22
ufw allow http          # Port 80
ufw allow https         # Port 443

# Activer
ufw --force enable

# Vérifier
ufw status
```

---

## PHASE 7: Configuration du Déploiement Automatisé

### 7.1 Créer un script de déploiement
```bash
cat > /var/www/yobante-api/deploy-auto.sh << 'DEPLOYEOF'
#!/bin/bash
set -e

cd /var/www/yobante-api

# 1. Récupérer le code
echo "📥 Récupération du code..."
git pull --rebase origin main

# 2. Installer les dépendances
echo "📦 Installation des dépendances..."
npm install --omit=dev

# 3. Lancer les migrations
echo "🗄️  Migrations DB..."
docker compose -f docker-compose.prod.yml exec -T backend npm run migrate

# 4. Redémarrer les services
echo "🔄 Redémarrage des services..."
docker compose -f docker-compose.prod.yml up -d --build backend

# 5. Vérifier la santé
echo "❤️  Vérification de la santé..."
sleep 10
if curl -f http://localhost:5000/health; then
  echo "✅ Application saine!"
else
  echo "❌ Erreur - Vérifier les logs"
  docker compose -f docker-compose.prod.yml logs backend
  exit 1
fi

echo "✅ Déploiement réussi!"
DEPLOYEOF

chmod +x /var/www/yobante-api/deploy-auto.sh
```

### 7.2 Configuration Cron (mis à jour automatique)
```bash
# Ajouter au crontab (optionnel)
crontab -e

# Ajouter la ligne (1h du matin tous les jours)
0 1 * * * cd /var/www/yobante-api && ./deploy-auto.sh >> /var/www/yobante-api/logs/cron-deploy.log 2>&1
```

---

## PHASE 8: Monitoring & Logs

### 8.1 Vérifier les logs
```bash
# Logs application
docker compose -f docker-compose.prod.yml logs -f backend

# Logs Nginx
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log

# Logs Système
journalctl -u docker -f
```

### 8.2 Health Check
```bash
# Vérifier l'API
curl https://api.yobante.com/health

# Vérifier Nginx
curl -I https://api.yobante.com

# Vérifier les services
docker compose -f docker-compose.prod.yml ps
```

---

## PHASE 9: Maintenance

### 9.1 Mise à jour automatique du certificat SSL
```bash
# Certbot renouvelle automatiquement 30 jours avant expiration
certbot renew --dry-run  # Tester

# Vérifier l'installation cron
systemctl status certbot.timer
```

### 9.2 Sauvegardes PostgreSQL
```bash
# Script de sauvegarde
cat > /var/www/yobante-api/backup-db.sh << 'BACKUPEOF'
#!/bin/bash
BACKUP_DIR="/var/www/yobante-api/backups"
mkdir -p $BACKUP_DIR
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U yobante_user yobante_production | gzip > $BACKUP_DIR/yobante_$(date +%Y%m%d_%H%M%S).sql.gz
find $BACKUP_DIR -mtime +7 -delete  # Garder 7 jours
BACKUPEOF

chmod +x /var/www/yobante-api/backup-db.sh

# Ajouter au crontab
# 0 2 * * * /var/www/yobante-api/backup-db.sh
```

### 9.3 Redéploiement Manuel Rapide
```bash
cd /var/www/yobante-api
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build backend
docker compose -f docker-compose.prod.yml logs -f backend
```

---

## ✅ CHECKLIST DE DÉPLOIEMENT

- [ ] Serveur Contabo commandé et IP reçue
- [ ] SSH access configuré avec clé SSH
- [ ] Connexion SSH testée (`ssh root@SERVER_IP`)
- [ ] Dependencies installées (Docker, Node 22, Nginx, Certbot)
- [ ] Repository cloné avec SSH key (`git clone git@github.com:...`)
- [ ] .env configuré avec tous les secrets production
- [ ] Migrations DB exécutées (`npm run migrate`)
- [ ] Docker Compose démarré et fonctionnel
- [ ] Certificat SSL obtenu et configuré
- [ ] Nginx configuré et fonctionnel
- [ ] Firewall (UFW) configuré
- [ ] Health check passant (`curl /health`)
- [ ] Logs surveillés (aucune erreur)
- [ ] Cron déploiement configuré (optionnel)
- [ ] Sauvegardes DB configurées
- [ ] Domaine DNS pointant vers IP Contabo

---

## 🆘 DÉPANNAGE RAPIDE

### API non accessible
```bash
# Vérifier Docker
docker compose -f docker-compose.prod.yml ps

# Vérifier les logs app
docker compose -f docker-compose.prod.yml logs backend

# Vérifier Nginx
nginx -t
curl http://localhost:5000/health
```

### Erreur migration DB
```bash
# Vérifier la connexion
docker compose -f docker-compose.prod.yml exec postgres psql -U yobante_user -d yobante_production -c "SELECT version();"

# Relancer les migrations
docker compose -f docker-compose.prod.yml exec -T backend npm run migrate
```

### Certificat SSL expiré
```bash
# Renouveler manuellement
certbot renew --force-renewal

# Redémarrer Nginx
systemctl restart nginx
```

### Problème de permission SSH
```bash
# Vérifier les permissions
ls -la ~/.ssh/
chmod 600 ~/.ssh/id_rsa_github
chmod 644 ~/.ssh/id_rsa_github.pub

# Tester SSH
ssh -T git@github.com
```

---

## 📞 COMMANDES UTILES

```bash
# Status général
docker compose -f docker-compose.prod.yml ps
ufw status
systemctl status nginx
systemctl status certbot.timer

# Redéployer
cd /var/www/yobante-api && git pull && docker compose -f docker-compose.prod.yml up -d --build backend

# Logs temps réel
docker compose -f docker-compose.prod.yml logs -f backend

# Sauvegarde DB
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U yobante_user yobante_production | gzip > backup_$(date +%s).sql.gz

# SSH vers le serveur
ssh root@CONTABO_IP
```

---

**Document créé:** 29/07/2026  
**Adaptation:** Yobante-boutique-back sur Contabo  
**Modèle:** Sign API Deployment Pattern
