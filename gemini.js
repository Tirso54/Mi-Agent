'use strict';

const https = require('https');
const { loadConfig } = require('./memory.js');

const MODEL = 'gemini-2.0-flash';
const API_BASE = 'generativelanguage.googleapis.com';

/**
 * Llama a la API REST de Gemini 2.0 Flash.
 * @param {Array}  messages   - Array de {role, parts:[{text}]}
 * @param {string} systemText - Texto de sistema (memoria + instrucciones)
 * @returns {Promise<string>} - Texto de respuesta
 */
async function callGemini(messages, systemText = '') {
  const cfg = loadConfig();
  const apiKey = cfg.apiKey || process.env.GEMINI_API_KEY || '';

  if (!apiKey) {
    throw new Error(
      'No se encontró API key de Gemini.\n' +
      'Agrega tu clave en ~/.miagent/config.json o exporta GEMINI_API_KEY'
    );
  }

  // Construir body
  const body = {
    contents: messages,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  };

  if (systemText.trim()) {
    body.systemInstruction = {
      parts: [{ text: systemText }],
    };
  }

  const bodyStr = JSON.stringify(body);
  const path = `/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_BASE,
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (parsed.error) {
            const msg = parsed.error.message || JSON.stringify(parsed.error);
            // Mensaje de ayuda para errores comunes
            if (parsed.error.code === 400 && msg.includes('API_KEY')) {
              reject(new Error(`API key inválida. Verifica ~/.miagent/config.json\n${msg}`));
            } else if (parsed.error.code === 429) {
              reject(new Error(`Límite de tasa de Gemini alcanzado. Espera un momento.\n${msg}`));
            } else {
              reject(new Error(`Error de Gemini API (${parsed.error.code}): ${msg}`));
            }
            return;
          }

          const candidate = parsed.candidates?.[0];
          if (!candidate) {
            reject(new Error('Respuesta vacía de Gemini (sin candidates)'));
            return;
          }

          // Manejar finishReason
          const reason = candidate.finishReason;
          if (reason === 'SAFETY') {
            reject(new Error('Respuesta bloqueada por filtros de seguridad de Gemini.'));
            return;
          }

          const text = candidate.content?.parts
            ?.filter(p => p.text)
            ?.map(p => p.text)
            ?.join('') || '';

          resolve(text.trim());
        } catch (e) {
          reject(new Error(`Error parseando respuesta de Gemini: ${e.message}\nRaw: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on('error', (e) => {
      if (e.code === 'ENOTFOUND') {
        reject(new Error('Sin conexión a internet. Verifica tu red.'));
      } else {
        reject(new Error(`Error de red: ${e.message}`));
      }
    });

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Timeout: Gemini no respondió en 60 segundos.'));
    });

    req.write(bodyStr);
    req.end();
  });
}

/**
 * Construye el mensaje de sistema con instrucciones base + memoria del proyecto.
 */
function buildSystemPrompt(memoryContent) {
  const base = `Eres MiAgent, un asistente experto en programación que vive en la terminal.

PERSONALIDAD:
- Respuestas claras, directas y técnicas.
- Cuando generes código, usa bloques markdown con el lenguaje correcto.
- Explica siempre QUÉ hace el código y POR QUÉ tomaste esas decisiones.
- Si detectas errores en el código del usuario, señálalos sin rodeos.
- Cuando uses una herramienta (tool), indica qué estás a punto de hacer ANTES de ejecutar.

HERRAMIENTAS DISPONIBLES:
Tienes acceso a estas herramientas del sistema de archivos (el usuario debe confirmar antes de ejecutar):
- read_file(ruta)           → lee el contenido de un archivo
- write_file(ruta, content) → escribe o sobreescribe un archivo
- run_command(cmd)          → ejecuta un comando shell y muestra el output
- list_files(dir)           → lista archivos de un directorio

Para invocar una herramienta, escribe en tu respuesta una línea con este formato exacto:
[TOOL:nombre_herramienta] argumento_o_contenido

Ejemplos:
[TOOL:read_file] src/index.js
[TOOL:list_files] ./src
[TOOL:run_command] npm install && npm test
[TOOL:write_file:src/utils.js]
// contenido del archivo aquí
[/TOOL]

FORMATO DE RESPUESTA:
- Usa Markdown en tus respuestas (el terminal renderiza bloques de código).
- Sé conciso pero completo.
- Si el usuario pide algo que requiere múltiples pasos, enuméralos.`;

  if (memoryContent && memoryContent.trim()) {
    return `${base}

---
MEMORIA DEL PROYECTO (MEMORY.md):
${memoryContent}
---`;
  }

  return base;
}

module.exports = { callGemini, buildSystemPrompt };
