# RiftLab — contexto para seguir trabajando

Resumen de lo hecho el 25-10-2026 (sesión que quedó en otro chat por error). Léelo antes de seguir.

## Cómo se trabaja en este proyecto

- Next 16.4.3 con `cacheComponents` y `"use cache"`; las APIs difieren de versiones viejas: revisar `node_modules/next/dist/docs/` (ver AGENTS.md). Tras crear rutas nuevas: `npx next typegen`.
- App de escritorio Electron 45 (`desktop/`). Para ver cambios en la app hay que cerrarla, compilar y volver a abrir:
  1. Cerrar: `Get-Process electron | Stop-Process -Force`
  2. `npm run desktop:build` (falla con EBUSY si la app está abierta)
  3. Abrir: `electron.exe . --prod` en esta carpeta (o `RiftLab.cmd`)
- Prueba sin ventana: `electron . --prod --smoke` con `RIFTLAB_SMOKE_SHOT=captura.png`, `RIFTLAB_SMOKE_OVERLAY=flotante.png`, `RIFTLAB_SMOKE_CLICK=/ruta`.
- El servidor de desarrollo (`npm run dev`, puerto 3000) a veces queda con la barra lateral vieja en caché: reiniciarlo.
- Formato: prettier con `--print-width 140` (no hay config; sin ese ancho reformatea todo).
- Clave de Riot: `.env.local` o la guardada desde Ajustes (`%APPDATA%\riftlab\ajustes.json`, manda sobre la otra, también para los recolectores). Desde el 25-10-2026 está guardada en Ajustes una Personal API Key aprobada por Riot, que no vence (la del `.env.local` es una de desarrollo vieja).
- Repositorio público: https://github.com/R3N4X/riftlab (commits como `R3N4X <R3N4X@users.noreply.github.com>`, configurado solo en este repo). `gh` tiene dos cuentas: para subir cambios, `gh auth switch --hostname github.com --user R3N4X` y después volver a la del trabajo. `data/` no se sube (tiene Riot ID de terceros).

## Lo que se hizo

### Partidas y perfil
- Rango promedio de la partida en cada tarjeta y rango de cada jugador en el detalle (`src/lib/match-rank.ts`, `src/components/match-rank.tsx`, ruta `/api/partidas/[platform]/[matchId]/rango`).
- Tablas del detalle sin scroll, maestrías estilo cliente, botón Volver dorado (Alt+← y botones del mouse en la app).

### Perfil
- Cabecera con resumen (`src/components/profile-highlights.tsx`): insignia de partida en curso, **perfil de juego** (hexágono con Peleas, Daño, Oro, Objetivos, Supervivencia y Visión; cada eje compara las últimas 10 partidas con valores típicos de su rol en `BENCH`, 50 = promedio, nota general al centro, detalle al pasar el mouse) con un título según el eje más alto (o el más bajo si nada sobresale) y etiquetas que el hexágono no cubre (main, rol o "Juega de todo", racha, KDA, farm, duelos, multikills). Junto al servidor dice hace cuánto fue su última partida. La fila V/D va en el panel de resumen, no en la cabecera.
- Botón **Actualizar** (`src/components/refresh-profile.tsx`): `router.refresh()` sin recargar, muestra "Actualizando…" con ícono girando y al terminar dice cuántas partidas nuevas hay y cuántos LP cambió (o que no hay nada nuevo); debajo, "Actualizado hace X min".

### Página del campeón
- La columna lateral de la build muestra "Te cuesta contra", "Le ganas a" y "Mejores aliados".

### Buscador con sugerencias
- Riot solo busca por Riot ID exacto, así que hay un índice local de jugadores: `data/players/<servidor>.json` (lo escribe el agregador con los participantes de cada partida y el rango de los jugadores semilla) y `data/players/<servidor>.web.json` (perfiles abiertos en la app y sus partidas). Formato en `src/lib/player-index.ts`; búsqueda en `src/lib/players.ts`; API `/api/buscar?q=&platform=`.
- El buscador lateral muestra "Builds de campeones" y "Perfiles en LAS"; el de perfiles, solo perfiles. Lo escrito se marca en dorado. Solo aparecen jugadores que la app ya vio: el índice crece con el agregador corriendo.

