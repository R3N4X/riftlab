# Clave personal de Riot (Personal API Key)

La clave de desarrollo vence cada 24 horas. Para que RiftLab funcione sin renovarla todos los días (y para que tus amigos la usen), conviene pedir una **Personal API Key**: es gratis, no vence y tiene los mismos límites (100 consultas cada 2 minutos por región).

## Cómo pedirla

1. Entra a https://developer.riotgames.com con tu cuenta de Riot.
2. Arriba a la derecha: tu nombre → **Apps** → **Register Product**.
3. Elige **Personal API Key** (no "Production": esa es para productos públicos y exige mucho más).
4. Completa el formulario. Texto sugerido (el formulario es en inglés):
   - **Product name:** RiftLab
   - **Product description:** Personal desktop app for me and a few friends. It shows our match history, a post-game summary, champion builds and matchup statistics aggregated from ranked matches, and reads the local League client to suggest picks during champion select. For now it is not public, has no ads and is not monetized. If it grows, we may consider releasing it publicly in the future, and in that case we would apply for a Production API Key and follow Riot's policies for public products.
   - **Product URL:** se puede dejar vacío o poner "Personal use, not published".
5. Riot la revisa (puede tardar desde horas hasta un par de semanas). Mientras tanto sigue funcionando la clave de desarrollo.

## Cuando la aprueben

- Copia la clave nueva (empieza con `RGAPI-`) y pégala en **Ajustes → Clave de la API de Riot**. La app la prueba, la guarda y se reinicia.
- Si usas el proyecto, también puedes ponerla en `.env.local` como `RIOT_API_KEY=...` (la de Ajustes manda).
- El recolector de datos (`npm run aggregate`) usa la del `.env.local`.
- Para que tus amigos no necesiten clave, la del `.env.local` se carga en el intermediario del grupo con `scripts\desplegar-intermediario.ps1`: queda guardada en Cloudflare, nunca en el instalador.

## Reglas que hay que respetar

- No publicar la app ni la clave: es para uso personal y de un grupo chico.
- No mostrar datos de rivales que el juego oculta (por ejemplo, nombres en la selección de campeones de clasificatorias). RiftLab ya respeta esto: los jugadores rivales se muestran recién en la partida.
- En TFT, nada que cambie según la partida en curso (ya está así en RiftLab).
