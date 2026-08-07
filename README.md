# WAR WORLD

WAR WORLD è un vertical slice survival PvPvE per Roblox: prende la tensione dei survival sandbox
e la comprime nel ritmo di partite competitive brevi. Il progetto è scritto in TypeScript,
compilato in Luau con roblox-ts e sincronizzato con Roblox Studio attraverso Rojo.

## Cosa è già giocabile

- Isola graybox, monumenti, spawn e risorse generati dal server.
- Raccolta, inventario, crafting, costruzione, combattimento e raid server-authoritative.
- Sei squadre automatiche da massimo quattro giocatori, senza fuoco amico.
- Ingressi scorrevoli bloccati per squadra, casse alla disattivazione e punteggio competitivo.
- Fasi Raccolta, Conflitto, Raid ed Estrazione con eventi pubblici.
- Backfill con kit di recupero, spettatori nella fase finale e riconnessione di tre minuti.
- Profilo persistente con fallback sicuro durante i test locali.
- HUD e controlli generati dal codice per mouse/tastiera, touch e gamepad.
- Validazione runtime e rate limiting sul confine tra client e server.

## Requisiti

- Node.js 22 o superiore
- Roblox Studio
- Rojo 7.6 o superiore

## Installazione e build

```bash
npm install
npm run build
npm run rojo:build
```

## Sviluppo con Roblox Studio

Apri due terminali nella cartella del progetto:

```bash
npm run watch
```

```bash
npm run rojo:serve
```

In Studio apri il plugin Rojo, collegati a `localhost:34872` e premi **Play**. Il server crea
automaticamente l'intero mondo graybox. In alternativa puoi aprire direttamente
`build/WarWorld.rbxlx` per un test rapido della build già generata.

Leggi [docs/ROBLOX_STUDIO.md](docs/ROBLOX_STUDIO.md) per i primi passi e
[docs/PLAYTEST_CHECKLIST.md](docs/PLAYTEST_CHECKLIST.md) per provare il ciclo completo.
[docs/ARCHITETTURA.md](docs/ARCHITETTURA.md) spiega il rapporto tra TypeScript, Rojo e Studio;
[docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) contiene le regole di design e
[docs/ROADMAP.md](docs/ROADMAP.md) separa il prototipo dalle fasi alpha e beta.

## Controllo qualità

```bash
npm run check
```

Il comando esegue compilazione TypeScript strict, controllo formattazione, sourcemap Rojo,
validazioni strutturali e generazione completa del place Roblox.
