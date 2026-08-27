# H10 Voxel City Builder: executor guide

This repository is a browser voxel city builder. `src/main.ts` is the only
composition root. Read this file before touching the repository, then read the
nearest nested `AGENTS.md` for the module being implemented. In particular,
`src/engine/`, `src/sim/`, `src/world/`, and most `src/world/*/` domains add
contracts that are not repeated here.

## Stack and provenance

- Language: TypeScript 5.9.3 in strict mode. The exact installed version is in
  `package-lock.json`; the declared range is `^5.9.0` in `package.json`; the
  ES2022 target and strict compiler flags are in `tsconfig.json`.
- Rendering/application library: Three.js 0.180.0. The exact version is in
  `package-lock.json` and the declared range is in `package.json`. There is no
  React, Vue, Angular, or other application framework.
- Procedural noise: `simplex-noise` 4.0.3, from `package-lock.json` and
  `package.json`.
- Build/dev server: Vite 7.3.6. The exact version is in `package-lock.json`, the
  declared range is `^7.1.0` in `package.json`, and ports/build target are in
  `vite.config.ts`.
- Test runner: Vitest 3.2.7 in Node environment. The exact version is in
  `package-lock.json`; `vite.config.ts` selects `src/**/*.test.ts`, Node, and a
  30-second per-test timeout.
- Package manager: npm, evidenced by `package-lock.json` (lockfile version 3)
  and the npm scripts in `package.json`. The repository does not pin Node or npm
  in a file. Verification on 2026-08-27 used Node 24.19.0 and npm 11.17.0.
- Module format: native ESM (`"type": "module"` in `package.json`) with
  bundler-style resolution and extensionless relative imports (`tsconfig.json`).

## Commands actually verified

Run commands from the repository root.

- Install: `npm install` — completed successfully and reported the tree up to
  date. npm warned that the `esbuild` install script is not listed in npm's
  `allowScripts`; it did not block this checkout.
- Build: `npm run build` — completed successfully. It runs `tsc --noEmit &&
  vite build`. Vite emitted only its non-fatal warning that the main minified
  chunk exceeds 500 kB.
- Test, whole suite: `npm test` — this is the configured full-suite command,
  but it is currently **not a working completion gate**. Two observed runs
  executed a large portion of the tests and then stopped producing output
  without a Vitest summary or process exit; both had to be interrupted. A
  second attempt, `npm test -- --maxWorkers=4`, behaved the same way.
- Test, one file: `npm test -- src/game/loop.test.ts` — completed successfully:
  1 file and 2 tests passed. Replace only the file path when PLAN.md names a
  different co-located test.
- Typecheck: `npm run typecheck` — completed successfully and runs
  `tsc --noEmit`.
- Lint: no working lint command exists. `npm run lint` was executed and failed
  with `Missing script: "lint"`. `package.json` contains no lint script or lint
  dependency, and the repository has no ESLint/Biome configuration. Do not
  describe typecheck as lint.

Vite/Vitest may need an ordinary filesystem view. In the restricted setup used
for this audit, sandboxed runs could not let esbuild resolve `vite.config.ts`;
the same exact commands worked once run outside that sandbox.

## Directory tree and test ownership

This is the relevant tree to two levels. Tests are co-located with source; there
is no root `tests/` directory.

```text
.
|-- docs/                 Design contracts and project maps; no executable test.
|   |-- pending/          Fragments waiting to update index/changelog; no test.
|   `-- world/            Domain design documents; covered by matching src/world tests.
|-- scripts/              Node ESM repository utilities; project-locate.test.ts covers project-locate.mjs.
`-- src/
    |-- main.ts           Sole composition root and frame/debug harness; no direct test file, build is its automated gate.
    |-- engine/           Three.js rendering, camera, materials, overlays, worker pool, pure meshing; CameraInput.test.ts, VoxelMaterial.test.ts, and mesher/greedyMesher.test.ts are representative coverage.
    |-- game/             Fixed-step loop and orchestration between simulation and world; loop.test.ts, actions.test.ts, and growthScene.test.ts cover it.
    |-- sim/              Pure deterministic tick simulation and public barrel; tick.test.ts, SimState.test.ts, and DesirabilityField.test.ts cover it.
    |-- ui/               DOM/HUD views plus pure view models; CityOverviewModel.test.ts, GameHudModel.test.ts, and ViewMenuModel.test.ts cover models, but several DOM view classes have no direct test.
    `-- world/            Voxel storage, terrain, roads, buildings, scenes, and non-voxel routes; VoxelWorld.test.ts plus co-located tests in each domain cover it.
