# Roadmap dopo il vertical slice

## Stato attuale: vertical slice giocabile

Il nucleo raccolta → crafting → base → conflitto → raid → estrazione è implementato. Il primo
passaggio artistico generato dal codice comprende costa, sentieri, vegetazione, risorse composte,
tre monumenti distinti, accampamenti e illuminazione realistica. La guida iniziale in cinque passi
è già integrata e riapribile durante la partita.

## Alpha interna

- Eseguire playtest ripetuti da 2, 6 e 12 giocatori.
- Bilanciare tempi, costi, danni, quantità di risorse e punteggi dai risultati osservati.
- Raffinare l'art style originale con mesh, texture PBR e animazioni create appositamente.
- Aggiungere audio originale, feedback di raccolta e impostazioni accessibilità.
- Costruire lobby, party e matchmaking su server riservati.
- Spostare la riconnessione su MemoryStore per recuperare il server corretto.

## Alpha pubblica

- Progressione cosmetica, missioni giornaliere e ricompense non pay-to-win.
- Telemetria per funnel iniziale, durata sessione, ritorno e abbandono per fase.
- Moderazione, segnalazioni, filtri, localizzazione e controlli completi console/mobile.
- Session locking dei profili, migrazioni schema e test di carico DataStore.
- Anti-cheat basato su segnali e revisione manuale, non ban automatici fragili.

## Beta

- Nuovi monumenti, eventi e varianti di mappa senza allungare il grind.
- Ottimizzazione rete/streaming e test con il numero massimo di 24 giocatori.
- Thumbnail, icona, trailer e pagina esperienza basati su test A/B.
- Monetizzazione limitata a cosmetici, emote e pass trasparenti.

Veicoli, elettricità complessa, agricoltura, trading e mondi persistenti di una settimana restano
fuori priorità finché i dati non dimostrano che il ciclo breve funziona.
