#!/bin/bash
# ============================================================
# Génère les secrets sécurisés pour production
# Usage: bash scripts/generate-secrets.sh
# ============================================================

set -e

echo "🔐 Génération des secrets production Yobante Boutique"
echo "======================================================"
echo ""

# Générer JWT secrets
echo "📝 JWT Secrets (à copier dans GitHub Secrets et .env):"
echo ""

JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_RESET_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
DB_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

echo "JWT_SECRET=${JWT_SECRET}"
echo "JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}"
echo "JWT_RESET_SECRET=${JWT_RESET_SECRET}"
echo ""

echo "🗄️  Base de données:"
echo "DB_PASSWORD=${DB_PASSWORD}"
echo ""

echo "✅ Secrets générés!"
echo ""
echo "📋 Prochaines étapes:"
echo "1. Copier les secrets ci-dessus dans le fichier .env (sur le VPS)"
echo "2. Générer une clé SSH: ssh-keygen -t rsa -b 4096 -f ~/.ssh/yobante_contabo"
echo "3. Ajouter les secrets GitHub: https://github.com/YOUR_USERNAME/yobante-boutique-back/settings/secrets/actions"
echo "   - VPS_HOST = IP de Contabo"
echo "   - VPS_USER = root"
echo "   - VPS_SSH_KEY = contenu de ~/.ssh/yobante_contabo"
echo ""
echo "⚠️  IMPORTANT: Changer ADMIN_PASSWORD et ADMIN_EMAIL dans .env!"
echo ""
