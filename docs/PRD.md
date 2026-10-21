# PRD — Tutor NeoVim

**Versión:** 1.0  
**Estado:** Listo para implementación  
**Fecha:** 2026-10-21  
**Nombre de trabajo:** Tutor NeoVim  
**Producto:** Aplicación web gamificada para aprender Linux básico, Vim/Neovim y LazyVim mediante práctica deliberada, memoria muscular, repetición espaciada y misiones reales.

---

# 1. Resumen ejecutivo

Tutor NeoVim es una aplicación web de entrenamiento interactivo diseñada para que un usuario aprenda a trabajar con Linux básico, Vim/Neovim y LazyVim mediante ejecución real de ejercicios, no mediante teoría pasiva.

El producto debe optimizar tres resultados:

1. **Reconocimiento:** el usuario identifica rápidamente qué comando o patrón aplicar.
2. **Ejecución automática:** la secuencia de teclas se convierte en memoria muscular.
3. **Transferencia:** el usuario puede aplicar lo aprendido en situaciones reales, fuera del ejercicio exacto con el que practicó.

La aplicación no se plantea como un curso tradicional ni como una colección de tutoriales. La unidad fundamental del producto es la **habilidad** (`Skill`), y cada habilidad se entrena mediante ejercicios cortos, repetición espaciada, discriminación entre alternativas, transferencia contextual y feedback inmediato.

La arquitectura será híbrida:

- **Motor instantáneo en navegador** para aproximadamente el 80 % de la práctica de Vim/Neovim.
- **Laboratorio Linux/Neovim real** para aproximadamente el 20 % de las misiones y ejercicios de transferencia.

El MVP inicial implementará únicamente el motor instantáneo, el sistema pedagógico, el árbol de habilidades, la telemetría, el progreso y la gamificación esencial. Los contenedores Linux reales se incorporarán en una fase posterior.

---

# 2. Problema

Aprender Vim, Neovim o LazyVim suele fallar por cuatro motivos principales:

- El usuario memoriza comandos de forma declarativa, pero no desarrolla automatización motora.
- Los tutoriales presentan comandos en bloques, pero no enseñan a decidir cuándo usar cada uno.
- El usuario practica patrones aislados y obtiene una falsa sensación de dominio.
- La complejidad inicial de Linux, modos de Vim, combinaciones de teclas y ecosistema LazyVim genera una carga cognitiva excesiva.

Por ejemplo, conocer que `ci"` significa “change inside quotes” no implica ser capaz de reconocer instantáneamente una cadena entre comillas y ejecutar `ci"` sin deliberación consciente.

Tutor NeoVim debe cerrar esa brecha entre “sé qué hace este comando” y “mi mano lo ejecuta automáticamente cuando aparece la situación adecuada”.

---

# 3. Visión

Crear el entrenador de referencia para adquirir fluidez real en terminal, Vim/Neovim y LazyVim.

La aplicación debe producir una experiencia similar a la combinación de:

- entrenador de mecanografía,
- juego de habilidad,
- repetición espaciada,
- laboratorio de programación,
- skill tree de videojuego,
- simulador profesional.

El usuario debe sentir que está “jugando”, mientras el sistema está midiendo su dominio real.

---

# 4. Principios de producto

## 4.1 Skill-first

La unidad de aprendizaje es una habilidad, no una lección.

Ejemplo:

```yaml
skill: vim.text-object.inner-quotes
```

Una habilidad puede tener prerequisitos y relaciones con otras habilidades.

---

## 4.2 Accuracy before speed

La velocidad nunca debe premiarse a costa de errores.

La progresión debe ser:

```text
accuracy → fluency → speed
```

---

## 4.3 Active recall before recognition

La app debe pedir al usuario que produzca la solución desde memoria antes de mostrar pistas.

---

## 4.4 Progressive fading

Las ayudas desaparecen gradualmente:

```text
explicación → imitación → pista parcial → recuerdo libre → transferencia
```

---

## 4.5 Interleaving

Una vez adquirida una habilidad inicial, los ejercicios deben mezclarse con habilidades similares.

No entrenar:

```text
w w w w w
b b b b b
e e e e e
```

Entrenar:

```text
w b e f w t b ; e
```

---

## 4.6 Multiple valid strategies

Vim permite múltiples soluciones válidas.

El sistema no debe comparar la ejecución exclusivamente contra una única secuencia “correcta”.

Los ejercicios deben clasificar estrategias como:

- optimal
- efficient
- valid
- inefficient
- anti-pattern

---

## 4.7 Immediate feedback

Los errores deben detectarse inmediatamente.

El feedback durante práctica motora debe ser extremadamente breve y visual.

La explicación detallada debe aparecer después del intento.

---

## 4.8 Transfer over repetition

Repetir exactamente el mismo ejercicio no demuestra dominio.

Una habilidad solamente alcanza alta maestría cuando funciona en contextos diferentes.

---

# 5. Objetivos

## Objetivos de usuario

El usuario debe poder:

- aprender Vim desde cero;
- adquirir memoria muscular;
- medir su fluidez;
- descubrir sus puntos débiles;
- practicar diariamente en sesiones cortas;
- progresar desde movimientos básicos hasta LazyVim;
- practicar Linux básico;
- resolver misiones realistas;
- comprobar objetivamente su nivel.

## Objetivos de producto

El sistema debe:

