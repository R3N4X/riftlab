# RiftLab

App de escritorio (Windows) y web de estadísticas de League of Legends y TFT, al estilo de op.gg, Porofessor, iTero o Blitz.
Es un proyecto personal para mí y un grupo de amigos: no es público, no tiene publicidad y no se monetiza.

> **English summary:** RiftLab is a personal desktop app (Electron + Next.js) for a small group of friends. It shows match history,
> a post-game summary, champion builds and matchup statistics aggregated from ranked matches, and reads the local League client to
> suggest picks during champion select. It uses ACCOUNT-V1, SUMMONER-V4, LEAGUE-V4, MATCH-V5, CHAMPION-MASTERY-V4 and SPECTATOR-V5,
> always within the rate limits. RiftLab isn't endorsed by Riot Games.

## Funciones principales

- **Perfil:** historial con detalle desplegable, perfil de juego (hexágono contra el promedio del rol), compañeros frecuentes y comparación entre dos jugadores.
- **Resumen al terminar cada partida:** nota, fase de líneas, muertes en el tiempo, build contra la más usada y consejos.
- **En vivo (app de escritorio):** recomendaciones de picks según el draft, importación de runas, hechizos y set de objetos, y pantalla de carga con los 10 jugadores.
- **Campeones:** tier list, builds, counters con motivo, sinergias y build según el rival.
- **TFT:** comps con dificultad, guía y posición sugerida.
- **Amigos:** aviso cuando un amigo frecuente entra a partida.

## Qué incluye

| Sección | Ruta | Datos |
| --- | --- | --- |
| Inicio con buscador de invocadores | `/` | Todo lo de abajo, resumido |
| Tier list por línea y rango | `/tier-list?role=BOTTOM&rank=EMERALD_PLUS` | Dataset agregado |
| Campeones y builds (runas, objetos, habilidades, counters, aliados) | `/campeones/Ahri?role=MIDDLE` | Data Dragon + dataset agregado |
| Sinergias: dúos de línea inferior y parejas de equipo | `/sinergias` | Dataset agregado |
| Notas del parche (oficiales) y cambios detectados en los datos | `/parche` | leagueoflegends.com + Data Dragon |
| Perfil de invocador: rango, maestrías, historial, partida en vivo, compañeros | `/invocador/la1/Nombre-TAG` | API de Riot en vivo |

## De dónde sale la información

Ninguna de estas páginas tiene una API pública propia: todas construyen sus números a partir de la **API oficial de Riot**.
Copiarles los datos (scraping de op.gg, u.gg, etc.) viola sus términos de uso y se rompe con cada cambio de su HTML, así que
RiftLab hace lo mismo que ellos, desde las fuentes originales:

- **Data Dragon** (`ddragon.leagueoflegends.com`, sin clave): campeones, habilidades, objetos, runas, hechizos, íconos y splash arts de cada versión.
- **Community Dragon** (`raw.communitydragon.org`, sin clave): íconos de rangos y posiciones.
- **API de Riot** (`developer.riotgames.com`, con clave): cuentas por Riot ID, rango, maestrías, historial, partida en vivo y las partidas que alimentan las estadísticas.
- **leagueoflegends.com/es-mx**: notas del parche oficiales, que se parsean y se muestran con diseño propio enlazando siempre al original.
- **Meraki Analytics** (dataset comunitario abierto): solo para saber en qué línea juega cada campeón dentro del dataset de demostración.

### Estadísticas reales vs. demostración

La tier list, las builds y las sinergias se calculan a partir de `data/meta.json`. Si ese archivo no existe, la app genera un
**dataset de demostración** con campeones, objetos y runas reales del parche pero porcentajes inventados (la UI lo avisa).

Para usar partidas reales:

```bash
cp .env.local.example .env.local   # y pega tu RIOT_API_KEY
npm run aggregate -- --platform la2 --players 10 --matches 8
```

El agregador muestrea jugadores de cada división, baja sus partidas clasificatorias del parche actual (con línea de tiempo para
orden de compra y de habilidades) y acumula conteos. Se puede correr varias veces: suma partidas nuevas sin repetir.
Con una Development Key rinde ~25 partidas por minuto; para volumen de producción hay que pedir una Production Key a Riot.

## Desarrollo

```bash
npm install
npm run dev
```

Otros comandos: `npm run build`, `npm run lint`, `npm run typecheck`, `npm run sync:positions` (actualiza `src/data/positions.json`).

## Estructura

```
src/lib/ddragon.ts       Data Dragon (cacheado por hora)
src/lib/riot.ts          Cliente de la API de Riot con reintentos ante 429
src/lib/patchnotes.ts    Lista y parser de notas del parche oficiales
src/lib/patchdiff.ts     Diferencias de estadísticas entre versiones
src/lib/stats/           Dataset (tipos, demo) y consultas: tier list, builds, sinergias
scripts/aggregate.ts     Agregador de partidas reales → data/meta.json
src/app/                 Páginas (App Router, Cache Components)
```

## Próximos pasos sugeridos

- Base de datos (Postgres o SQLite) y un worker programado en lugar de `data/meta.json`.
- Comparar con el parche anterior para mostrar subidas y bajadas en la tier list.
- App de escritorio con Tauri o Electron y el LCU API del cliente para overlay en selección de campeones (como Porofessor y Blitz).
- Cuentas de usuario, favoritos y seguimiento de LP.

RiftLab no está respaldado por Riot Games. League of Legends es marca registrada de Riot Games, Inc.
