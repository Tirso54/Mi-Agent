'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.miagent', 'config.json');
const MEMORY_FILENAME = 'MEMORY.md';

// ─── Config ──────────────────────────────────────────────────────────────────

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveConfig(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

// ─── Memory (MEMORY.md) ──────────────────────────────────────────────────────

/**
 * Retorna la ruta a MEMORY.md en el directorio de trabajo actual.
 */
function getMemoryPath() {
  return path.join(process.cwd(), MEMORY_FILENAME);
}

/**
 * Lee MEMORY.md del directorio actual. Devuelve string vacío si no existe.
 */
function readMemory() {
  const memPath = getMemoryPath();
  try {
    return fs.readFileSync(memPath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Escribe o reemplaza MEMORY.md en el directorio actual.
 */
function writeMemory(content) {
  const memPath = getMemoryPath();
  fs.writeFileSync(memPath, content, 'utf8');
}

/**
 * Agrega texto al final de MEMORY.md (con separador).
 */
function appendMemory(content) {
  const existing = readMemory();
  const separator = existing ? '\n\n---\n\n' : '';
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  writeMemory(`${existing}${separator}<!-- ${timestamp} -->\n${content}`);
}

/**
 * Actualiza la sección de objetivo en MEMORY.md.
 */
function updateGoalInMemory(goal) {
  const memPath = getMemoryPath();
  let content = readMemory();

  const goalSection = `## Objetivo Actual\n\n${goal}\n`;
  const goalRegex = /## Objetivo Actual[\s\S]*?(?=\n##|$)/;

  if (goalRegex.test(content)) {
    content = content.replace(goalRegex, goalSection);
  } else {
    const header = content.startsWith('# ') ? '' : '# Memoria del Proyecto\n\n';
    content = header + content + (content ? '\n\n' : '') + goalSection;
  }

  fs.writeFileSync(memPath, content, 'utf8');
}

/**
 * Genera un resumen de la sesión para guardar en MEMORY.md.
 * Extrae los puntos clave de la conversación.
 */
function buildSessionSummary(messages, goal) {
  const lines = [];

  if (goal) {
    lines.push(`**Objetivo trabajado:** ${goal}`);
  }

  // Extraer comandos ejecutados y archivos escritos
  const toolLines = messages
    .filter(m => m.role === 'model')
    .flatMap(m => m.parts.map(p => p.text || ''))
    .join('\n')
    .split('\n')
    .filter(l => l.startsWith('[TOOL:'));

  if (toolLines.length > 0) {
    lines.push('**Acciones realizadas:**');
    toolLines.slice(0, 10).forEach(l => lines.push(`- \`${l}\``));
  }

  return lines.join('\n');
}

module.exports = {
  loadConfig,
  saveConfig,
  readMemory,
  writeMemory,
  appendMemory,
  updateGoalInMemory,
  buildSessionSummary,
  getMemoryPath,
};