- medir acciones a nivel de pulsación;
- estimar mastery por habilidad;
- programar revisiones automáticamente;
- seleccionar ejercicios adaptativamente;
- generar una sesión diaria personalizada;
- soportar diferentes distribuciones de teclado;
- separar XP de dominio real;
- permitir crear ejercicios como contenido declarativo;
- admitir posteriormente Linux y Neovim reales.

---

# 6. No objetivos del MVP

El MVP no incluirá:

- contenedores Linux reales;
- Neovim real ejecutándose en servidor;
- LazyVim completo;
- LSP;
- Mason;
- Treesitter;
- Lazygit;
- multijugador en tiempo real;
- marketplace de ejercicios;
- IA generando ejercicios en producción;
- rankings globales complejos;
- sistema social;
- aplicación móvil nativa.

La arquitectura debe dejar preparados estos elementos sin implementarlos todavía.

---

# 7. Público objetivo

## Persona A — Principiante en terminal

Conoce programación básica pero utiliza ratón, VS Code y terminal mínimamente.

Objetivo:

```text
terminal básica → Vim básico → Neovim fluido
```

## Persona B — Usuario de Vim principiante

Conoce:

```text
hjkl
i
Esc
:wq
```

pero navega lentamente y usa Vim como si fuese un editor convencional.

Objetivo:

```text
movimiento semántico → operadores → text objects → repetición
```

## Persona C — Desarrollador que quiere adoptar LazyVim

Sabe usar Vim/Neovim pero desconoce el ecosistema moderno.

Objetivo:

```text
fuzzy finding
buffers
windows
LSP
diagnostics
git
LazyVim
```

---

# 8. Arquitectura pedagógica

Cada habilidad se entrena mediante cinco etapas.

## Stage 1 — Discover

Duración objetivo: 10–30 segundos.

Ejemplo:

```text
c = change
i = inside
" = quotes

ci" = change inside quotes
```

Debe existir una única idea por pantalla.

---

## Stage 2 — Imitate

El sistema muestra la secuencia y el usuario la reproduce.

Ejemplo:

```text
c → i → "
```

Máximo recomendado: 2–4 repeticiones.

---

## Stage 3 — Recall

Las ayudas desaparecen.

Ejemplo:

```javascript
const env = "development";
```

Objetivo:

```text
cambia solamente el contenido de las comillas
```

---

## Stage 4 — Discriminate

La aplicación mezcla situaciones similares.

Ejemplo:

```javascript
const port = 3000;
const env = "development";
```

El usuario debe decidir entre estrategias diferentes.

---

## Stage 5 — Transfer

La misma habilidad aparece en otros lenguajes y contextos.

Ejemplos:

```python
DATABASE_URL = "localhost"
```

```lua
local theme = "tokyonight"
```

```json
{
  "environment": "development"
}
```

La transferencia debe influir directamente en mastery.

---

# 9. Core loop

Cada microejercicio sigue el flujo:

```text
Prompt
  ↓
Decision
  ↓
Execution
  ↓
Immediate feedback
  ↓
Evaluation
  ↓
Mastery update
  ↓
Scheduling update
  ↓
Next challenge
```

Duración ideal por desafío:

```text
2–15 segundos
```

---

# 10. Estructura de una sesión diaria

Duración objetivo:

```text
8–12 minutos
```

Composición inicial:

| Bloque | Duración | Objetivo |
|---|---:|---|
| Warm-up | 1–2 min | habilidades dominadas |
| Reviews | 2–3 min | repetición espaciada |
| Learn | 2–3 min | habilidad nueva |
| Mixed Drill | 2–3 min | discriminación |
| Challenge | 1–2 min | transferencia |

El motor puede modificar esta distribución según estado del usuario.

---

# 11. Modos de juego

## Learn

Introduce habilidades nuevas.

## Drill

Repetición deliberada.

## Rush

Presión progresiva de tiempo.

Solamente se desbloquea cuando accuracy es suficientemente alta.

## Mission

Escenario contextual compuesto por múltiples habilidades.

En MVP puede ejecutarse sobre el simulador.

Más adelante podrá utilizar Linux/Neovim real.

## Daily

Sesión adaptativa generada automáticamente.

## Boss

No introduce conceptos nuevos.

Combina habilidades previamente dominadas.

Boss se implementará después del MVP inicial, pero el modelo de contenido debe soportarlo.

---

# 12. Skill tree inicial

El árbol inicial estará dividido en tiers.

## Tier 1 — Fundamentos

### linux.shell.navigation

Comandos:

```text
pwd
ls
cd
mkdir
```

### vim.mode.normal

```text
Esc
```

### vim.mode.insert

```text
i
a
o
```

### vim.navigation.atomic

```text
h
j
k
l
```

---

## Tier 2 — Navegación semántica

### vim.navigation.words

```text
w
W
b
B
e
E
```

### vim.navigation.line

```text
0
^
$
```

### vim.navigation.find-char

```text
f
t
;
,
```

---

## Tier 3 — Operadores

### vim.operator.delete

```text
d
dd
```

### vim.operator.change

```text
c
cw
```

### vim.operator.yank

```text
y
yy
```

### vim.undo

```text
u
Ctrl+r
```

---

## Tier 4 — Text objects

```text
iw
i"
a"
i(
a(
i{
a{
```

Combinaciones prioritarias:

```text
ciw
diw
ci"
di"
ci(
da(
```

---

## Tier 5 — Repetition

```text
.
```

Posteriormente:

```text
/
*
n
N
cgn
```

---

# 13. Habilidades fuera del MVP

La base de datos debe permitir incorporar posteriormente:

```text
visual mode
visual block
registers
macros
buffers
windows
splits
fuzzy finder
LazyVim leader mappings
LSP
diagnostics
Git
Lazygit
Mason
Treesitter
```

---

# 14. Modelo de habilidad

```ts
interface Skill {
  id: string;
  slug: string;

  title: string;
  description: string;

  domain: "linux" | "vim" | "neovim" | "lazyvim";

  tier: number;

  prerequisites: string[];

  concepts: string[];

  tags: string[];

  difficulty: number;

  enabled: boolean;

  createdAt: Date;
  updatedAt: Date;
}
```

Ejemplo:

```json
{
  "id": "vim-textobject-inner-quotes",
  "slug": "vim.textobject.inner-quotes",
  "title": "Inside Quotes",
  "domain": "vim",
  "tier": 4,
  "prerequisites": [
    "vim.operator.change",
    "vim.mode.normal"
  ],
  "concepts": [
    "operator",
    "modifier",
    "text-object"
  ],
  "tags": [
    "text-object",
    "quotes"
  ],
  "difficulty": 3,
  "enabled": true
}
```

---

# 15. Modelo de ejercicio

Todos los ejercicios deben ser declarativos.

No se debe escribir lógica específica en componentes React para cada ejercicio.

```ts
interface Exercise {
  id: string;
  slug: string;

  title: string;

  skillIds: string[];

  mode:
    | "learn"
    | "imitate"
    | "recall"
    | "discriminate"
    | "transfer"
    | "rush"
    | "mission";

  difficulty: number;

  environment: EnvironmentRef;

  initialState: ExerciseInitialState;

  objective: ExerciseObjective;

  evaluation: ExerciseEvaluation;

  solutions: ExerciseSolution[];

  antiPatterns: AntiPattern[];

  hints: ExerciseHint[];

  metadata: ExerciseMetadata;
}
```

---

# 16. Ejemplo de ejercicio

```yaml
id: vim-ci-quotes-001
slug: vim.ci-quotes.basic-001

title: Change inside quotes

skillIds:
  - vim.operator.change
  - vim.textobject.inner-quotes

mode: recall

difficulty: 2

environment:
  type: simulator
  profile: vim-basic-v1

initialState:
  buffer: |
    const mode = "development";
  cursor:
    line: 1
    column: 18
  vimMode: normal

objective:
  type: buffer_equals
  target: |
    const mode = "production";

solutions:
  - sequence: 'ci"production<Esc>'
    classification: optimal

evaluation:
  requireFinalNormalMode: true
  allowEquivalentBuffers: false

antiPatterns:
  - repeated_x
  - arrow_keys
  - insert_mode_navigation

hints:
  - afterMs: 4000
    level: 1
    text: "Piensa en Change + Inside."

  - afterMs: 8000
    level: 2
    text: '¿Qué objeto representa "?'

metadata:
  language: javascript
  estimatedSeconds: 8
```

---

# 17. Motor de simulación Vim

El motor de simulación debe ser independiente de la UI.

Arquitectura:

```text
Keyboard
   ↓
Input Adapter
   ↓
Vim Engine
   ↓
Editor State
   ↓
Evaluation Engine
```

El motor debe poder recibir eventos:

```ts
engine.dispatch({
  key: "c",
  code: "KeyC",
  timestamp: performance.now()
});
```

Y devolver:

```ts
{
  mode,
  cursor,
  selection,
  buffer,
  pendingOperator,
  commandState
}
```

---

# 18. Alcance funcional del motor Vim MVP

Debe soportar:

```text
NORMAL
INSERT
```

Movimientos:

```text
h j k l
w W
b B
e E
0 ^ $
f<char>
t<char>
;
,
```

Entrada:

```text
i
a
o
Esc
```

Operadores:

```text
d
c
y
```

Comandos:

```text
dd
yy
cw
```

Text objects:

```text
iw
i"
a"
i(
a(
i{
a{
```

Edición:

```text
x
p
P
u
Ctrl+r
.
```

No implementar macros, registros o visual block en MVP.

---

# 19. Captura de eventos

Cada input del usuario debe registrarse.

```ts
interface InputEvent {
  attemptId: string;

  timestamp: number;

  key: string;
  code: string;

  logicalKey: string;

  vimMode: string;

  cursorBefore: Position;
  cursorAfter: Position;

  accepted: boolean;
}
```

Ejemplo:

```json
{
  "timestamp": 1284.22,
  "key": "c",
  "code": "KeyC",
  "logicalKey": "c",
  "vimMode": "normal",
  "accepted": true
}
```

---

# 20. Keyboard layouts

El sistema debe distinguir:

```text
KeyboardEvent.key
KeyboardEvent.code
```

Esto permite registrar:

- acción lógica;
- posición física.

Layouts iniciales:

```text
US ANSI
ES ISO
```

La arquitectura debe permitir:

```text
UK
DE
FR
```

El usuario seleccionará layout durante onboarding.

---

# 21. Evaluación

El sistema debe evaluar cuatro dimensiones principales.

## Correctness

¿El estado final coincide con el objetivo?

