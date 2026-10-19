#!/usr/bin/env bash
#
# deploy-admin.sh — liefert das Admin-Panel (admin-site/) versioniert an Strato aus.
#
#   scripts/deploy-admin.sh                     aktuellen Stand (HEAD) ausliefern
#   scripts/deploy-admin.sh --ref admin-v1.4.0  frühere Version zurückrollen
#   scripts/deploy-admin.sh --dry-run           nur anzeigen, was hochgeladen würde
#
# Ablauf:
#   1. Stand aus Git exportieren (nie aus dem Arbeitsverzeichnis) — bei HEAD muss
#      admin-site/ committet sein, damit Version und Commit eindeutig sind.
#   2. version.js mit Version (admin-site/VERSION), Commit und Zeitpunkt erzeugen.
#   3. Per SFTP nach htdocs/avadmin hochladen (README, CHANGELOG, VERSION nicht).
#   4. Live-Dateien unter https://milan-muc.de/avadmin/ per SHA-256 prüfen.
#   5. Git-Tag admin-v<Version> setzen (lokal; Push mit --push-tag).
#
# Zugangsdaten: netrc-Datei (Default ~/.avora-sftp.netrc, überschreibbar mit
# ADMIN_SFTP_NETRC) mit "login <user> password <pw>"; Host: SFTP_HOST unten
# (überschreibbar mit ADMIN_SFTP_HOST).
# Das Passwort wird nur per SSH_ASKPASS an sftp gereicht, nie ausgegeben.
# Host-Schlüssel von Strato: scripts/admin-deploy.known_hosts.

set -euo pipefail

SFTP_HOST="${ADMIN_SFTP_HOST:-5019726313.ssh.w2.strato.hosting}"
REMOTE_DIR="htdocs/avadmin"
LIVE_URL="https://milan-muc.de/avadmin"
EXCLUDE_RE='^(README\.md|CHANGELOG\.md|VERSION)$'

REF="HEAD"
DRY_RUN=0
PUSH_TAG=0
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --push-tag) PUSH_TAG=1; shift ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KNOWN_HOSTS="$SCRIPT_DIR/admin-deploy.known_hosts"
NETRC="${ADMIN_SFTP_NETRC:-$HOME/.avora-sftp.netrc}"

die() { echo "FEHLER: $*" >&2; exit 1; }

COMMIT_FULL="$(git rev-parse --verify "$REF^{commit}")" || die "Ref '$REF' nicht gefunden."
COMMIT="$(git rev-parse --short "$COMMIT_FULL")"

if [ "$REF" = "HEAD" ] && [ -n "$(git -C "$ROOT" status --porcelain -- admin-site)" ]; then
  die "admin-site/ hat nicht committete Änderungen — erst committen, dann ausliefern."
fi

# ── 1. Stand exportieren ──────────────────────────────────────────────────────
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git -C "$ROOT" archive "$COMMIT_FULL" admin-site | tar -x -C "$WORK"
SITE="$WORK/admin-site"
[ -f "$SITE/index.html" ] || die "admin-site/ fehlt in $REF."

if [ -f "$SITE/VERSION" ]; then
  VERSION="$(tr -d ' \r\n' < "$SITE/VERSION")"
  echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "admin-site/VERSION ungültig: '$VERSION'"
else
  VERSION=""   # Stand vor Einführung der Versionierung
fi
TAG="admin-v$VERSION"

if [ -n "$VERSION" ] && TAGGED="$(git rev-parse -q --verify "refs/tags/$TAG^{commit}")"; then
  if [ "$TAGGED" != "$COMMIT_FULL" ]; then
    die "Tag $TAG zeigt schon auf $(git rev-parse --short "$TAGGED") — admin-site/VERSION erhöhen und CHANGELOG ergänzen."
  fi
fi

# ── 2. version.js erzeugen ────────────────────────────────────────────────────
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$SITE/version.js" <<EOF
/* Automatisch erzeugt von scripts/deploy-admin.sh — nicht von Hand ändern. */
window.ADMIN_VERSION = { version: '${VERSION:-$COMMIT}', commit: '$COMMIT', deployedAt: '$DEPLOYED_AT' };
EOF

