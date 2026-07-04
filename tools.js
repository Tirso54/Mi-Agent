'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// ─── Colores ─────────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  bgRed:   '\x1b[41m',
};

// ─── Confirmación interactiva ────────────────────────────────────────────────

/**
 * Pide confirmación al usuario antes de ejecutar una herramienta.
 * Retorna true si el usuario confirma, false si cancela.
 */
async function askConfirm(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Evitar que readline interfiera con el flujo principal
    rl.question(prompt, (answer) => {
      rl.close();
      const ans = answer.trim().toLowerCase();
      resolve(ans === 's' || ans === 'si' || ans === 'sí' || ans === 'y' || ans === 'yes' || ans === '');
    });
  });
}

// ─── Herramientas ─────────────────────────────────────────────────────────────

/**
 * Lee un archivo y retorna su contenido.
 */
async function readFile(filePath, autoConfirm = false) {
  const resolved = path.resolve(filePath);

  if (!autoConfirm) {
    console.log(`\n${C.yellow}${C.bold}🔧 HERRAMIENTA: read_file${C.reset}`);
    console.log(`${C.dim}   Ruta: ${resolved}${C.reset}`);
    const ok = await askConfirm(`${C.cyan}¿Ejecutar? [S/n]: ${C.reset}`);
    if (!ok) {
      return { success: false, output: 'Cancelado por el usuario.' };
    }
  }

  try {
    const content = fs.readFileSync(resolved, 'utf8');
    const lines = content.split('\n').length;
    console.log(`${C.green}✓ Archivo leído (${lines} líneas)${C.reset}`);
    return { success: true, output: content };
  } catch (e) {
    const err = `Error leyendo "${resolved}": ${e.message}`;
    console.log(`${C.red}✗ ${err}${C.reset}`);
    return { success: false, output: err };
  }
}

/**
 * Escribe contenido a un archivo (crea directorios si es necesario).
 */
async function writeFile(filePath, content, autoConfirm = false) {
  const resolved = path.resolve(filePath);
  const lines = content.split('\n').length;
  const exists = fs.existsSync(resolved);

  if (!autoConfirm) {
    console.log(`\n${C.yellow}${C.bold}🔧 HERRAMIENTA: write_file${C.reset}`);
    console.log(`${C.dim}   Ruta:   ${resolved}${C.reset}`);
    console.log(`${C.dim}   Acción: ${exists ? 'SOBREESCRIBIR' : 'CREAR'} (${lines} líneas)${C.reset}`);

    // Vista previa de primeras líneas
    const preview = content.split('\n').slice(0, 5).join('\n');
    console.log(`${C.dim}   Preview:\n${preview}${lines > 5 ? '\n   ...' : ''}${C.reset}`);

    const ok = await askConfirm(`${C.cyan}¿Ejecutar? [S/n]: ${C.reset}`);
    if (!ok) {
      return { success: false, output: 'Cancelado por el usuario.' };
    }
  }

  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, 'utf8');
    console.log(`${C.green}✓ Archivo ${exists ? 'actualizado' : 'creado'}: ${resolved}${C.reset}`);
    return { success: true, output: `Archivo escrito: ${resolved}` };
  } catch (e) {
    const err = `Error escribiendo "${resolved}": ${e.message}`;
    console.log(`${C.red}✗ ${err}${C.reset}`);
    return { success: false, output: err };
  }
}

/**
 * Ejecuta un comando shell y retorna el output.
 */
async function runCommand(cmd, autoConfirm = false) {
  if (!autoConfirm) {
    console.log(`\n${C.yellow}${C.bold}🔧 HERRAMIENTA: run_command${C.reset}`);
    console.log(`${C.dim}   Comando: ${cmd}${C.reset}`);

    // Advertencia para comandos potencialmente peligrosos
    const dangerous = ['rm -rf', 'rmdir', 'format', 'mkfs', 'dd if=', ':(){:|:&};:'];
    const isDangerous = dangerous.some(d => cmd.toLowerCase().includes(d));
    if (isDangerous) {
      console.log(`${C.bgRed}${C.bold}   ⚠ ADVERTENCIA: Este comando podría ser destructivo${C.reset}`);
    }

    const ok = await askConfirm(`${C.cyan}¿Ejecutar? [S/n]: ${C.reset}`);
    if (!ok) {
      return { success: false, output: 'Cancelado por el usuario.' };
    }
  }

  console.log(`${C.dim}$ ${cmd}${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(50)}${C.reset}`);

  try {
    const output = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
      timeout: 120000, // 2 minutos máximo
      cwd: process.cwd(),
      env: { ...process.env },
    });

    const combined = (output || '').trim();
    if (combined) {
      console.log(combined);
    }
    console.log(`${C.green}✓ Comando completado${C.reset}`);
    return { success: true, output: combined || '(sin output)' };
  } catch (e) {
    const errOutput = [e.stdout, e.stderr].filter(Boolean).join('\n').trim();
    const msg = errOutput || e.message;
    console.log(`${C.red}${msg}${C.reset}`);
    console.log(`${C.red}✗ Salió con código: ${e.status || 1}${C.reset}`);
    return { success: false, output: msg || 'Error desconocido' };
  }
}