```

Important sub-boundaries below that depth:

- `src/engine/mesher/` is pure meshing and worker code; it must not import
  Three.js or DOM APIs. Tests are co-located as `*.test.ts`.
- `src/engine/shaders/` contains GLSL embedded in TypeScript; shader contracts
  are tested indirectly by engine material/lighting tests.
- `src/engine/themes/` owns theme data; `themes.test.ts` is its direct gate.
- `src/world/terrain/`, `streets/`, `sites/`, `buildings/`, `farms/`,
  `grading/`, `crossings/`, `spans/`, `aerial/`, `skyline/`, `landmarks/`,
  `arcology/`, `ropeway/`, `traffic/`, and `scenes/` are separate world
  domains. Each has a local `AGENTS.md` and co-located tests; read only the
  matching `docs/world/*.md` routed by that local guide.
- `scripts/project-locate.test.ts` uses Node's native test runner and is not
  selected by the default Vitest glob. `free-port.mjs` and `docs-merge.mjs`
  have no direct test files.

Top-level module boundaries are clear and documented in `docs/PROJECT_MAP.md`.
The main coverage gaps are `src/main.ts`, some DOM-heavy `src/ui` classes, and
two repository scripts; these are coverage gaps, not permission to blur module
ownership.

## Workflow before editing

1. Identify the single PLAN.md module assigned for the current commit. There is
   no `PLAN.md` in this checkout as of the audit, so implementation is blocked
   until one is supplied.
2. Query `PROJECT_INDEX.md` before broad search. For example,
   `npm run locate -- engine` was run successfully. Use the assigned module name
   as the search term, then use `rg` only to confirm callers and the dirty tree.
3. Read the closest nested `AGENTS.md` and the one design document it routes to.
   Do not bulk-read unrelated world design documents.
4. Record `git status --short` before work. This is a shared working tree; do
   not repair, reformat, revert, or commit unrelated changes.
5. Keep source, test, documentation, and index changes for one module together.
   Code/configuration/structure changes must update the relevant
   `PROJECT_INDEX.md` description through a fragment under `docs/pending/`, as
   described by `docs/pending/README.md`.

## Conventions observed in the code

### Formatting and language

- Use two spaces, single quotes, semicolons, and trailing commas in multiline
  constructs. `src/game/loop.ts` is a compact example.
- Code comments, documentation, test descriptions, and commit messages are in
  Italian. Identifiers and strings visible in the game/debug UI are in English.
  See the Italian tests in `src/game/loop.test.ts` and English values/labels in
  `src/sim/classes.ts`.
- Comments explain constraints and reasons, not line-by-line behavior. The
  fixed-step rationale in `src/game/loop.ts` and buffer-lifetime rationale in
  `src/world/Chunk.ts` are preferred examples.
- TypeScript stays strict. Preserve `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noUnusedLocals`,
  `noUnusedParameters`, `isolatedModules`, and `verbatimModuleSyntax` from
  `tsconfig.json`. `noUncheckedIndexedAccess` is intentionally disabled.

### Naming

- Classes, interfaces, and type aliases use PascalCase; functions and variables
  use lowerCamelCase; shared constants use UPPER_SNAKE_CASE. Examples:
  `VoxelWorld`, `WorldBounds`, `isBuildingClass`, and `BUILDING_CLASS` in
  `src/world/VoxelWorld.ts` and `src/sim/classes.ts`.
- A file centered on a major class/controller usually uses PascalCase
  (`VoxelWorld.ts`, `MesherPool.ts`); functional modules use lower camel case
  (`chunkCoords.ts`, `cityCondition.ts`). This is not perfectly consistent:
  `src/game/loop.ts` exports `FixedStepLoop` from a lowercase file. Prefer the
  naming of neighboring files in the same directory instead of renaming an
  existing file for consistency alone.
- Tests are named `*.test.ts` beside the code they cover. Benchmarks are
  `*.bench.ts`. There is no separate test tree.

### Imports and dependencies

- Use relative ESM imports without `.ts` extensions. Use `import type` when an
  import is type-only; `src/main.ts` contains examples.
- Inside `src/sim/`, import sibling files directly. Outside `src/sim/`, prefer
  the public barrel `src/sim/index.ts`; `src/game/actions.ts` is the preferred
  example. The repository is inconsistent here: `src/main.ts` directly imports
  several `src/sim/*` files. Do not copy that exception into new modules.
- There are no path aliases. World domains generally import the exact relative
  module they need.
- `src/main.ts` is the only file allowed to know all subsystems. `src/game/`
  orchestrates simulation and world. `src/engine/` may read world storage, but
  `src/world/` must never import engine. `src/sim/` must not import engine,
  Three.js, or DOM APIs. See `docs/PROJECT_MAP.md`, `src/sim/index.ts`, and the
  nested module guides.

### Error handling

- Expected player/domain rejection is data, not an exception. Return a
  discriminated result such as `ActionResult` with `success: false` and a typed
  reason; see `src/game/actions.ts`.
- Throw `Error` only for programmer/invariant violations that the caller must
  prevent. Include the subsystem and violated precondition in the message; see
  `MesherPool.submit` in `src/engine/MesherPool.ts`.
- Optional lookup/poll APIs return `null` or `undefined` when absence is normal;
  see `VoxelWorld.getChunk` and `MesherPool.poll`. Match the nearby API instead
  of changing nullability style across a module.
- Numeric simulation boundaries clamp invalid/non-finite values rather than
  allowing state corruption; `finiteStock` and `clamp01` in `src/sim/tick.ts`
  are examples. Do not silently clamp programmer errors in unrelated modules.

### Logging

- There is no logging abstraction. Runtime diagnostics use `console.info` or
  `console.warn` at controller/debug boundaries with a bracketed subsystem
  prefix, for example `[theme]` and `[daylight]` in
  `src/engine/AtmosphereControl.ts` and `[sim]` in `src/main.ts`.
- Repository scripts use `console.log` for normal output and `console.error` for
  actionable failure, as in `scripts/project-locate.mjs`.
- Pure simulation, world generation, and meshing logic should not log. A few
  performance-oriented tests deliberately use `console.info` with `[misura]`;
  do not copy test measurement logging into production paths.

## Non-negotiable architecture contracts

- The world is Z-up: x east, y north, z height. Negative coordinates are valid.
  Chunks are 32 x 32 x 32 and keyed as `"cx,cy,cz"`.
- `Chunk.blocks` is rendering data; `Chunk.data` is simulation data. The
  renderer reads only `blocks`. `setBlock` invalidates geometry; `setData` does
  not. Never replace either `Uint8Array` after `Chunk` construction. See
  `src/world/Chunk.ts` and `src/world/VoxelWorld.ts`.
- Meshes carry `aPalette`, `aFace`, and packed `aShade`, never RGB. Preserve 32
  palette slots. Palette/theme changes update uniforms/state and must not
  rebuild chunk geometry. Read `src/engine/AGENTS.md` before any mesh/material
  work.
- The terrain generator, mesher, and `src/sim/` do not import Three.js.
- Simulation is pure and deterministic at a fixed 10 ticks/second. `tick` does
  not use `dt`, does not mutate its input, and does not recalculate
  desirability. Deterministic paths do not use `Date.now()` or `Math.random()`.
- Desirability recomputes rather than accumulates, and only within the touched
  rectangle. Urban uses are ordered residential, commercial, industrial,
  civic; every indexed tuple keeps that order.
- Building typologies belong to `src/world/buildings/`; simulation must not
  learn voxel building forms.
- Each balancing threshold/frequency/multiplier has one owner, listed in
  `docs/PROJECT_MAP.md`. Do not duplicate magic numbers in consumers.
- Keep non-render work below the budgets documented by the nearest module
  guide. For worker/bundle changes, build is part of verification; for hot paths
  use the existing benchmark rather than timing by intuition.
- Do not edit generated `dist/` or dependencies under `node_modules/`.
- If a file is already around 600 lines, split it along existing responsibilities
  before adding another responsibility.

## Rules for the executor

- Work on one `PLAN.md` module at a time.
- Never edit files under `tests/`.
- Never edit `PLAN.md` or `AGENTS.md`.
- A module is done only when its named test command passes and the full suite
  still passes. A hung command, interrupted run, partial dot output, or missing
  final Vitest summary is not a pass.
- Commit per module. Do not combine modules in one commit, and do not include
  unrelated shared-working-tree changes.
- Do not weaken, delete, skip, or rewrite an existing test merely to make a
  module pass. Existing tests are currently co-located under `src/`, not under
  `tests/`.
- Stop and report a blocker if the module has no PLAN.md entry, no named test
  command, an ambiguous visual/spatial requirement, or a failing/hanging clean
  baseline. Do not infer a replacement acceptance criterion.

## Current setup blockers

- `PLAN.md` does not exist anywhere in this checkout. The executor therefore
  has no module sequence or named per-module acceptance commands.
- No linter is installed or configured; `npm run lint` fails because the script
  is missing.
- The configured full-suite command does not currently terminate reliably and
  did not produce a final pass/fail summary in two observed runs, including one
  capped at four workers. Until this is diagnosed on a clean, uncontended
  working tree, the required full-suite completion rule cannot be satisfied.
- The checkout was already dirty during the audit, including simulation,
  arcology, and building files/tests. `src/world/arcology/generate.test.ts` was
  checked separately and passed 23/23 tests, but unrelated concurrent changes
  prevent treating the observed full-suite hang as a clean-baseline result.
- The build itself works, and top-level module boundaries are clear. Missing
  direct tests for `src/main.ts`, some DOM views, `free-port.mjs`, and
  `docs-merge.mjs` are known coverage gaps.
