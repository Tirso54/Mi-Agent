#!/usr/bin/env node
'use strict';

const readline = require('readline');
const os = require('os');
const path = require('path');
const { callGemini, buildSystemPrompt } = require('./gemini.js');
const { parseAndExecuteTools } = require('./tools.js');
const {
  readMemory,
  writeMemory,
  appendMemory,
  updateGoalInMemory,
  buildSessionSummary,
  loadConfig,
} = require('./memory.js');

// ─── Colores ANSI ─────────────────────────────────────────────────────────────
const C = {
  reset:    '\x1b[0m',
  bold:     '\x1b[1m',
  dim:      '\x1b[2m',
  italic:   '\x1b[3m',
  green:    '\x1b[32m',
  yellow:   '\x1b[33m',
  red:      '\x1b[31m',
  cyan:     '\x1b[36m',
  magenta:  '\x1b[35m',
  blue:     '\x1b[34m',
  white:    '\x1b[37m',
  bgBlue:   '\x1b[44m',
  bgGreen:  '\x1b[42m',
  bgMagenta:'\x1b[45m',
};

// ─── Estado global ────────────────────────────────────────────────────────────
let conversationHistory = [];  // [{role, parts:[{text}]}]
let currentGoal = null;
let isProcessing = false;

// ─── UI helpers ───────────────────────────────────────────────────────────────

function clearLine() {
  process.stdout.write('\r\x1b[K');
}

function printBanner() {
  console.clear();
  console.log('');
  console.log(`${C.cyan}${C.bold}  ╔═══════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ║    MiAgent — Coding Agent  v1.0.0         ║${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ║    Powered by Gemini 2.0 Flash            ║${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ╚═══════════════════════════════════════════╝${C.reset}`);
  console.log('');
  console.log(`${C.dim}  Directorio: ${process.cwd()}${C.reset}`);
  console.log(`${C.dim}  Comandos: /goal /compose /memory /clear /exit /help${C.reset}`);
  console.log('');
}

function printHelp() {
  console.log('');
  console.log(`${C.cyan}${C.bold}Comandos disponibles:${C.reset}`);
  console.log(`  ${C.yellow}/goal <desc>${C.reset}    Define un objetivo; el agente trabaja autónomamente hasta lograrlo`);
  console.log(`  ${C.yellow}/compose${C.reset}        Flujo estructurado: planificar → codificar → revisar → finalizar`);
  console.log(`  ${C.yellow}/memory${C.reset}         Ver MEMORY.md del proyecto actual`);
  console.log(`  ${C.yellow}/memory save${C.reset}    Guarda un resumen de la sesión en MEMORY.md`);
  console.log(`  ${C.yellow}/clear${C.reset}          Limpiar historial de conversación`);
  console.log(`  ${C.yellow}/exit${C.reset}           Salir de MiAgent`);
  console.log(`  ${C.yellow}/help${C.reset}           Mostrar esta ayuda`);
  console.log('');
  console.log(`${C.dim}  El agente puede leer/escribir archivos y ejecutar comandos.${C.reset}`);
  console.log(`${C.dim}  Siempre pedirá confirmación antes de ejecutar una herramienta.${C.reset}`);
  console.log('');
}

function printDivider(char = '─', color = C.dim) {
  const width = Math.min(process.stdout.columns || 80, 80);
  console.log(`${color}${char.repeat(width)}${C.reset}`);
}

function printThinking() {
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  return setInterval(() => {
    process.stdout.write(`\r${C.dim}${frames[i]} Pensando...${C.reset}`);
    i = (i + 1) % frames.length;
  }, 100);
}

/**
 * Renderiza markdown básico en terminal con colores ANSI.
 */
