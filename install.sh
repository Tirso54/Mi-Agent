#!/usr/bin/env bash
set -euo pipefail

# ─── Colores ANSI ───────────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
RED="\033[31m"
MAGENTA="\033[35m"

banner() {
  echo -e ""
  echo -e "${CYAN}${BOLD}  ╔══════════════════════════════════╗${RESET}"
  echo -e "${CYAN}${BOLD}  ║        MiAgent Installer         ║${RESET}"
  echo -e "${CYAN}${BOLD}  ║   Coding Agent powered by Gemini ║${RESET}"
  echo -e "${CYAN}${BOLD}  ╚══════════════════════════════════╝${RESET}"
  echo -e ""
}

step() {
  echo -e "${CYAN}${BOLD}▶ $1${RESET}"
}

ok() {
  echo -e "${GREEN}✓ $1${RESET}"
}

warn() {
  echo -e "${YELLOW}⚠ $1${RESET}"
}

fail() {
  echo -e "${RED}✗ $1${RESET}"
}

# ─── Banner ─────────────────────────────────────────────────────────────────
banner

# ─── 1. Verificar Node.js >= 18 ─────────────────────────────────────────────
step "Verificando Node.js..."

if ! command -v node &>/dev/null; then
  fail "Node.js no encontrado."
  echo -e ""
  echo -e "${YELLOW}Instala Node.js >= 18 desde una de estas opciones:${RESET}"
  echo -e "  ${DIM}• nvm (recomendado):${RESET}  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
  echo -e "                        ${DIM}nvm install 20${RESET}"
  echo -e "  ${DIM}• Oficial:${RESET}            https://nodejs.org"
  echo -e "  ${DIM}• Termux (Android):${RESET}   pkg install nodejs"
  echo -e ""
  exit 1
fi

NODE_VER=$(node -e "process.exit(parseInt(process.versions.node.split('.')[0]) < 18 ? 1 : 0)" 2>/dev/null && node --version || echo "old")

if [[ "$NODE_VER" == "old" ]]; then
  CURRENT=$(node --version)
  fail "Node.js $CURRENT detectado. Se requiere >= 18."
  echo -e "${YELLOW}Actualiza con: nvm install 20 && nvm use 20${RESET}"
  exit 1
fi

ok "Node.js $(node --version) detectado"

# ─── 2. Crear directorio de instalación ─────────────────────────────────────
INSTALL_DIR="$HOME/.miagent"
step "Creando directorio $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
ok "Directorio listo"

# ─── 3. Descargar archivos del agente ───────────────────────────────────────
BASE_URL="https://raw.githubusercontent.com/Tirso54/MiAgent/main"
FILES=("index.js" "tools.js" "memory.js" "gemini.js")

step "Descargando archivos del agente..."

for f in "${FILES[@]}"; do
  echo -e "  ${DIM}↓ $f${RESET}"
  if ! curl -fsSL "$BASE_URL/$f" -o "$INSTALL_DIR/$f"; then
    fail "Error descargando $f"
    echo -e "${YELLOW}Verifica tu conexión o que el repo https://github.com/Tirso54/MiAgent existe y es público.${RESET}"
    exit 1
  fi
done

ok "Archivos descargados"

# ─── 4. Configurar API key ───────────────────────────────────────────────────
CONFIG_FILE="$INSTALL_DIR/config.json"

step "Configurando API key de Gemini..."

if [[ -f "$CONFIG_FILE" ]]; then
  EXISTING_KEY=$(node -e "try{const c=require('$CONFIG_FILE');console.log(c.apiKey||'')}catch(e){console.log('')}" 2>/dev/null || echo "")
  if [[ -n "$EXISTING_KEY" && "$EXISTING_KEY" != "null" ]]; then
    ok "API key existente encontrada (se conserva)"
  fi
elif [[ -n "${GEMINI_API_KEY:-}" ]]; then
  echo "{\"apiKey\":\"$GEMINI_API_KEY\"}" > "$CONFIG_FILE"
  ok "API key leída desde variable de entorno GEMINI_API_KEY"
else
  echo -e ""
  echo -e "${MAGENTA}${BOLD}Necesitas una API key gratuita de Google Gemini.${RESET}"
  echo -e "${DIM}Obtén una gratis en: https://aistudio.google.com/app/apikey${RESET}"
  echo -e ""
  printf "${CYAN}Pega tu Gemini API key: ${RESET}"
  read -r API_KEY

  if [[ -z "$API_KEY" ]]; then
    warn "No se ingresó API key. Puedes agregarla después editando: ~/.miagent/config.json"
    echo "{\"apiKey\":\"\"}" > "$CONFIG_FILE"
  else
    echo "{\"apiKey\":\"$API_KEY\"}" > "$CONFIG_FILE"
    ok "API key guardada en $CONFIG_FILE"
  fi
fi

# Permisos seguros para config
chmod 600 "$CONFIG_FILE" 2>/dev/null || true

# ─── 5. Crear comando global `miagent` ──────────────────────────────────────
step "Instalando comando 'miagent'..."

LAUNCHER_CONTENT="#!/usr/bin/env bash
node \"$INSTALL_DIR/index.js\" \"\$@\"
"

# Intentar /usr/local/bin primero, fallback a ~/bin
if [[ -w "/usr/local/bin" ]]; then
  LAUNCHER_PATH="/usr/local/bin/miagent"
  echo "$LAUNCHER_CONTENT" > "$LAUNCHER_PATH"
  chmod +x "$LAUNCHER_PATH"
  ok "Comando instalado en /usr/local/bin/miagent"
else
  LOCAL_BIN="$HOME/bin"
  mkdir -p "$LOCAL_BIN"
  LAUNCHER_PATH="$LOCAL_BIN/miagent"
  echo "$LAUNCHER_CONTENT" > "$LAUNCHER_PATH"
  chmod +x "$LAUNCHER_PATH"
  ok "Comando instalado en $LOCAL_BIN/miagent"

  # Verificar que ~/bin esté en el PATH
  if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
    warn "~/bin no está en tu PATH."
    echo -e "${DIM}Agrega esta línea a tu ~/.bashrc o ~/.zshrc:${RESET}"
    echo -e "  ${YELLOW}export PATH=\"\$HOME/bin:\$PATH\"${RESET}"
    echo -e "${DIM}Luego ejecuta: source ~/.bashrc${RESET}"
  fi
fi

# ─── 6. Mensaje final ───────────────────────────────────────────────────────
echo -e ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   ¡MiAgent instalado! Ejecuta: miagent   ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo -e ""
echo -e "${DIM}Comandos disponibles dentro del agente:${RESET}"
echo -e "  ${CYAN}/goal <desc>${RESET}  — Define un objetivo y el agente trabaja solo"
echo -e "  ${CYAN}/compose${RESET}      — Flujo estructurado: planificar → codificar → revisar"
echo -e "  ${CYAN}/memory${RESET}       — Ver la memoria persistente del proyecto"
echo -e "  ${CYAN}/clear${RESET}        — Limpiar historial de conversación"
echo -e "  ${CYAN}/exit${RESET}         — Salir"
echo -e ""
echo -e "${DIM}API key:    ${RESET}$CONFIG_FILE"
echo -e "${DIM}Archivos:   ${RESET}$INSTALL_DIR"
echo -e ""
