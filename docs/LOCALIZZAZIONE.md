# Localization

English (en-us) is the source language. The catalog also contains Italian (it-it), Spanish
(es-es), Brazilian Portuguese (pt-br), French (fr-fr) and German (de-de).

Player-facing text belongs in [the shared catalog](../src/shared/localization/translations.ts),
including HUD labels, tutorial instructions, recipes, building names, objectives, server
messages and interaction prompts. Team proper names and WAR WORLD remain unchanged.

## Implementation

Server messages carry a typed localization key and formatting arguments. The client chooses its
Roblox locale and formats the message. The local catalog is available immediately, so missing or
delayed replication of the LocalizationTable must not prevent the interface from opening.
A replicated translator is used when available; the catalog supplies the fallback. Unsupported
locales fall back to English. Locale changes refresh visible text.

World ProximityPrompts use English source strings, AutoLocalize and the shared localization
table. Keep source strings stable and avoid constructing untranslated dynamic sentences directly
inside a service. Technical diagnostics may remain English in Output; player-visible failures
must use the catalog whenever the normal localization path is available.

## Adding or changing text

1. Add a typed key with values for all six languages.
2. Keep placeholders consistent across translations and pass arguments explicitly.
3. Update the relevant tutorial/control text when a key binding or gameplay rule changes.
4. Run the localization validator and build checks.
5. Inspect the result in the actual UI, including a long-text language on the smallest layout.
6. Have a fluent speaker review meaning and terminology in gameplay context.

```sh
npm run validate:localization
npm run check
```

The number of keys changes as features are added; use the validator's current output rather than
an old fixed count. Validation checks completeness and placeholders, not idiomatic translation,
cultural suitability, line wrapping or whether the instructions match the playable experience.

## Required language checks

- Play at least one full Studio round in English and Italian.
- Inspect Spanish, Portuguese, French and German for contextual accuracy before public release.
- Check tutorial pages, recipe costs, depot instructions, extraction progress, resource feedback,
  connection errors and every world prompt.
- Verify fallback with a locale outside the catalog and while the replicated table is delayed.
- Change locale during a session where the platform allows it and inspect already-open panels.
- Test 1280×720 desktop, small mobile landscape, device safe areas and console viewing distance.
- Ensure technical keys or unfilled placeholders never appear to players.

Technical documentation is maintained in English even though the game itself supports six
languages. The experience's public title/description and Creator Dashboard language settings
also require review; local catalog validation does not configure or certify those external fields.
