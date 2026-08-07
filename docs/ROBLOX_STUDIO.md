# Roblox Studio: ciò che ti serve davvero

Il progetto è volutamente **code-first**. Non devi scrivere Luau dentro Roblox Studio:
programmiamo in TypeScript e lasciamo a roblox-ts il compito di tradurlo.

Studio rimane indispensabile perché è il motore che esegue fisica, personaggi, server e client,
mostra il mondo 3D e pubblica il gioco su Roblox.

## Primo avvio rapido

Il file `build/WarWorld.rbxlx` è già stato generato. Fai doppio clic sul file, oppure aprilo da
Studio con **File → Open from File**, poi premi **Play**. È il modo più semplice per vedere subito
il prototipo; il mondo compare quando parte il server ed è normale che prima sembri vuoto.

## Collegamento per sviluppare

1. Installa e apri il plugin ufficiale Rojo in Roblox Studio.
2. Nel terminale, entra nella cartella `worldwar` ed esegui `npm run watch`.
3. In un secondo terminale, nella stessa cartella, esegui `npm run rojo:serve`.
4. Apri un'esperienza Baseplate vuota in Studio.
5. Dal plugin Rojo collegati a `localhost:34872` e accetta la prima sincronizzazione.
6. Premi **Play**. Ogni modifica TypeScript valida verrà ricompilata e sincronizzata.

## I pannelli da imparare per primi

- **Explorer**: mostra la gerarchia di tutti gli oggetti del gioco.
- **Properties**: contiene i valori dell'oggetto selezionato.
- **Output**: mostra messaggi, avvisi ed errori di client e server.
- **Test**: avvia un server locale con uno o più giocatori simulati.
- **Developer Console / MicroProfiler**: aiuta a trovare problemi di rete o prestazioni.

Non devi modificare manualmente gli script presenti in Explorer: verrebbero sovrascritti dalla
sincronizzazione. Modifica sempre i file TypeScript dentro `src`.

## Test con più giocatori

Apri **Test → Server & Clients**, scegli almeno due client e avvia la sessione. Ogni finestra è un
giocatore separato collegato allo stesso server locale. In questo modo puoi verificare PvP,
proprietà delle costruzioni, casse di recupero, punteggi e cambi di fase.

Una campagna Studio dura circa tre minuti; quella pubblica è configurata per 35 minuti.

## Regola di sicurezza importante

Non inserire modelli casuali dal Toolbox. Possono contenere script indesiderati, backdoor o asset
molto pesanti. Importa soltanto elementi controllati e conserva tutta la logica di gameplay in
questo progetto.

Per provare i salvataggi in Studio usa un'esperienza di test separata e abilita l'accesso API
soltanto lì. Senza accesso API il progetto usa intenzionalmente un profilo temporaneo.