# ── 3. Hochladen ──────────────────────────────────────────────────────────────
FILES="$(cd "$SITE" && find . -type f | sed 's|^\./||' | grep -Ev "$EXCLUDE_RE" | sort)"
DIRS="$(printf '%s\n' "$FILES" | grep / | sed 's|/[^/]*$||' | sort -u || true)"

echo "Admin-Panel ${VERSION:+v$VERSION }($COMMIT) → $LIVE_URL/"
printf '  %s\n' $FILES

BATCH="$WORK/batch.txt"
{
  echo "-mkdir $REMOTE_DIR"
  for d in $DIRS; do echo "-mkdir $REMOTE_DIR/$d"; done
  echo "cd $REMOTE_DIR"
  # index.html zuletzt: erst wenn alle Skripte liegen, lädt die neue Seite sie.
  for f in $(printf '%s\n' "$FILES" | grep -v '^index\.html$') index.html; do
    echo "put \"$SITE/$f\" \"$f\""
  done
} > "$BATCH"

if [ "$DRY_RUN" = 1 ]; then
  echo "(Probelauf — nichts hochgeladen)"
  exit 0
fi

[ -f "$NETRC" ] || die "Zugangsdaten fehlen: $NETRC"
USER_NAME="$(awk '{for(i=1;i<NF;i++) if($i=="login") {print $(i+1); exit}}' "$NETRC")"
[ -n "$USER_NAME" ] || die "login fehlt in $NETRC"

ASKPASS="$WORK/askpass.sh"
cat > "$ASKPASS" <<EOF
#!/bin/sh
awk '{for(i=1;i<NF;i++) if(\$i=="password") {print \$(i+1); exit}}' "$NETRC"
EOF
chmod 700 "$ASKPASS"

SSH_ASKPASS="$ASKPASS" SSH_ASKPASS_REQUIRE=force DISPLAY=:0 sftp \
  -o BatchMode=no -o PubkeyAuthentication=no -o NumberOfPasswordPrompts=1 \
  -o UserKnownHostsFile="$KNOWN_HOSTS" -o StrictHostKeyChecking=yes \
  -b "$BATCH" "$USER_NAME@$SFTP_HOST" < /dev/null > "$WORK/sftp.log" 2>&1 \
  || { cat "$WORK/sftp.log" >&2; die "SFTP-Upload fehlgeschlagen."; }
echo "Hochgeladen: $(grep -c '^sftp> put' "$WORK/sftp.log") Dateien."

# ── 4. Live prüfen ────────────────────────────────────────────────────────────
FAILED=0
for f in $FILES; do
  case "$f" in .htaccess) continue ;; esac   # wird vom Server nicht ausgeliefert
  want="$(sha256sum < "$SITE/$f" | cut -d' ' -f1)"
  got="$(curl -fsS "$LIVE_URL/$f?nocache=$DEPLOYED_AT" | sha256sum | cut -d' ' -f1 || true)"
  if [ "$want" = "$got" ]; then echo "  ok      $f"; else echo "  ABWEICH $f"; FAILED=1; fi
done
[ "$FAILED" = 0 ] || die "Live-Stand weicht ab — Upload prüfen."

# ── 5. Git-Tag ────────────────────────────────────────────────────────────────
if [ -z "$VERSION" ]; then
  echo "Fertig: Stand $COMMIT live (ohne Versionsnummer, kein Tag)."
elif git rev-parse -q --verify "refs/tags/$TAG" > /dev/null; then
  echo "Fertig: $TAG live (Tag bestand bereits)."
else
  git tag -a "$TAG" "$COMMIT_FULL" -m "Admin-Panel $VERSION ausgeliefert $DEPLOYED_AT"
  echo "Fertig: $TAG live, Tag gesetzt."
  if [ "$PUSH_TAG" = 1 ]; then git push origin "$TAG"; else echo "  Tag teilen: git push origin $TAG"; fi
fi