## Strategy

¿Qué técnica utilizó el usuario?

## Fluency

¿Hubo vacilaciones importantes?

## Efficiency

¿Cuántos inputs innecesarios se produjeron?

---

# 22. Strategy classification

Cada intento debe clasificarse:

```text
optimal
efficient
valid
inefficient
anti-pattern
failed
```

Ejemplo:

```text
ci"
```

puede ser `optimal`.

Mientras que:

```text
xxxxxxxxxxxx
```

puede completar el mismo objetivo pero clasificarse `anti-pattern`.

---

# 23. Anti-patterns

El motor debe detectar inicialmente:

```text
repeated_x
excessive_hjkl
arrow_keys
insert_mode_navigation
unnecessary_visual_mode
repeated_escape
```

El modelo debe ser extensible.

---

# 24. Métricas por intento

```ts
interface AttemptMetrics {
  success: boolean;

  accuracyScore: number;
  strategyScore: number;
  efficiencyScore: number;
  fluencyScore: number;

  firstInputLatencyMs: number;

  totalDurationMs: number;

  keystrokes: number;

  unnecessaryKeystrokes: number;

  errors: number;

  hintsUsed: number;

  performanceScore: number;
}
```

---

# 25. Performance Score

Versión inicial:

```text
performanceScore =

accuracy   × 0.35
strategy   × 0.25
efficiency × 0.15
fluency    × 0.15
recovery   × 0.10
```

Todos los componentes estarán normalizados en:

```text
0–100
```

El peso debe almacenarse en configuración y no hardcodearse en componentes.

---

# 26. Fluency

El sistema debe medir pausas.

Ejemplo:

```text
c     310 ms
i      72 ms
"      65 ms
```

Esto indica que el usuario probablemente domina `i"` pero tarda en decidir el operador.

Debe calcularse:

```text
firstInputLatency
medianInterKeyLatency
maxInterKeyLatency
```

Para combinaciones conocidas se pueden generar posteriormente perfiles específicos.

---

# 27. Mastery

XP y Mastery son sistemas independientes.

XP representa actividad y gamificación.

Mastery representa competencia estimada.

```ts
interface UserSkill {
  userId: string;
  skillId: string;

  mastery: number;

  accuracy: number;
  fluency: number;
  strategy: number;
  retention: number;
  transfer: number;

  attempts: number;

  lastAttemptAt: Date | null;
  nextReviewAt: Date | null;

  stage: MasteryStage;
}
```

Stages:

```text
locked
learning
practicing
fluent
mastered
```

---

# 28. Fórmula inicial de mastery

Primera versión:

```text
mastery =
accuracy  × 0.30 +
strategy  × 0.20 +
fluency   × 0.20 +
retention × 0.20 +
transfer  × 0.10
```

El resultado se ajustará por:

- número de intentos;
- uso de pistas;
- recencia;
- variedad contextual.

No permitir `mastered` mediante repetición masiva del mismo ejercicio.

---

# 29. Condiciones iniciales para Mastered

Una habilidad puede considerarse `mastered` cuando:

```text
mastery >= 85
accuracy >= 95
strategy >= 85
transfer >= 75
retention >= 80
```

y exista al menos:

```text
1 recall diferido
1 ejercicio de transferencia
```

Los umbrales deben ser configurables.

---

# 30. Repetición espaciada

No implementar SM-2 literalmente.

Crear un scheduler propio.

Estado inicial:

```ts
interface ReviewState {
  stability: number;
  difficulty: number;

  dueAt: Date;

  lastPerformance: number;

  streak: number;
}
```

Intervalos orientativos:

```text
in-session:
4 ejercicios
12 ejercicios

cross-session:
1 día
3 días
7 días
14 días
30 días
```

El intervalo se reduce si:

```text
accuracy baja
latencia aumenta
strategy baja
se utilizan hints
```

El intervalo aumenta cuando:

```text
accuracy alta
latencia baja
strategy correcta
transfer correcto
```

---

# 31. Selección adaptativa de ejercicios

El motor debe seleccionar el siguiente ejercicio con una puntuación.

```text
priority =
reviewDue
+ weakness
+ prerequisiteNeed
+ diversity
+ transferNeed
- recentRepetition
```

Debe evitar presentar el mismo patrón demasiadas veces seguidas.

---

# 32. Daily Session Builder

Input:

```text
UserSkill[]
ReviewQueue[]
SessionHistory[]
```

Output:

```ts
interface DailySession {
  warmup: Exercise[];
  reviews: Exercise[];
  learn: Exercise[];
  mixed: Exercise[];
  challenge: Exercise[];
}
```

El builder debe ser determinista dado:

```text
userId
date
seed
```

Esto facilita testing y depuración.

---

# 33. Gamificación

## XP

Se obtiene por:

```text
completar ejercicios
perfect runs
reviews vencidos completados
transfer
daily completion
personal best
```

XP no altera mastery.

---

## Combo

Un combo aumenta con ejecuciones consecutivas correctas.

Se reinicia si:

```text
fallo
hint fuerte
anti-pattern
```

---

## Streak

Se cuenta por sesiones diarias completadas.

No debe penalizar de forma agresiva.

El streak debe ser motivacional, no una amenaza.

---

## Personal Best

Registrar:

```text
best time
best efficiency
best performance
lowest latency
```

---

# 34. Ghost Replay