/**
 * Lista archivos de un directorio con formato legible.
 */
async function listFiles(dirPath = '.', autoConfirm = false) {
  const resolved = path.resolve(dirPath);

  if (!autoConfirm) {
    console.log(`\n${C.yellow}${C.bold}🔧 HERRAMIENTA: list_files${C.reset}`);
    console.log(`${C.dim}   Directorio: ${resolved}${C.reset}`);
    const ok = await askConfirm(`${C.cyan}¿Ejecutar? [S/n]: ${C.reset}`);
    if (!ok) {
      return { success: false, output: 'Cancelado por el usuario.' };
    }
  }

  try {
    const items = fs.readdirSync(resolved, { withFileTypes: true });
    const lines = items.map(item => {
      if (item.isDirectory()) {
        return `📁 ${item.name}/`;
      } else {
        const stat = fs.statSync(path.join(resolved, item.name));
        const size = formatBytes(stat.size);
        return `📄 ${item.name} ${C.dim}(${size})${C.reset}`;
      }
    });

    const output = lines.join('\n');
    console.log(output);
    console.log(`${C.green}✓ ${items.length} elementos${C.reset}`);
    return { success: true, output: lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, '')).join('\n') };
  } catch (e) {
    const err = `Error listando "${resolved}": ${e.message}`;
    console.log(`${C.red}✗ ${err}${C.reset}`);
    return { success: false, output: err };
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ─── Parser de tool calls en respuesta de Gemini ─────────────────────────────

/**
 * Detecta y ejecuta tool calls en el texto de respuesta de Gemini.
 * Formato: [TOOL:nombre] argumento
 * Para write_file: [TOOL:write_file:ruta]\ncontenido\n[/TOOL]
 *
 * @param {string} text - Texto de respuesta del modelo
 * @param {boolean} autoConfirm - Si true, omite la confirmación del usuario
 * @returns {Promise<{text: string, toolResults: Array}>}
 */
async function parseAndExecuteTools(text, autoConfirm = false) {
  const toolResults = [];
  let processedText = text;

  // 1. write_file con bloque [TOOL:write_file:path]...[/TOOL]
  const writeBlockRegex = /\[TOOL:write_file:([^\]]+)\]\n?([\s\S]*?)\[\/TOOL\]/g;
  let match;
  const writeMatches = [];

  // Recolectar todos antes de ejecutar para no interferir con el regex
  const textCopy = text;
  const wr = new RegExp(writeBlockRegex.source, 'g');
  while ((match = wr.exec(textCopy)) !== null) {
    writeMatches.push({ full: match[0], filePath: match[1].trim(), content: match[2] });
  }

  for (const wm of writeMatches) {
    const result = await writeFile(wm.filePath, wm.content, autoConfirm);
    toolResults.push({ tool: 'write_file', arg: wm.filePath, ...result });
    processedText = processedText.replace(wm.full, `✓ _write_file ejecutado: ${wm.filePath}_`);
  }

  // 2. Herramientas de una línea: [TOOL:nombre] argumento
  const lineToolRegex = /\[TOOL:(read_file|list_files|run_command)\]\s+(.+)/g;
  const lineMatches = [];
  const lr = new RegExp(lineToolRegex.source, 'g');
  while ((match = lr.exec(textCopy)) !== null) {
    lineMatches.push({ full: match[0], toolName: match[1], arg: match[2].trim() });
  }

  for (const lm of lineMatches) {
    let result;
    switch (lm.toolName) {
      case 'read_file':
        result = await readFile(lm.arg, autoConfirm);
        break;
      case 'list_files':
        result = await listFiles(lm.arg, autoConfirm);
        break;
      case 'run_command':
        result = await runCommand(lm.arg, autoConfirm);
        break;
      default:
        result = { success: false, output: `Herramienta desconocida: ${lm.toolName}` };
    }
    toolResults.push({ tool: lm.toolName, arg: lm.arg, ...result });
    processedText = processedText.replace(lm.full, `✓ _${lm.toolName} ejecutado_`);
  }

  return { text: processedText, toolResults };
}

module.exports = {
  readFile,
  writeFile,
  runCommand,
  listFiles,
  parseAndExecuteTools,
};