function renderMarkdown(text) {
  return text
    // Bloques de código con lenguaje
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      const header = lang ? `${C.dim}[${lang}]${C.reset}\n` : '';
      const border = `${C.dim}${'─'.repeat(50)}${C.reset}`;
      return `\n${border}\n${header}${C.green}${code.trim()}${C.reset}\n${border}`;
    })
    // Código inline
    .replace(/`([^`]+)`/g, `${C.yellow}$1${C.reset}`)
    // Negritas
    .replace(/\*\*(.+?)\*\*/g, `${C.bold}$1${C.reset}`)
    // Cursiva
    .replace(/\*(.+?)\*/g, `${C.italic}$1${C.reset}`)
    // Headers
    .replace(/^### (.+)$/gm, `${C.cyan}${C.bold}$1${C.reset}`)
    .replace(/^## (.+)$/gm, `${C.magenta}${C.bold}$1${C.reset}`)
    .replace(/^# (.+)$/gm, `${C.blue}${C.bold}═ $1 ═${C.reset}`)
    // Listas
    .replace(/^- (.+)$/gm, `  ${C.cyan}•${C.reset} $1`)
    .replace(/^\d+\. (.+)$/gm, `  ${C.yellow}$&${C.reset}`)
    // Tool markers (internos)
    .replace(/✓ _(.+?)_/g, `${C.green}✓ $1${C.reset}`);
}

function printAgentResponse(text) {
  console.log('');
  printDivider('─', C.dim);
  console.log(`${C.magenta}${C.bold}◆ MiAgent${C.reset}`);
  printDivider('─', C.dim);
  console.log('');
  console.log(renderMarkdown(text));
  console.log('');
}

function printUserLabel() {
  console.log('');
  printDivider('─', C.dim);
  process.stdout.write(`${C.cyan}${C.bold}▶ Tú${C.reset} `);
}

function printSystem(msg, color = C.cyan) {
  console.log(`\n${color}${C.bold}⚙ ${msg}${C.reset}\n`);
}

function printError(msg) {
  console.log(`\n${C.red}${C.bold}✗ Error: ${msg}${C.reset}\n`);
}

// ─── Gemini chat ──────────────────────────────────────────────────────────────

/**
 * Envía un mensaje al agente y procesa la respuesta incluyendo tool calls.
 * Permite múltiples rondas de tool execution en una sola llamada al usuario.
 */
async function chat(userText, autoConfirmTools = false) {
  if (!userText.trim()) return;

  // Agregar mensaje del usuario al historial
  conversationHistory.push({
    role: 'user',
    parts: [{ text: userText }],
  });

  const memory = readMemory();
  const systemPrompt = buildSystemPrompt(memory);

  let spinner = printThinking();

  try {
    let response = await callGemini(conversationHistory, systemPrompt);
    clearLine();

    // Agregar respuesta al historial
    conversationHistory.push({
      role: 'model',
      parts: [{ text: response }],
    });

    // Mostrar respuesta
    printAgentResponse(response);

    // Ejecutar herramientas si las hay
    const toolCallCount = (response.match(/\[TOOL:/g) || []).length;
    if (toolCallCount > 0) {
      const { toolResults } = await parseAndExecuteTools(response, autoConfirmTools);

      if (toolResults.length > 0) {
        // Construir mensaje de resultados de herramientas
        const toolResultText = toolResults
          .map(r => `Herramienta: ${r.tool}\nArgumentos: ${r.arg}\nResultado (${r.success ? 'éxito' : 'error'}):\n${r.output}`)
          .join('\n\n---\n\n');

        // Agregar resultados como mensaje del usuario (patrón de tool result)
        conversationHistory.push({
          role: 'user',
          parts: [{ text: `[Resultados de herramientas ejecutadas]:\n${toolResultText}` }],
        });

        // Obtener respuesta del agente con los resultados
        spinner = printThinking();
        const followUp = await callGemini(conversationHistory, systemPrompt);
        clearLine();

        conversationHistory.push({
          role: 'model',
          parts: [{ text: followUp }],
        });

        printAgentResponse(followUp);

        // Ejecutar herramientas adicionales si el follow-up también las tiene
        const moreTools = (followUp.match(/\[TOOL:/g) || []).length;
        if (moreTools > 0) {
          await parseAndExecuteTools(followUp, autoConfirmTools);
        }
      }
    }

  } catch (err) {
    clearLine();
    if (spinner) clearInterval(spinner);
    printError(err.message);
    // Quitar el último mensaje del usuario si falló (para no contaminar el historial)
    conversationHistory.pop();
  }
}

// ─── Comandos ─────────────────────────────────────────────────────────────────

async function cmdGoal(description) {
  if (!description.trim()) {
    printError('Uso: /goal <descripción del objetivo>');
    return;
  }

  currentGoal = description.trim();
  updateGoalInMemory(currentGoal);

  printSystem(`Objetivo definido: "${currentGoal}"`, C.green);
  console.log(`${C.dim}El agente trabajará autónomamente hasta completarlo.${C.reset}`);
  console.log(`${C.dim}Puede ejecutar múltiples pasos. Cada herramienta pedirá confirmación.${C.reset}\n`);

  const goalPrompt = `Tengo un objetivo claro para esta sesión:

**Objetivo:** ${currentGoal}