Después de determinados ejercicios se podrá mostrar:

```text
YOU
hhhhwwci"

MASTER
2wci"
```

El replay debe soportar:

```text
user run
optimal run
personal best
```

No se implementará replay animado complejo en el primer sprint, pero los eventos deben almacenarse desde el inicio.

---

# 35. Keyboard Heatmap

La arquitectura debe poder agregar métricas por:

```text
key
command
sequence
skill
```

Métricas:

```text
reaction latency
error rate
usage count
```

Se puede implementar después del MVP.

---

# 36. UI / UX

Principio:

```text
zero-distraction practice
```

Durante un ejercicio deben aparecer solamente:

- objetivo;
- editor;
- estado Vim;
- feedback mínimo;
- progreso pequeño.

Evitar:

- sidebars;
- textos largos;
- dashboards visibles durante práctica;
- animaciones permanentes.

---

# 37. Pantalla principal

Debe mostrar:

```text
Continue Training
Daily Session

Skill Map

Current Streak
Mastery Summary
Recent Personal Best
```

Prioridad absoluta:

```text
Continue Training
```

---

# 38. Pantalla de ejercicio

Layout desktop:

```text
┌───────────────────────────────────────┐
│ Challenge                             │
│ Cambia únicamente el string           │
├───────────────────────────────────────┤
│                                       │
│ const env = "development";             │
│                                       │
│                                       │
├───────────────────────────────────────┤
│ NORMAL                    Combo ×7    │
└───────────────────────────────────────┘
```

---

# 39. Feedback

Perfect run:

```text
PERFECT

ci"

Strategy      100
Efficiency    100
Reaction      310 ms

Combo ×8
```

Subóptimo:

```text
COMPLETED

Tu solución:
xxxxxxxxxxx

Una opción mejor:
ci"

+ Review scheduled
```

Nunca mostrar un muro de explicación entre ejercicios.

---

# 40. Skill Map

Cada nodo debe reflejar:

```text
locked
learning
practicing
fluent
mastered
```

El color visual nunca será la única indicación del estado.

El grafo debe derivarse de datos, no estar hardcodeado.

---

# 41. Onboarding

Flujo:

```text
Welcome
↓
Keyboard layout
↓
Experience level
↓
30–60 second calibration
↓
Initial skill estimate
↓
First session
```

Experience level:

```text
Never used Vim
Know basics
Use Vim occasionally
Use Vim regularly
```

La respuesta solamente ajusta la calibración.

No debe otorgar mastery automáticamente.

---

# 42. Calibración

La calibración debe probar rápidamente:

```text
hjkl
mode switching
word movement
basic operator
```

Debe detenerse cuando el nivel estimado sea suficientemente claro.

---

# 43. Arquitectura técnica MVP

```text
Browser
│
├── React UI
│
├── Practice Engine
│   ├── Vim Simulation Engine
│   ├── Evaluation Engine
│   ├── Telemetry Engine
│   └── Session State
│
├── API Client
│
└── Local fallback
        │
        ▼
Backend API
│
├── Auth
├── Exercise Service
├── Mastery Service
├── Session Builder
├── Scheduler
└── Analytics
        │
        ▼
PostgreSQL / Neon
```

---

# 44. Stack recomendado

Frontend:

```text
React
TypeScript
Vite
Tailwind CSS
Zustand
CodeMirror 6
```

Backend:

```text
TypeScript
Fastify
Zod
Drizzle ORM
```

Base de datos:

```text
Neon PostgreSQL
```

Testing:

```text
Vitest
Testing Library
Playwright
```

Analytics:

```text
PostHog
```

Hosting recomendado:

```text
Frontend: Vercel / Cloudflare Pages
API: Fly.io / Railway / Render / Cloudflare
DB: Neon
```

La infraestructura definitiva no es una decisión bloqueante del MVP.

---

# 45. Estructura de repositorio

```text
/
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── vim-engine/
│   ├── evaluation/
│   ├── pedagogy/
│   ├── exercise-schema/
│   ├── shared/
│   └── ui/
│
├── content/
│   ├── skills/
│   ├── exercises/
│   └── environments/
│
├── docs/
│
├── tests/
│
├── package.json
└── pnpm-workspace.yaml
```

Usar monorepo con:

```text
pnpm workspaces
```

Turborepo es opcional.

---

# 46. Packages

## vim-engine

Responsable de:

```text
buffer
cursor
mode
commands
operators
motions
text objects
undo
repeat
```

No depende de React.

---

## evaluation

Responsable de:

```text
goal checking
strategy classification
anti-pattern detection
metrics
performance score
```

---

## pedagogy

Responsable de:

```text
mastery
review scheduling
exercise selection
session builder
```

---

## exercise-schema

Contiene:

```text
Zod schemas
TypeScript types
validators
```

---

# 47. Modelo de datos

Tablas mínimas:

```text
users
skills
skill_prerequisites
exercises
exercise_skills
user_skills
attempts
attempt_events
sessions
session_exercises
review_queue
user_settings
```

---

# 48. Tabla users

Campos principales:

```text
id
email
display_name
created_at
updated_at
```

---

# 49. Tabla user_settings

```text
user_id
keyboard_layout
daily_goal_minutes
sound_enabled
reduced_motion
```

---

# 50. Tabla skills

```text
id
slug
title
description
domain
tier
difficulty
enabled
created_at
updated_at
```

