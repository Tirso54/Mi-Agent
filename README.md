# MiAgent 🤖

Agente de coding para terminal, powered by **Gemini 2.0 Flash** (tier gratuito).

```
╔═══════════════════════════════════════════╗
║    MiAgent — Coding Agent  v1.0.0         ║
║    Powered by Gemini 2.0 Flash            ║
╚═══════════════════════════════════════════╝
```

## Instalación

```bash
curl -fsSL https://raw.githubusercontent.com/Tirso54/MiAgent/main/install.sh | bash
```

Requisitos: **Node.js >= 18** y una **API key de Gemini** (gratis en [aistudio.google.com](https://aistudio.google.com/app/apikey)).

## Uso

```bash
miagent
```

### Comandos

| Comando | Descripción |
|---|---|
| `/goal <descripción>` | Define un objetivo; el agente trabaja autónomamente |
| `/compose` | Flujo estructurado: planificar → codificar → revisar → finalizar |
| `/memory` | Ver `MEMORY.md` del proyecto actual |
| `/memory save` | Guarda resumen de la sesión en `MEMORY.md` |
| `/clear` | Limpia el historial de conversación |
| `/exit` | Salir |
| `/help` | Mostrar ayuda |

### Herramientas del agente

El agente puede ejecutar acciones en tu sistema de archivos. **Siempre pide confirmación** antes de ejecutar:

- `read_file` — leer archivos
- `write_file` — crear o modificar archivos
- `run_command` — ejecutar comandos shell
- `list_files` — listar directorio

### Memoria persistente

El agente guarda contexto del proyecto en `MEMORY.md` en tu directorio de trabajo. Este archivo se inyecta automáticamente en cada conversación para que el agente "recuerde" el proyecto.

## Configuración

API key guardada en `~/.miagent/config.json`:

```json
{ "apiKey": "tu-clave-de-gemini" }
```

O usa la variable de entorno:

```bash
export GEMINI_API_KEY="tu-clave"
miagent
```

## Estructura

```
~/.miagent/
├── index.js    ← Agente principal + bucle conversacional
├── tools.js    ← Herramientas: read/write/run/list
├── memory.js   ← MEMORY.md + config
└── gemini.js   ← Cliente REST Gemini 2.0 Flash
```

## Ejemplo de sesión

```
▶ Tú  Crea una API REST en Node.js para gestionar tareas

◆ MiAgent
Voy a crear una API REST completa con Express...

[TOOL:write_file:server.js]
// código generado aquí
[/TOOL]

🔧 HERRAMIENTA: write_file
   Ruta: /proyecto/server.js
¿Ejecutar? [S/n]: s
✓ Archivo creado: server.js
```

## Licencia

MIT
