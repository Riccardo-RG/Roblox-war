# Architettura tecnica

WAR WORLD è scritto in TypeScript, ma Roblox esegue Luau. Il flusso è:

`src/*.ts` → **roblox-ts** → `out/*.luau` → **Rojo** → Roblox Studio

Roblox Studio resta necessario come motore del gioco: simula fisica, personaggi, rete, servizi
Roblox, illuminazione e pubblicazione. Non è necessario scrivere codice a mano dentro Studio.

## Cartelle principali

- `src/shared`: cataloghi e tipi utilizzati sia dal client sia dal server.
- `src/server`: autorità di gioco, salvataggi, match, squadre, inventario e convalide.
- `src/server/world`: kit artistico procedurale per ambiente, monumenti, risorse e accampamenti.
- `src/client`: input, anteprima costruzioni, HUD ed effetti puramente visivi.
- `out`: Luau generato; non va modificato manualmente.
- `build/WarWorld.rbxlx`: place Roblox generato e apribile direttamente con Studio.
- `docs`: istruzioni, design e prove manuali.

## Confine di sicurezza

Il client può soltanto richiedere un'azione. Il server decide se è valida controllando:

- tipo e forma del comando;
- frequenza delle richieste;
- distanza dal bersaglio;
- possesso di oggetti e risorse;
- fase corrente della partita;
- appartenenza alla squadra;
- limiti e collisioni delle costruzioni.

Danno, raccolta, crafting, spesa, punteggio ed estrazione non vengono mai accettati come valori
calcolati dal client. Questo riduce gli exploit più comuni dei giochi Roblox.

## Ciclo del server

1. Crea squadre e mondo procedurale deterministico.
2. Avvia i servizi e la macchina a fasi del match.
3. Carica il profilo quando entra un giocatore.
4. Consente backfill in Raccolta e nella prima metà del Conflitto.
5. Mantiene una cache di riconnessione per tre minuti nello stesso server.
6. Salva periodicamente e in parallelo alla chiusura.
7. A fine campagna assegna la vittoria, poi pulisce costruzioni, loot e punteggi.

## Regola per le prossime funzionalità

Ogni nuova azione con valore di gioco deve nascere come servizio server-authoritative e avere:
validazione runtime, limite di frequenza, feedback al client e un caso nella checklist di playtest.
Gli elementi solo estetici, come traccianti o animazioni HUD, possono restare sul client.
