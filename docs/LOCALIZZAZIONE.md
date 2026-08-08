# Localizzazione di WAR WORLD

La build usa l'inglese (`en-us`) come lingua sorgente e include traduzioni manuali per:

- italiano (`it-it`)
- spagnolo (`es-es`)
- portoghese brasiliano (`pt-br`)
- francese (`fr-fr`)
- tedesco (`de-de`)

HUD, tutorial, nomi degli oggetti, obiettivi, messaggi del server e prompt nel mondo usano la
stessa `LocalizationTable`. Il client sceglie automaticamente la lingua Roblox del giocatore e
si aggiorna se la lingua cambia. Se una traduzione non è disponibile, viene mostrato l'inglese.

## Dove modificare i testi

Tutte le frasi rivolte al giocatore si trovano in
`src/shared/localization/translations.ts`. Non aggiungere testi direttamente nei controller o nei
servizi: aggiungi una chiave alla tabella e usa `localized(...)` sul server oppure `Localizer` sul
client.

Le traduzioni manuali hanno la precedenza sulle traduzioni automatiche Roblox. Prima della
pubblicazione definitiva, italiano, spagnolo, portoghese, francese e tedesco devono comunque
essere riletti da madrelingua nel contesto del gioco: la correttezza grammaticale da sola non
garantisce che un pulsante corto o un termine di gameplay sia naturale.

## Controllo prima del test

1. Esegui `npm run check`: la build verifica chiavi duplicate e valori mancanti per tutte le sei
   lingue.
2. Apri la build in Studio e completa almeno un ciclo in italiano e in inglese.
3. Cambia la lingua dell'account Roblox di prova, riavvia la sessione e controlla tutorial, HUD,
   crafting, porte, casse e messaggi delle fasi.
4. Verifica che i testi lunghi non escano dai pannelli a 1280×720 e su un dispositivo mobile
   emulato.
5. Fai controllare le altre quattro lingue a giocatori madrelingua prima di attivare acquisti o
   campagne pubblicitarie.

## Pubblicazione

Nel Creator Dashboard imposta l'inglese come lingua sorgente dell'esperienza e abilita le lingue
supportate. La tabella inclusa nel progetto garantisce il comportamento della build; il portale
Roblox rimane utile per statistiche linguistiche, traduttori collaboratori e contenuti esterni al
place, come nome e descrizione dell'esperienza.