### Ventana y colores
- Barra de título integrada (`titleBarStyle: "hidden"` + `titleBarOverlay` en `desktop/main.ts`): la app reserva 32 px con `--titlebar-h` (se inyecta con `insertCSS` en cada carga) y el div `.titlebar` del layout sirve para arrastrar. En el navegador el alto es 0.
- Paleta más oscura en `globals.css` (night #080c13, surface #0f151e, raised #172130, line #233143); el color de la barra es el mismo `NIGHT` de main.ts.

### Rango por defecto
- `DEFAULT_RANK = "ALL"` (`src/lib/constants.ts`): todas las páginas abren en "Todos" porque la muestra todavía es chica. Si algún día hay muchas más partidas, se puede volver a `EMERALD_PLUS`.

### Roles con pocas partidas
- En `getChampionStats` los mínimos se adaptan al rol (`need(base, fracción)`: nunca más que antes, nunca menos de 3), así un rol poco jugado igual muestra runas, objetos, counters y sinergias.
- Si ninguna página de runas completa llega al mínimo, `runePages` arma la más común casilla por casilla.
- Aviso en la página del campeón cuando el rol tiene menos de 300 partidas, con link a su línea principal.
- La nota de la tier list suaviza el winrate con k = 150 (antes 60) para que un rol raro con ~100 partidas no quede primero.

### Ajustes (`/ajustes`)
- Cuenta de League (automática desde el cliente o manual con Riot ID verificado), servidor por defecto, inicio con Windows, abrir en mi perfil, ventana flotante de TFT, clave de la API con reinicio.

### Sección TFT (`/tft`, recuadro propio en la barra lateral)
- Comps calculadas con partidas reales: `npm run aggregate:tft` (Retador/GM/Maestro de la2, euw1, kr, vn2 → `data/tft-meta.json`). Comp = carry con más objetos + rasgo principal no único. Correrlo seguido y tras cada parche.
- Catálogo (unidades, rasgos, objetos) desde Community Dragon `cdragon/tft/es_mx.json`; las variables de descripciones a veces vienen con hash FNV-1a del nombre (`src/lib/tft/data.ts`).
- Páginas: Comps, Campeones, Objetos (recetas), Rasgos, Modo partida.
- Ventana flotante en partida (Electron, siempre encima): se abre sola al detectar TFT (`gameflow session` con `gameMode === "TFT"`), Ctrl+Shift+T la muestra u oculta. Necesita el juego en modo sin bordes.
- Botón **Planificador**: guarda la comp en el Planificador de TFT del cliente (`/lol-tft-team-planner/v1/sets/...`) y la deja como recordatorio (el juego marca esas unidades en la tienda). Probado contra el cliente real.
- Cada comp muestra cómo se juega y su dificultad (`compStyle` y `compDifficulty` en `src/lib/tft/meta.ts`): reroll si el carry cuesta 3 o menos y termina con ~3 estrellas; si no, por nivel final promedio (≥ 8,75 o carry de 5 de oro = subir rápido al 9; ≥ 7,8 = subir al 8; si no, jugar al 7). La dificultad suma por nivel objetivo, unidades de 4-5 de oro y piezas alternativas; los motivos se muestran en el detalle.
- Guía de cada comp en Modo partida y la ventana flotante (`CompGuide` en `src/components/tft-comp.tsx`, botón "Ver guía"; la primera comp fijada viene abierta): cómo se juega, plan de niveles por etapa según el estilo, componentes a guardar (contados desde las recetas de los objetos de los carries), objetos por unidad con receta, unidades baratas para empezar, rasgos a activar y alternativas. Todo fijo por comp (reglas de Riot).
- Minimapa de posición (`CompBoard` en `tft-comp.tsx`, regla en `src/lib/tft/positioning.ts`): la API no trae posiciones, así que se arma con alcance, vida y armadura de cada unidad (Community Dragon `stats`): tanques adelante, carry cuerpo a cuerpo detrás de ellos, rango atrás con el carry en una esquina. Se ve en la guía del modo partida y en el detalle de cada comp.
- Filtro por dificultad en `/tft` (`?dificultad=facil|media|dificil`, con la cantidad de comps de cada una).
- Detalle de la comp: cada carry en su recuadro con sus objetos; al dejar el mouse 1 s sobre un objeto aparece su receta (`TftItemWithRecipe` en `src/components/tft.tsx`, solo CSS).
- Reglas de Riot para TFT: nada de recomendaciones que cambien según la partida, ni rastrear rivales, ni winrate/colocación de aumentos. Todo lo que se muestra en partida es fijo.

### En vivo (selección de campeones de LoL)
- Pantalla completa sin scroll: tarjeta del campeón + mejores elecciones (izquierda), encuentros (centro), **Builds Top 1/2/3** en pestañas + compra inicial y habilidades (derecha).
- **Mejores picks según el draft** (`getDraftPicks` en `src/lib/stats/index.ts`, panel `DraftPicks` en `src/app/en-vivo/page.tsx`): antes de bloquear, los 40 mejores del rol se reordenan por winrate esperado = winrate del rol (encogido, k 150) + rival de línea completo + otros rivales y aliados a la mitad; deja afuera elegidos y bloqueados y muestra los dos motivos más fuertes. Sin línea conocida (colas a ciegas) no recomienda.
- Con el campeón bloqueado, la columna izquierda muestra `EnemyIntel`: consejos de Data Dragon para jugar contra tu rival de línea y el tipo de daño del equipo rival.
- Al volver al menú, a la sala o al terminar la partida, En vivo vuelve a quedar vacía (antes se quedaba con la última selección).
- **Importación automática** (`AutoImportBuild` en `src/components/live-client.tsx`, dentro de `BuildPacks`): una sola vez por selección, cuando tu campeón está bloqueado y la etapa es FINALIZATION (o GAME_STARTING), importa el Top 1 con el draft completo. Se vuelve a habilitar al salir de la selección. Solo funciona con la página En vivo abierta (la app salta sola a ella al entrar a la selección).
- **Importar build** (`desktop/lcu.ts` → `importBuild`): página de runas, hechizos (solo en selección) y set de objetos en la tienda con bloques Compra inicial, Build completa (6), Según la partida (armadura/RM según daño rival, heridas graves contra curación), Situacionales y Consumibles.
- Si ninguna combinación exacta de 3 objetos llega al mínimo, el núcleo se arma con los objetos más repetidos (`coreItems` en `src/lib/stats/index.ts`).

### Resumen al terminar la partida (`/resumen/[platform]/[matchId]?yo=<puuid>`)
- `src/lib/game-review.ts` (`getGameReview`): nota S a D (promedio de los seis ejes de `src/lib/performance.ts`, el mismo módulo que usa el hexágono del perfil), puesto entre los 10 en daño, oro, súbditos (no a soportes), visión y daño recibido; fase de líneas contra el rival directo a los 10 y 15 (oro, súbditos, experiencia, de la línea de tiempo) con la diferencia típica de ese enfrentamiento del agregado; asesinatos/muertes/asistencias en el tiempo; build en orden de compra contra el núcleo Top 1 y consejos (farm, muertes tempranas, visión y guardianes de control, participación, daño, objetivos, línea, build).
- La línea de tiempo (`src/lib/timeline.ts`) ahora trae súbditos, experiencia y asesinatos por minuto.
- La app salta sola al resumen al terminar una partida con cola (`lastGame` en `LiveState`, lo llena `desktop/lcu.ts` con el `gameId` de la sesión; `LiveWatcher` navega al entrar a WaitingForStats/PreEndOfGame/EndOfGame). Si Riot todavía no publica la partida, la página reintenta sola cada 20 s.
- Cada tarjeta de partida desplegada tiene el botón "Ver análisis de la partida".

### Pantalla de carga (En vivo, ya en partida)
- `LoadingScreen` (`src/components/loading-screen.tsx`) pide `/api/en-vivo/jugadores` una vez por partida (`src/lib/live-players.ts`: espectador + liga + maestría con el campeón + últimas 3 partidas, todo en caché; las partidas se saltan si la región está cerca del límite) y muestra los 10 jugadores con rango, winrate, maestría, últimas partidas y avisos (primera vez / poca experiencia / main, rachas, winrate alto, recién subió, hace X días no lo juega).
- Para probarla en el navegador sin estar en partida: `/en-vivo?jugadores=la2:<puuid de alguien en partida>`.

### Aviso de tilt
- `src/lib/tilt.ts` (`tiltCheck`): mira la sesión actual (partidas con menos de 90 min entre una y otra; nada si la última terminó hace más de 3 h o si ganó la última). Motivos: 3 o más derrotas seguidas, nota de las últimas 3 partidas 10 puntos o más bajo lo habitual (la misma nota del resumen), muertes ≥ 6 y 1,5 veces lo habitual, 6 o más partidas seguidas con mayoría de derrotas. Nivel "alto" con 4 derrotas seguidas o 3 motivos.
- `TiltBanner` (`src/components/tilt-notice.tsx`) en el perfil (bajo la cabecera) y en el resumen post-partida (`SessionTilt`, con las últimas 10 partidas; se salta si `isRiotBusy`).

### Amigos en partida (solo app de escritorio)
- `desktop/lcu.ts` lee `/lol-chat/v1/friends` cada 15 s (no gasta consultas a Riot) y lo publica en `LiveState.friends` (en partida, en selección, en cola, conectado; campeón, cola y hora de inicio).
- Recuadro "Amigos jugando" en la barra lateral (`FriendsBox` en `src/components/friends.tsx`): quién está en partida o en selección, con estrella para los que juegas seguido (`/api/frecuentes`, `src/lib/frequent.ts`: compañeros repetidos en tus últimas 20 partidas). Campana para activar o desactivar los avisos (localStorage).
- `FriendAlerts` (en el layout): aviso de Windows cuando alguien con quien juegas seguido entra a partida; al hacer clic trae la ventana al frente (`focusWindow` en el puente) y abre `/espectar/[platform]/[puuid]`, que muestra su partida con la misma vista de la pantalla de carga.

### Comparar jugadores (`/comparar?a=la2:Nombre-TAG&b=la2:Nombre-TAG`)
- `src/lib/compare.ts`: cuenta, rango y resumen de las últimas 20 partidas de cada uno, más las partidas en común (juntos / en contra).
- La página muestra los dos hexágonos superpuestos (dorado y azul, `profileStyle` de `profile-highlights.tsx`), tabla cara a cara con el mejor en verde, campeones más jugados y "Entre ustedes". Botón "Comparar con otro jugador" en cada perfil; el buscador de la página usa `SummonerSearch` con `compareWith`.

### Build según el rival
- El agregador guarda en cada rol `vs[<key del rival directo>]`: partidas, victorias, primeros 4 objetos completos y runa clave (solo desde el 25-10-2026; los datos viejos no lo tienen).
- `getMatchupOpponents` y `getMatchupBuild` en `src/lib/stats/index.ts`: objetos más comprados contra ese rival, los que suben respecto a lo normal (`risers`, +8 % o más) y la runa clave.
- `src/components/matchup-build.tsx`: recuadro "Build según el rival" en la página del campeón (`?rival=<key>`, elige entre los rivales con datos) y versión corta "Contra X se compra más" en En vivo (selección con el campeón bloqueado y en partida).

### Objeto de soporte
- El Mapamundi (3865) ahora se entrega gratis y no aparece como compra en la línea de tiempo: la compra inicial de los soportes quedaba solo con pociones. `withSupportItem` en `src/lib/stats/index.ts` lo agrega a la compra inicial de los soportes (página del campeón, En vivo y set de objetos).
- El agregador guarda la mejora final elegida (`support`, ids 3869/3870/3871/3876/3877; desde el 25-10-2026): "Mejora del objeto de soporte" en la página del campeón y como bloque del set de objetos importado.

### Instalador y actualizaciones automáticas
- `npm run dist` → `dist-installer/RiftLab-Setup-<versión>.exe` (NSIS de un clic, por usuario, sin permisos de administrador), `latest.yml` y `.blockmap`. Configuración en `package.json` → `build`.
- El instalador lleva el servidor standalone (`scripts/stage-installer.ts` lo copia a `build/server` con las carpetas `node_modules` renombradas a `_node_modules`, porque electron-builder las descarta; `restoreServerModules` en `desktop/main.ts` las renombra al primer arranque), una copia de `data/` (meta, TFT, parches, índice de jugadores) y el ícono. Instalada, la app usa `resources/server` y `resources/data`.
- `next.config.ts` excluye `data`, `dist-installer`, `build` y `scripts` del rastreo de archivos (antes se copiaban al servidor).
- Actualizaciones: `electron-updater` con proveedor genérico. La dirección (carpeta https con `latest.yml` y el instalador) se guarda en Ajustes → Actualizaciones (`updateUrl` en `ajustes.json`) o en `RIFTLAB_UPDATE_URL`. Busca al abrir y cada 6 h, descarga sola y se instala al cerrar o con "Reiniciar y actualizar". Para publicar una versión: subir `version` en package.json, `npm run dist` y subir `latest.yml`, el `.exe` y el `.blockmap` a esa carpeta. Sin dirección configurada no busca.
- Probado: el paquete arranca su servidor y sirve las páginas con los datos incluidos.
- Desde la 0.2.0 las actualizaciones salen de GitHub Releases de `R3N4X/riftlab` (`build.publish` en package.json → `app-update.yml`; la dirección propia de Ajustes es opcional). El instalador ya no lleva `data/players` (Riot ID de terceros, el instalador es público). Para publicar: subir `version`, `npm run dist` y `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\publicar-version.ps1` (sube el código, crea el Release con el .exe, .blockmap y latest.yml, y vuelve a la cuenta de gh que estaba activa). `npm run release` hace las dos cosas. Claude no puede publicar Releases por su cuenta (el modo automático lo bloquea): lo corre el usuario. La 0.2.0 quedó publicada el 26-10-2026 (https://github.com/R3N4X/riftlab/releases/tag/v0.2.0).
- Desde la 0.2.1 la app instalada no necesita clave: usa el intermediario del grupo (ver abajo); una clave pegada en Ajustes manda sobre él. La carpeta de ajustes es la misma que la de la app del proyecto (`%APPDATA%\riftlab`).

### Intermediario del grupo (sin clave propia)
- `intermediario/`: Cloudflare Worker (plan gratis) que guarda la clave de Riot como secreto (`RIOT_API_KEY`) y responde `/{host}/{ruta de Riot}`. Exige el código del grupo en `X-RiftLab-Code` (secreto `GROUP_CODE`), solo GET, solo los servidores y regiones de RiftLab y rutas `lol/`, `tft/` y `riot/`. Las partidas y líneas de tiempo terminadas se guardan en la caché del borde (puede no tener efecto en `*.workers.dev`; con dominio propio sí).
- La app (`src/lib/riot.ts`) usa la clave propia si hay (Ajustes o `.env.local`) y, si no, el intermediario (`RIFTLAB_PROXY_URL` + `RIFTLAB_PROXY_CODE`). Instalada, los lee de `resources/proxy.json`, que arma `scripts/stage-installer.ts` desde el `.env.local` (`npm run dist` falla si faltan). Ajustes muestra "Usando el servidor del grupo".
- Desplegar o cambiar la clave: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\desplegar-intermediario.ps1` (inicia sesión en Cloudflare si hace falta, despliega, carga los secretos desde el `.env.local`, lo prueba y anota `RIFTLAB_PROXY_URL`). Lo corre el usuario.
- El código del grupo viaja dentro del instalador público: es una barrera simple, no un secreto fuerte. La clave nunca sale de Cloudflare. Todos comparten el límite de la clave (la app tiene el 70 % en la2/americas; el recolector, el 30 %).
- Desplegado el 26-10-2026 en `https://riftlab.la-fecha-futbolera.workers.dev` y publicado en la 0.2.1 (https://github.com/R3N4X/riftlab/releases/tag/v0.2.1). Si `npm` falla por la política de ejecución de PowerShell, usar `npm.cmd`; antes de `npm run dist` hay que cerrar RiftLab (bloquea `.next/standalone`).
- Probado en local con `wrangler dev`: 403 sin código o con código malo, 404 con host o ruta fuera de la lista, 405 con POST, perfil completo cargado sin clave propia.

### Recolector automático
- `scripts/recolector.ps1`: ciclo sin fin (LoL en cada vuelta, TFT cada 4, 5 min de pausa entre vueltas), una sola copia (mutex), registro en `%LOCALAPPDATA%\riftlab\recolector.log` (rota a los 5 MB).
- Arranca solo con la tarea programada "RiftLab recolector" (al iniciar sesión, con 1 minuto de espera; PowerShell oculto). Desde el 26-10-2026 también tiene un disparador que la lanza cada hora: si el ciclo murió, vuelve a arrancar; si sigue vivo, el Programador ignora el lanzamiento (IgnoreNew) y el mutex lo respalda. Ese día el ciclo se había cortado a las 9:23 con 0xC000013A (cierre de consola) sin causa clara. No depende de la app ni de Claude. Para detenerlo o que no arranque más: finalizar o deshabilitar esa tarea en el Programador de tareas.
- Ojo: la app de Claude es un paquete de Windows y todo lo que se lanza desde Claude ve una copia propia de `%APPDATA%` y `%LOCALAPPDATA%` (en `AppData\Local\Packages\Claude_…\LocalCache`). Por eso el registro que se ve desde Claude no es el real, y la clave pegada en Ajustes desde una app abierta por Claude no la ve el recolector de la tarea. La clave personal quedó también en `.env.local` (carpeta del proyecto, que no se duplica): ahí la leen todos. Si la clave de Ajustes está vencida y la del `.env.local` funciona, la app usa esta y borra la vencida (`pickApiKey` en `desktop/main.ts`). Para abrir la app desde Claude sin esa copia: `explorer.exe "C:\Users\Usuario\Desktop\RiftLab.lnk"`.
- Ya no hace falta lanzar `npm run aggregate` a mano. Si se lanza a mano mientras corre el ciclo, se duplican las consultas.

### Límite de la API (100 consultas cada 2 min, compartido con el agregador)
- El agregador usa solo el 30 % en la2 y americas (`--reserve`), la app el resto.
- `src/lib/riot.ts` cuenta las consultas de la app por host; tras un 429 bloquea ese host hasta que pase el `retry-after` (no insiste). El rango de cada jugador de las tarjetas (`src/lib/match-rank.ts`) se salta si `isRiotBusy` (≥ 45 consultas en 2 min), para no dejar sin consultas al perfil.
- Si el perfil igual choca con el límite, el aviso hace una cuenta regresiva y se reintenta solo (`AutoRetry` en `src/components/refresh-profile.tsx`).

### Revisión de políticas de Riot y QA (26-10-2026)
- Políticas aplicadas: aviso legal con el texto exacto (`LEGAL_NOTICE_EN`/`LEGAL_NOTICE_ES` en `src/lib/constants.ts`; inglés en la barra lateral, ambos en Ajustes), importación automática de la build apagada por defecto (ajuste `autoImport`; Riot no aprueba apps que decidan por el jugador) y uso del cliente (LCU) declarado en la página y en la solicitud. Ya cumplía: clave fuera del cliente, sin rivales en la selección de clasificatorias, sin winrates de aumentos ni Arena, sin historial de personalizadas.
- QA automático con el proyecto local de QA (resultados en `qa/`, ignorado por git): 38 casos, 31 pasaron. Corregido: página 404 y de error en español (`src/app/not-found.tsx`, `src/app/error.tsx`) y desborde a 375 px en la página del campeón (runas en una columna en tarjetas angostas). Se dejaron a propósito los términos de jugador "Tier list", "Winrate", "Pick", "Ban", "Build" y "Counters".

### Página pública y clave Production
- `docs/` es la página pública de RiftLab para GitHub Pages (`index.html`, `privacidad.html`, `estilo.css`, `capturas/` tomadas con Edge sin ventana desde el servidor compilado, `.nojekyll`). Se publica desde Settings → Pages → rama `main`, carpeta `/docs` → `https://r3n4x.github.io/riftlab/`. Lo activa el usuario.
- `docs/clave-production-riot.md`: pasos y textos en inglés para pedir la clave Production.

### Clave personal de Riot
- Guía para pedirla y texto sugerido para el formulario en `docs/clave-personal-riot.md`. Hay que pedirla desde la cuenta de Riot del usuario; la app ya la acepta en Ajustes (mismo formato `RGAPI-`).

## Pendiente / ideas
- Probar en real: salto al resumen al terminar una partida, pantalla de carga con la app, avisos de amigos y una actualización publicada.
- Elegir dónde publicar las actualizaciones (por ejemplo, un repositorio de GitHub con Releases o cualquier carpeta https) y ponerla en Ajustes.
- Probar en partida real: ventana flotante, atajo, recordatorio del Planificador e "Importar build" (el set de objetos ya se vio en el cliente).
- Historial de TFT en el perfil del jugador.
- Builds según el rival: el agregador de LoL no guarda builds por enfrentamiento; habría que ampliarlo.
- Supports: la compra inicial sale solo con poción (parece que el objeto de soporte ahora es gratis).