---

# 51. Tabla exercises

```text
id
slug
title
mode
difficulty
content_json
version
enabled
created_at
updated_at
```

Los detalles del ejercicio vivirán inicialmente en JSON validado.

---

# 52. Tabla attempts

```text
id
user_id
exercise_id
session_id

started_at
completed_at

success

accuracy_score
strategy_score
efficiency_score
fluency_score
performance_score

first_input_latency_ms
duration_ms

keystrokes
errors
hints_used

strategy_classification
```

---

# 53. Tabla attempt_events

```text
id
attempt_id
sequence
timestamp_ms

event_type
payload_json
```

Los eventos deben poder reconstruir un replay.

---

# 54. Tabla user_skills

```text
user_id
skill_id

stage

mastery
accuracy
strategy
fluency
retention
transfer

attempt_count

last_attempt_at
next_review_at

updated_at
```

---

# 55. API MVP

## GET /api/me

Devuelve usuario y settings.

## GET /api/skills

Devuelve skill graph.

## GET /api/skills/:id

Detalle de skill.

## GET /api/session/daily

Genera o recupera la sesión diaria.

## POST /api/sessions

Crea sesión.

## GET /api/exercises/:id

Carga ejercicio.

## POST /api/attempts

Inicia intento.

## POST /api/attempts/:id/events

Opcional para envío incremental.

## POST /api/attempts/:id/complete

Finaliza intento y actualiza:

```text
metrics
mastery
review queue
XP
```

## GET /api/progress

Resumen de progreso.

---

# 56. Sincronización de eventos

Durante MVP:

Los eventos pueden almacenarse localmente mientras se ejecuta el ejercicio.

Al finalizar:

```text
POST complete attempt
```

envía:

```text
result
metrics
events
```

No es necesario enviar cada keypress por red.

Esto reduce latencia y coste.

---

# 57. Modo offline parcial

La arquitectura debe permitir posteriormente sesiones offline.

En MVP:

Si comienza un ejercicio ya descargado y se pierde conexión:

```text
continuar
guardar intento en IndexedDB
sincronizar al volver conexión
```

No es requisito bloqueante del primer release.

---

# 58. Contenido

Los ejercicios se almacenarán inicialmente en repositorio:

```text
/content/exercises
```

Formato:

```text
YAML
```

Durante build o seed:

```text
validate
↓
normalize
↓
insert/update DB
```

---

# 59. Content CLI

Crear comandos:

```bash
pnpm content:validate
pnpm content:seed
pnpm content:test
```

El validador debe detectar:

```text
skill inexistente
prerequisite inválido
solution inválida
goal imposible
ID duplicado
slug duplicado
```

---

# 60. Test automático de ejercicios

El sistema debe poder ejecutar las soluciones declaradas contra `vim-engine`.

Ejemplo:

```text
initial state
↓
run solution
↓
compare goal
```

Todos los ejercicios deben pasar esta prueba en CI.

Esto es requisito crítico.

---

# 61. Observabilidad de aprendizaje

Eventos de producto:

```text
session_started
session_completed
exercise_started
exercise_completed
exercise_failed
hint_used
skill_unlocked
skill_mastered
review_completed
personal_best
daily_streak
```

No enviar contenido sensible del usuario.

---

# 62. Dashboard interno futuro

Debe permitir analizar:

```text
exercise failure rate
median latency
most common anti-patterns
drop-off
skill difficulty
hint frequency
mastery progression
```

No es necesario construirlo en MVP.

---

# 63. Accessibility

Requisitos:

- navegación completa por teclado;
- no depender únicamente de color;
- reduced motion;
- sonidos opcionales;
- contraste suficiente;
- tipografía monoespaciada legible;
- no capturar combinaciones del navegador fuera del área de práctica cuando no sea necesario.

---

# 64. Performance

Objetivos MVP:

```text
initial page interactive < 2.5 s
exercise transition < 150 ms
keypress feedback < 50 ms
editor state update < 16 ms objetivo
```

La percepción debe ser instantánea.

---

# 65. Seguridad

El MVP no ejecutará comandos arbitrarios en servidor.

El simulador opera exclusivamente en cliente.

Validar todos los payloads con Zod.

Rate limiting en API.

No confiar en scores calculados exclusivamente en cliente para futuras tablas competitivas.

---

# 66. Arquitectura futura — Linux Lab

No implementar en MVP.

Diseño objetivo:

```text
Browser
   │
xterm.js
   │
WebSocket
   │
Sandbox Gateway
   │
Ephemeral container
   │
Linux + Neovim
```

El contenedor será:

```text
sin privilegios
filesystem efímero
network deshabilitada por defecto
CPU limitada
RAM limitada
TTL limitado
```

---

# 67. Arquitectura futura — Neovim real

Dentro del sandbox:

```bash
nvim --listen /tmp/tutor.nvim
```

Tutor Agent:

```text
PTY events
+
Neovim RPC
+
filesystem validation
```

Permitirá observar:

```text
mode
cursor
buffer
windows
files
diagnostics
```

---

# 68. Environment Profiles

Nunca acoplar ejercicios directamente a la última versión de LazyVim.

Modelo:

```text
vim-basic-v1
nvim-clean-0.11
lazyvim-2026.10
lazyvim-python-2026.10
lazyvim-typescript-2026.10
```

Cada ejercicio declara:

