# Design del vertical slice WAR WORLD

## Promessa del prodotto

Costruisci una base, contendi eventi pericolosi, apri le difese rivali ed estrai Nuclei energetici
in un arco survival completo da 35 minuti.

## Pilastri

1. **Survival rapido**: prima risorsa in pochi secondi, primo riparo in pochi minuti.
2. **Conflitto leggibile**: effetti stilizzati, armi prevedibili e nessuna violenza grafica.
3. **Costruzione significativa**: le basi creano scelte tattiche senza ore di grind.
4. **Perdita equa**: le risorse trasportate sono a rischio; progressi account e cosmetici restano.
5. **Sociale di base**: squadre da massimo quattro e fuoco amico disattivato.

## Fasi della partita

| Fase       | Durata pubblica | Scopo                                                   |
| ---------- | --------------: | ------------------------------------------------------- |
| Raccolta   |           8 min | Raccogli, crea oggetti e costruisci il campo iniziale.  |
| Conflitto  |          12 min | Si attivano PvP ed eventi pubblici.                     |
| Raid       |          10 min | Le Cariche possono danneggiare le costruzioni rivali.   |
| Estrazione |           5 min | Consegna i Nuclei e assicurati il punteggio conclusivo. |

Studio usa durate ridotte per consentire prove pratiche.

## Regole di backfill

- I giocatori possono entrare liberamente durante Raccolta.
- Nella prima metà del Conflitto ricevono un kit di recupero proporzionato.
- Raid ed Estrazione accettano soltanto riconnessioni nell'architettura di produzione.
- Nel vertical slice, i nuovi ingressi tardivi diventano spettatori.
- La riconnessione entro tre minuti nello stesso server ripristina squadra, inventario e match.
- In produzione la stessa informazione andrà replicata con MemoryStore e server riservati.

## Eventi pubblici

- Conflitto genera una Cassa di Rottami visibile e ne annuncia le coordinate.
- Raid genera un Nucleo instabile sotto un alto fascio luminoso.
- Estrazione converte i Nuclei portati nell'anello centrale in XP, crediti e punti squadra.

Gli eventi spingono le squadre fuori dalle rotte isolate e creano scontri prevedibili senza usare
un cerchio da battle royale.

## Punteggio e perdita

| Azione                 | Punti squadra |
| ---------------------- | ------------: |
| Neutralizzare un drone |            10 |
| Disattivare un rivale  |            25 |
| Estrarre un Nucleo     |           100 |

Vince la squadra con il punteggio più alto. Alla disattivazione il giocatore conserva strumenti
e Blaster, ma lascia tutti i Nuclei e metà delle risorse e consumabili. La squadra riceve sette
secondi di priorità sulla Cassa prima che possano aprirla i rivali. Il rischio è significativo,
ma non cancella progressione account e non forza una ripartenza completa.

Gli Ingressi usano una porta energetica scorrevole. I membri della squadra proprietaria possono
azionarla con il prompt nativo Roblox, compatibile con tastiera, controller e touch. I rivali
devono distruggere la struttura durante Raid o Estrazione.

## Confini dell'MVP

Il vertical slice esclude intenzionalmente veicoli, agricoltura, reti elettriche, terreno
procedurale, trading, clan e mondi persistenti settimanali. Non vanno sviluppati prima di aver
dimostrato nei playtest che raccolta, costruzione, combattimento e raid sono divertenti.
