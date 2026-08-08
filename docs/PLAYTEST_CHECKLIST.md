# Checklist di playtest WAR WORLD

Questa guida verifica il vertical slice come lo vivrebbe un giocatore. In Studio le fasi sono
volutamente brevi: una campagna completa dura circa tre minuti, più 15 secondi di riavvio.

## Avvio

1. Apri un terminale nella cartella `worldwar` ed esegui `npm run watch`.
2. Apri un secondo terminale nella stessa cartella ed esegui `npm run rojo:serve`.
3. Apri Roblox Studio e crea un'esperienza Baseplate vuota.
4. Apri il plugin Rojo, collegati a `localhost:34872` e conferma la sincronizzazione.
5. Nella scheda **Test**, avvia un server con almeno due client quando vuoi provare il PvP.
6. Tieni aperto **View → Output**. Devono apparire i messaggi di avvio del server e del client,
   senza errori rossi.

Per una prova veloce in singolo puoi anche aprire direttamente `build/WarWorld.rbxlx`; durante lo
sviluppo è preferibile la sincronizzazione live di Rojo.

## Raccolta — 45 secondi

- La guida deve aprirsi automaticamente all'inizio della campagna, avanzare per cinque passi e
  chiudersi sia dalla `×` sia da **INIZIA A GIOCARE**.
- Il piccolo pulsante `?` deve riaprire la guida senza coprire i controlli Roblox.
- Il personaggio deve comparire sulla piattaforma del colore della propria squadra.
- La visuale deve essere bloccata in prima persona e il mirino deve restare al centro.
- La barra inferiore deve rispettare l'ordine **1 Raccolta → 2 Costruisci → 3 Blaster → 4 Raid**.
- A sinistra deve comparire un solo pannello contestuale: Creazione oppure Costruzione.
- Mira a un albero, roccia, rottame o cespuglio entro 16 stud e usa **1 / RACCOGLI**.
- La quantità nell'inventario deve aumentare; il nodo esaurito scompare temporaneamente.
- Anche foglie, frammenti, tubi e luci del nodo devono scomparire e ricomparire insieme.
- Crea un Blaster e una Patch dai pulsanti a sinistra.
- Seleziona **2 / COSTRUISCI**, scegli una fondazione e posizionala vicino al personaggio.
- Premi **R** per ruotare un muro prima di piazzarlo.
- Con gamepad usa **LB/RB** per la modalità, **RT** per agire, **Y** per ruotare e **X** per la
  Patch.
- Costruisci un **Ingresso**. Avvicinati al pannello blu e usa il prompt `E`, touch o controller:
  deve scorrere verso l'alto e richiudersi.
- Da un giocatore rivale, lo stesso ingresso deve risultare bloccato.

## Conflitto — 60 secondi

- L'obiettivo HUD deve cambiare e il server deve annunciare una Cassa con le coordinate.
- Individua il fascio luminoso dell'evento e raccogli il contenuto della Cassa.
- Seleziona **3 / BLASTER**. I colpi mostrano un tracciante e un indicatore d'impatto; i compagni
  non devono subire danno.
- Alla disattivazione compare una Cassa di recupero e il giocatore rientra in partita.
- Per i primi sette secondi i rivali non possono aprire la Cassa; dopo possono raccoglierla.
  Multi-attrezzo e Blaster restano al giocatore disattivato.
- Una disattivazione rivale assegna 25 punti squadra; un drone ne assegna 10.
- Un client entrato nella prima metà del Conflitto deve ricevere il kit di recupero.

## Raid — 45 secondi

- I nuovi ingressi tardivi devono diventare spettatori invece di ricevere un kit ingiusto.
- Crea una Carica a impulsi vicino a un banco da lavoro pubblico o costruito.
- Seleziona **4 / RAID** e usa la Carica su una struttura rivale entro 14 stud.
- Le strutture amiche devono rifiutare il danno. L'integrità di quella rivale deve scendere fino
  alla distruzione.
- Deve comparire anche l'evento Nucleo instabile con il relativo fascio luminoso.

## Estrazione — 30 secondi

- Porta almeno un Nucleo energetico nell'anello ciano al centro dell'isola.
- Ogni Nucleo deve assegnare 100 punti squadra, 100 XP e 25 crediti.
- Il Nucleo deve lasciare l'inventario e il contatore estrazioni aumentare una sola volta per match.
- A fine campagna devono essere annunciati squadra vincitrice e punteggio.
- Dopo 15 secondi devono azzerarsi costruzioni, casse, punteggi, inventari e stato spettatore.

## Riconnessione e persistenza

- Esci e rientra nello stesso server Studio entro tre minuti: squadra, inventario e stato del
  match devono essere recuperati.
- Abilita **Game Settings → Security → Enable Studio Access to API Services** soltanto in
  un'esperienza di test separata prima di provare DataStore.
- Arresta e riavvia il server: con accesso API, XP e crediti devono tornare. Senza accesso API è
  previsto il profilo Studio temporaneo.

## Criterio di superamento

Il prototipo è pronto per un playtest esterno quando una campagna completa con due client
termina senza errori rossi in Output, danni non autorizzati, premi duplicati, porte bloccate o fasi
che non avanzano.
