# Sistema visual del proyecto

Fuente única: `apps/web/src/index.css` (bloque `@theme`, `:root` y reglas base). Los valores de abajo
son los que existen hoy en el código; nada acá fue inventado. Lo que no está tokenizado aparece en la
última sección y no se asume en los artboards.

## Color

| Token                 | Valor     | Uso declarado en la fuente                   |
| --------------------- | --------- | -------------------------------------------- |
| `--color-canvas`      | `#0f1113` | Fondo base; el código es lo único que brilla |
| `--color-sunken`      | `#131619` | Superficies hundidas                         |
| `--color-surface`     | `#16191c` | Superficie de bloques                        |
| `--color-panel`       | `#1a1d21` | Paneles                                      |
| `--color-raised`      | `#1d2125` | Elementos elevados                           |
| `--color-line`        | `#2b3036` | Bordes                                       |
| `--color-line-strong` | `#3a4048` | Bordes de énfasis                            |
| `--color-line-faint`  | `#22262b` | Bordes tenues                                |
| `--color-dash`        | `#4a515a` | Guiones y separadores punteados              |
| `--color-ink`         | `#edeff2` | Texto principal (16:1 sobre canvas)          |
| `--color-ink-2`       | `#b0b7c0` | Texto secundario (9.4:1)                     |
| `--color-ink-3`       | `#848c96` | Texto terciario (5.5:1)                      |
| `--color-amber`       | `#f4b740` | Acento y cursor; anillo de foco              |
| `--color-amber-hi`    | `#ffd27a` | Acento alto                                  |
| `--color-amber-ink`   | `#17130a` | Texto sobre ámbar                            |
| `--color-azure`       | `#7cc4ff` | Acento frío                                  |
| `--color-azure-deep`  | `#4f96d1` | Acento frío profundo                         |
| `--color-ember`       | `#e5683e` | Error y aviso                                |
| `--color-ember-ink`   | `#ff9b78` | Texto de error                               |
| `--color-ember-bg`    | `#2a1810` | Fondo de error                               |
| `--color-ember-line`  | `#5a2e1c` | Borde de error                               |
| `--color-code-string` | `#d7b98a` | Cadena en el código                          |

Regla que la fuente declara: el color nunca carga un estado solo; cada estado lleva además forma,
ícono o palabra.

## Tipografía

| Token         | Valor                                                             | Uso             |
| ------------- | ----------------------------------------------------------------- | --------------- |
| `--font-sans` | `"Atkinson Hyperlegible Next", "Segoe UI", system-ui, sans-serif` | Interfaz        |
| `--font-mono` | `"JetBrains Mono", ui-monospace, Menlo, monospace`                | Código y buffer |

Pesos importados: sans 400, 500, 600, 700, 800; mono 400, 500, 700. Cuerpo: `17px` / `1.5`.

## Foco y movimiento

| Regla               | Valor                                                        | Uso                                        |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| Anillo de foco      | `outline: 2px solid var(--color-amber); outline-offset: 2px` | Todo elemento enfocable (`:focus-visible`) |
| Movimiento reducido | `animation-duration: 0.01ms`, `transition-duration: 0.01ms`  | `prefers-reduced-motion: reduce`           |

## Sin tokenizar

No existen en la fuente escalas de espaciado, radios, sombras ni tamaños tipográficos. Los artboards
usan valores puntuales y lo dicen; no se presentan como tokens del proyecto.