Por favor:
1. Analiza el objetivo y descomponlo en pasos concretos.
2. Lista las herramientas que necesitarás usar (read_file, write_file, run_command, list_files).
3. Empieza a trabajar inmediatamente. Usa las herramientas necesarias paso a paso.
4. Al terminar cada paso importante, explica qué hiciste y cuál es el siguiente paso.
5. Cuando hayas completado el objetivo, indícalo claramente con "✅ Objetivo completado:" y un resumen.`;

  await chat(goalPrompt, false);
}

async function cmdCompose() {
  printSystem('Iniciando flujo /compose', C.magenta);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));

  console.log(`${C.magenta}${C.bold}Flujo estructurado de desarrollo:${C.reset}`);
  console.log(`${C.dim}Fases: Planificar → Codificar → Revisar → Finalizar${C.reset}\n`);

  const topic = await ask(`${C.cyan}¿Qué quieres construir o resolver? ${C.reset}`);
  rl.close();

  if (!topic.trim()) {
    printError('Necesitas describir qué quieres construir.');
    return;
  }

  // FASE 1: Planificar
  console.log(`\n${C.yellow}${C.bold}[FASE 1/4] PLANIFICAR${C.reset}`);
  printDivider();

  await chat(`Estamos en un flujo /compose.

FASE 1 - PLANIFICAR:
El usuario quiere: "${topic}"

Por favor crea un plan detallado:
1. **Análisis del problema**: ¿Qué exactamente se necesita?
2. **Arquitectura propuesta**: Estructura de archivos, tecnologías, patrones.
3. **Lista de tareas**: Pasos ordenados para implementar la solución.
4. **Posibles riesgos o dependencias**: ¿Qué podría salir mal?

Sé específico y técnico. Este plan guiará las siguientes fases.`);

  // FASE 2: Codificar
  console.log(`\n${C.green}${C.bold}[FASE 2/4] CODIFICAR${C.reset}`);
  printDivider();

  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const go2 = await new Promise(res => rl2.question(`${C.cyan}¿El plan es correcto? Ajustes o [Enter para continuar]: ${C.reset}`, res));
  rl2.close();

  const adjustNote = go2.trim() ? `\nNota del usuario: ${go2}` : '';

  await chat(`FASE 2 - CODIFICAR:
${adjustNote}

Ahora implementa la solución del plan. Para cada archivo:
- Usa [TOOL:write_file:ruta]\\ncontenido\\n[/TOOL] para crear los archivos.
- Si necesitas leer archivos existentes, usa [TOOL:read_file] ruta.
- Si necesitas ejecutar comandos (install deps, etc.), usa [TOOL:run_command] comando.
- Genera código completo, sin placeholders como "// TODO" o "...".
- Explica cada decisión técnica importante.`);

  // FASE 3: Revisar
  console.log(`\n${C.blue}${C.bold}[FASE 3/4] REVISAR${C.reset}`);
  printDivider();

  await chat(`FASE 3 - REVISAR:

Revisa el código generado. Para cada archivo relevante:
1. Usa [TOOL:read_file] para leer los archivos creados.
2. Identifica: bugs, problemas de seguridad, falta de validaciones, errores de lógica.
3. Si hay algo que corregir, usa [TOOL:write_file] para la versión corregida.
4. Verifica que las dependencias estén correctas.
5. Si es posible, ejecuta el código con [TOOL:run_command] para confirmar que funciona.`);

  // FASE 4: Finalizar
  console.log(`\n${C.cyan}${C.bold}[FASE 4/4] FINALIZAR${C.reset}`);
  printDivider();

  await chat(`FASE 4 - FINALIZAR:

Haz un resumen completo de lo que se construyó:
1. **Lista de archivos creados/modificados** con su propósito.
2. **Instrucciones de uso**: ¿Cómo lo ejecuta el usuario?
3. **Dependencias**: ¿Qué necesita instalar?
4. **Próximos pasos sugeridos**: ¿Qué se podría mejorar o agregar?