```yaml
environment:
  profile: lazyvim-2026.10
```

---

# 69. Linux curriculum futuro

Skills:

```text
pwd
ls
cd
mkdir
touch
cp
mv
rm
cat
less
grep
find
chmod
pipes
redirects
```

La progresión deberá centrarse en tareas.

Ejemplo:

```text
crea carpeta
entra
crea archivo
localiza texto
abre archivo
edita
guarda
```

---

# 70. Misiones futuras Linux + Neovim

Ejemplo:

```text
Mission: Broken API URL
```

Filesystem:

```text
project/
├── src/
├── config/
│   ├── dev.lua
│   └── prod.lua
└── README.md
```

Objetivo:

```text
encuentra API_URL
abre el archivo
cambia localhost
guarda
sal
```

Una solución posible:

```bash
grep -R "API_URL" .
nvim config/prod.lua
```

Dentro de Vim:

```text
/API_URL
ci"
...
Esc
:wq
```

La evaluación debe centrarse en estado final + estrategia, no en exigir exactamente esta secuencia.

---

# 71. IA futura

La IA no evaluará correctness en tiempo real.

La evaluación será determinista.

IA podrá utilizarse para:

```text
generar variaciones
crear escenarios
generar hints
explicar errores
adaptar contextos
crear misiones
```

Todo contenido generado deberá validarse contra schemas y motores deterministas.

---

# 72. Roadmap

## Phase 0 — Foundation

Implementar:

```text
monorepo
schemas
database
auth
design tokens
CI
testing
```

Resultado:

aplicación arrancando con usuario autenticado.

---

## Phase 1 — Vim Engine

Implementar:

```text
buffer
cursor
NORMAL
INSERT
hjkl
w b e
0 ^ $
i a o
Esc
```

Resultado:

editor navegable sin evaluación.

---

## Phase 2 — Operators

Implementar:

```text
d
c
y
dd
yy
cw
undo
redo
```

---

## Phase 3 — Text Objects

Implementar:

```text
iw
i"
a"
i(
a(
i{
a{
```

---

## Phase 4 — Exercise Engine

Implementar:

```text
exercise loader
objective evaluation
solutions
anti-patterns
metrics
attempt recording
```

---

## Phase 5 — Pedagogy Engine

Implementar:

```text
mastery
review queue
scheduler
session builder
unlocking
```

---

## Phase 6 — Product UX

Implementar:

```text
onboarding
daily
learn
drill
results
skill map
progress
```

---

## Phase 7 — Gamification

Implementar:

```text
XP
combo
streak
personal best
basic ghost comparison
```

---

## Phase 8 — Content MVP

Crear como mínimo:

```text
20 skills
100 exercise templates
>= 5 variants per important pattern
```

---

## Phase 9 — Linux simulator

Agregar comandos Linux simulados básicos.

---

## Phase 10 — Sandbox

Agregar Linux + Neovim real.

---

## Phase 11 — LazyVim

Agregar:

```text
fuzzy finding
buffers
splits
LSP
diagnostics
git
lazygit
```

---

# 73. Alcance concreto del MVP 1.0

MVP debe incluir:

```text
auth
onboarding
keyboard layout
calibration

20 skills aproximadas

Vim simulation engine

NORMAL
INSERT

hjkl
w b e
0 ^ $
f t ; ,
i a o
Esc
d c y
dd yy
cw
ciw
ci"
ci(
u
Ctrl+r
.

exercise engine
telemetry

mastery
adaptive review
daily session

skill map

XP
combo
streak
personal best

100 templates mínimo
```

---

# 74. Definition of Done MVP

El MVP se considera terminado cuando un usuario nuevo puede:

1. registrarse;
2. seleccionar teclado;
3. realizar calibración;
4. completar su primera sesión;
5. aprender `hjkl`;
6. progresar hasta movimientos por palabras;
7. aprender operadores;
8. aprender al menos `ciw`, `ci"` y `ci(`;
9. recibir ejercicios adaptados a sus errores;
10. cerrar sesión;
11. volver otro día;
12. recibir reviews programadas;
13. observar progreso en Skill Map.

Además:

```text
todos los ejercicios pasan tests
todos los schemas validan
keypress feedback < 50 ms
attempts persisten
mastery actualiza correctamente
scheduler produce resultados deterministas
```

---

# 75. Criterios de aceptación clave

## Motor Vim

Given:

```text
const env = "development";
```

cursor dentro de `development`.

When:

```text
ci"production<Esc>
```

Then:

```text
const env = "production";
```

y el modo final es:

```text
NORMAL
```

---

## Evaluación

Si el objetivo se alcanza mediante `ci"`:

```text
strategy = optimal
```

Si se alcanza borrando repetidamente con `x`:

```text
success = true
strategy = anti-pattern
```

---

## Mastery

Completar repetidamente un único ejercicio no puede producir `mastered`.

Debe existir:

```text
delayed recall
+
transfer
```

---

## Scheduler

Una habilidad fallada debe reaparecer antes que una habilidad respondida perfectamente.

---

## Input

El motor debe funcionar con:

```text
US ANSI
ES ISO
```

---

# 76. Tests obligatorios

Unit:

```text
vim engine
motions
operators
text objects
repeat
evaluation
mastery
scheduler
session builder
schemas
```

Integration:

```text
exercise → attempt → evaluation → mastery → review
```

