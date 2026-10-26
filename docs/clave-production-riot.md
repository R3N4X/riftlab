# Clave Production de Riot

La clave personal alcanza para el grupo. La **Production** sube el límite a 500 consultas cada 10 segundos y 30.000 cada 10 minutos por región, pero es para productos **públicos**: cualquiera podría descargar RiftLab.

## Antes de pedirla

1. **Publicar la página de RiftLab** (carpeta `docs/` del repositorio) con GitHub Pages:
   GitHub → repositorio `R3N4X/riftlab` → **Settings → Pages** → *Source*: **Deploy from a branch** → rama `main`, carpeta `/docs` → **Save**.
   Queda en `https://r3n4x.github.io/riftlab/` (tarda uno o dos minutos).
2. Revisar que la página cargue, que el botón de descarga lleve al último instalador y que la página de privacidad abra.
3. La versión publicada tiene que usar el intermediario (desde la 0.2.1): Riot exige que la clave no vaya dentro de la app.

## Cómo pedirla

En https://developer.riotgames.com → tu nombre → **Apps** → **Register Product** → **Production API Key**. Texto sugerido (el formulario es en inglés):

- **Product name:** RiftLab
- **Product URL:** https://r3n4x.github.io/riftlab/
- **Product description:**
  > RiftLab is a free Windows desktop app for League of Legends and TFT players (no ads, no accounts, open source at https://github.com/R3N4X/riftlab). It shows a player's match history with a performance score per game, champion builds and matchup statistics aggregated from ranked matches, a loading-screen view with each player's rank once the game has started, and a post-game summary with improvement tips and a break suggestion after a losing streak. The API key is never shipped in the client: requests go through a small intermediary (Cloudflare Worker) that holds the key as a secret, only allows the endpoints we use (account-v1, summoner-v4, league-v4, champion-mastery-v4, match-v5, spectator-v5, tft-league-v1, tft-match-v1), caches finished matches and passes Riot's rate-limit headers back to the app. The desktop app also reads the local League Client (LCU) to know the player's account, champion select (allies and visible champions only), game phase and friends' presence; it only writes to the client when the player asks for it (import a rune page, summoner spells or an item set, or save a comp to the TFT Team Planner). Auto-import on lock-in is off by default and must be enabled by the player in Settings. LCU endpoints: /lol-summoner/v1/current-summoner, /lol-champ-select/v1/session (+ /my-selection for spells), /lol-gameflow/v1/gameflow-phase, /lol-gameflow/v1/session, /lol-chat/v1/friends, /lol-champion-mastery/v1/local-player/champion-mastery, /lol-perks/v1/pages, /lol-item-sets/v1/item-sets/{summonerId}/sets, /lol-tft-team-planner/v1/sets, /riotclient/region-locale. We respect the policies: no opponent information during ranked champion select, nothing that changes during TFT games, no win rates for augments or Arena items, no custom-game match history, no hidden information, and the exact legal boilerplate is shown in the app's sidebar and on the website. Aggregated statistics come from a background collector that samples ranked players per region and only publishes anonymous aggregates.
- **Why do you need a Production key:** friends started using the app and the personal key's 100 requests every 2 minutes per region is shared by everyone plus the statistics collector; a profile load costs 20–25 requests, so several users at once hit the limit.

## Mientras revisan

- Riot puede responder por mensajes en el portal pidiendo cambios: hay que contestar ahí.
- Si la aprueban, se cambia la clave solo en el intermediario (`RIOT_API_KEY` en el `.env.local` y `scripts\desplegar-intermediario.ps1`); las apps instaladas no necesitan actualizarse.