Guarda un resumen del proyecto en MEMORY.md usando [TOOL:write_file:MEMORY.md].`);

  console.log(`\n${C.green}${C.bold}✓ Flujo /compose completado${C.reset}\n`);
}

async function cmdMemory(subCmd) {
  if (subCmd === 'save') {
    const summary = buildSessionSummary(conversationHistory, currentGoal);
    if (summary) {
      appendMemory(summary);
      printSystem('Resumen de sesión guardado en MEMORY.md', C.green);
    } else {
      printSystem('No hay suficiente actividad para guardar en memoria.', C.yellow);
    }
    return;
  }

  const content = readMemory();
  const memPath = require('./memory.js').getMemoryPath();

  console.log('');
  printDivider('═', C.cyan);
  console.log(`${C.cyan}${C.bold}MEMORY.md — ${memPath}${C.reset}`);
  printDivider('═', C.cyan);

  if (!content.trim()) {
    console.log(`${C.dim}  (vacío — no hay memoria para este proyecto)${C.reset}`);
    console.log(`${C.dim}  Tip: usa /memory save para guardar un resumen de la sesión.${C.reset}`);
  } else {
    console.log('');
    console.log(renderMarkdown(content));
  }

  printDivider('═', C.cyan);
  console.log('');
}

function cmdClear() {
  conversationHistory = [];
  currentGoal = null;
  printBanner();
  printSystem('Historial de conversación limpiado.', C.yellow);
}

function cmdExit() {
  console.log('');
  console.log(`${C.cyan}${C.bold}Hasta luego. Fue un placer codear contigo.${C.reset}`);
  console.log('');
  process.exit(0);
}

// ─── Prompt principal ─────────────────────────────────────────────────────────

function buildPrompt() {
  const goalIndicator = currentGoal
    ? `${C.green}[goal: ${currentGoal.slice(0, 30)}${currentGoal.length > 30 ? '…' : ''}]${C.reset} `
    : '';
  return `\n${C.dim}────────────────────────────────────────${C.reset}\n${goalIndicator}${C.cyan}${C.bold}▶ Tú${C.reset} `;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Verificar configuración
  const cfg = loadConfig();
  const apiKey = cfg.apiKey || process.env.GEMINI_API_KEY || '';

  if (!apiKey) {
    console.log('');
    console.log(`${C.red}${C.bold}✗ No se encontró API key de Gemini.${C.reset}`);
    console.log(`${C.yellow}Opciones:${C.reset}`);
    console.log(`  1. Edita ~/.miagent/config.json y agrega tu clave:`);
    console.log(`     ${C.dim}{"apiKey":"tu-clave-aquí"}${C.reset}`);
    console.log(`  2. Exporta la variable de entorno:`);
    console.log(`     ${C.dim}export GEMINI_API_KEY="tu-clave"${C.reset}`);
    console.log(`  3. Obtén una clave gratis en: ${C.cyan}https://aistudio.google.com/app/apikey${C.reset}`);
    console.log('');
    process.exit(1);
  }

  printBanner();

  const memory = readMemory();
  if (memory.trim()) {
    console.log(`${C.green}${C.dim}✓ Memoria del proyecto cargada (MEMORY.md)${C.reset}`);
    console.log('');
  }

  console.log(`${C.dim}Tip: escribe tu pregunta o código directamente. Usa /help para ver comandos.${C.reset}`);

  // Saludo inicial
  await chat('Saluda brevemente al usuario (1-2 líneas) y pregúntale en qué proyecto está trabajando hoy. Sé directo y profesional.');

  // Bucle principal
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 100,
  });

  // Manejar Ctrl+C
  rl.on('SIGINT', () => {
    cmdExit();
  });

  const promptUser = () => {
    if (isProcessing) return;
    rl.question(buildPrompt(), async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        promptUser();
        return;
      }

      isProcessing = true;

      try {
        // Parsear comandos
        if (trimmed.startsWith('/')) {
          const parts = trimmed.slice(1).split(/\s+/);
          const cmd = parts[0].toLowerCase();
          const rest = parts.slice(1).join(' ');

          switch (cmd) {
            case 'exit':
            case 'quit':
            case 'q':
              cmdExit();
              break;

            case 'clear':
            case 'cls':
              cmdClear();
              break;

            case 'help':
            case 'h':
              printHelp();
              break;

            case 'memory':
            case 'mem':
              await cmdMemory(rest);
              break;

            case 'goal':
              await cmdGoal(rest);
              break;

            case 'compose':
              await cmdCompose();
              break;

            default:
              printError(`Comando desconocido: /${cmd}. Escribe /help para ver los comandos disponibles.`);
          }
        } else {
          // Mensaje normal al agente
          await chat(trimmed);
        }
      } catch (err) {
        printError(`Error inesperado: ${err.message}`);
      }

      isProcessing = false;
      promptUser();
    });
  };

  promptUser();
}

main().catch((err) => {
  console.error(`\x1b[31m✗ Error fatal: ${err.message}\x1b[0m`);
  process.exit(1);
});