E2E:

```text
onboarding
calibration
daily session
skill unlock
review next session
```

---

# 77. Seeds iniciales

Crear contenido inicial para:

```text
vim.mode.normal
vim.mode.insert
vim.navigation.atomic
vim.navigation.words
vim.navigation.line
vim.navigation.find-char
vim.operator.delete
vim.operator.change
vim.operator.yank
vim.undo
vim.textobject.inner-word
vim.textobject.inner-quotes
vim.textobject.inner-parentheses
vim.repeat
```

Añadir habilidades auxiliares hasta aproximadamente 20 nodos.

---

# 78. Reglas para agentes de implementación

Un agente que implemente este PRD debe seguir estas reglas:

1. No introducir features fuera del alcance actual.
2. No acoplar ejercicios a componentes UI.
3. Toda lógica pedagógica debe ser testeable sin React.
4. Toda lógica Vim debe vivir fuera de React.
5. Los ejercicios deben ser declarativos.
6. Toda definición de ejercicio debe validarse con Zod.
7. Toda solución declarada debe probarse automáticamente.
8. No utilizar un LLM para evaluar correctness.
9. No mezclar XP con Mastery.
10. No guardar una única solución como única fuente de verdad.
11. No asumir teclado US.
12. No implementar contenedores en el MVP inicial.
13. Priorizar latencia de interacción.
14. Mantener las capas desacopladas.
15. Añadir tests antes de extender comandos complejos.

---

# 79. Orden recomendado para el agente

El agente debe implementar en este orden:

```text
1 repository
2 schemas
3 vim-engine
4 vim-engine tests
5 exercise schema
6 exercise evaluator
7 evaluator tests
8 telemetry
9 database
10 API
11 mastery engine
12 scheduler
13 session builder
14 practice UI
15 onboarding
16 skill map
17 gamification
18 content
19 E2E
20 polish
```

No empezar por dashboards, gráficos o animaciones.

---

# 80. Primera milestone técnica

Antes de implementar autenticación o gamificación debe existir una demo local capaz de:

1. cargar un ejercicio YAML;
2. validar el schema;
3. crear el estado inicial;
4. mostrar el editor;
5. aceptar comandos Vim;
6. registrar cada keypress;
7. comprobar el estado final;
8. clasificar estrategia;
9. calcular métricas;
10. mostrar resultado.

Ejercicio de prueba:

```javascript
const mode = "development";
```

Objetivo:

```javascript
const mode = "production";
```

Solución óptima:

```text
ci"production<Esc>
```

Esta milestone valida el riesgo técnico principal del producto.

---

# 81. Segunda milestone

Añadir:

```text
5 skills
20 exercises
mastery
reviews
daily session
```

Con usuario local.

Todavía sin auth.

---

# 82. Tercera milestone

Añadir:

```text
Neon
auth
cloud persistence
skill map
XP
streak
```

Esto produce el primer MVP distribuible.

---

# 83. Métricas de éxito de producto

Medir:

```text
daily session completion
D1 retention
D7 retention
review completion
skill mastery rate
median attempts to mastery
hint usage
anti-pattern reduction
latency reduction
transfer success
```

Una métrica pedagógica importante:

```text
time-to-fluency
```

Definición inicial:

tiempo desde primera exposición hasta conseguir fluency >= 85 y pasar un delayed recall.

---

# 84. North Star Metric

Propuesta:

```text
Verified Skills Retained per Active User
```

Una habilidad cuenta cuando:

```text
mastered
+
delayed recall passed
```

Esto evita optimizar el producto únicamente por tiempo de uso.

---

# 85. Riesgos

## Simulación incompleta de Vim

Mitigación:

crear motor modular y definir explícitamente subset soportado.

## Ejercicios ambiguos

Mitigación:

test automático de soluciones y goals.

## Gamificación que fomenta velocidad incorrecta

Mitigación:

accuracy gate.

## Mastery inflado

Mitigación:

delayed recall + transfer obligatorios.

## Layout de teclado

Mitigación:

modelar key + code desde inicio.

## Scope creep

Mitigación:

Linux real y LazyVim quedan fuera del MVP.

---

# 86. Decisiones cerradas

Estas decisiones se consideran cerradas salvo nueva evidencia:

```text
web-first
React + TypeScript
Vite
Neon PostgreSQL
simulator-first
skill-based learning
adaptive sessions
deterministic evaluation
XP != Mastery
exercise-as-content
keyboard-layout aware
Linux real después del MVP
LazyVim después del MVP
```

---

# 87. Decisiones abiertas no bloqueantes

Se pueden decidir durante implementación:

```text
proveedor exacto de auth
hosting exacto de API
ORM final entre Drizzle/Prisma
librería exacta para visualización del Skill Map
audio design
branding definitivo
```

No deben bloquear el desarrollo del motor.

---

# 88. Resultado esperado

Al terminar el MVP, Tutor NeoVim debe demostrar que un usuario puede:

```text
aprender
↓
recordar
↓
ejecutar
↓
ser medido
↓
recibir práctica adaptativa
↓
retener
```

sobre un conjunto útil de habilidades Vim.

La aplicación no debe medir únicamente si el usuario conoce un comando.

Debe medir si:

> reconoce la situación correcta y ejecuta la acción correcta con precisión, fluidez y retención.

Ese principio debe utilizarse para decidir cualquier feature futura.
