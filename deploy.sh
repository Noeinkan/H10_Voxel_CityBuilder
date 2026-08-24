#!/usr/bin/env bash
# deploy.sh — pubblica questa repo su https://voxelcity.77.42.70.26.nip.io
#
#   bash deploy.sh              deploy di origin/main (l'ultimo commit pushato)
#   bash deploy.sh --dry-run    mostra cosa partirebbe, senza toccare il server
#   bash deploy.sh --rollback   torna all'ultimo commit andato a buon fine
#
# Il server clona dal remote, non dal portatile: quello che non hai committato e
# pushato non va online. Per questo il controllo qui sotto è un avviso e non un
# blocco — serve a non farti credere di aver pubblicato modifiche locali.
#
# La configurazione sta in .deploy/; la meccanica (upload, build, health check,
# certificato, smoke test, rollback) sta nel skill hetzner-site.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="${HETZNER_SITE_SKILL:-$HOME/.claude/skills/hetzner-site}"
DEPLOY="$SKILL_DIR/bin/site-deploy.sh"

[ -f "$DEPLOY" ] || {
  echo "ERRORE: skill hetzner-site non trovato in $SKILL_DIR" >&2
  echo "        Impostane il percorso con HETZNER_SITE_SKILL=/path/to/hetzner-site" >&2
  exit 2
}

cd "$REPO_ROOT"

# Un albero sporco non è un errore, ma va detto: il deploy ignora il non pushato.
if [ -n "$(git status --porcelain)" ]; then
  echo "AVVISO: ci sono modifiche non committate — non finiranno online."
fi
# Senza il fetch il confronto userebbe un origin/main stantio, cioè un avviso
# che tace proprio quando servirebbe.
git fetch --quiet origin main 2>/dev/null || true
LOCAL="$(git rev-parse HEAD 2>/dev/null || true)"
REMOTE="$(git rev-parse FETCH_HEAD 2>/dev/null || git rev-parse origin/main 2>/dev/null || true)"
if [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
  echo "AVVISO: HEAD locale ($(git rev-parse --short HEAD)) non è origin/main"
  echo "        (${REMOTE:0:7}) — online va origin/main."
fi

exec bash "$DEPLOY" "$@"
