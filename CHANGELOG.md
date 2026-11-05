# Cambios de RiftLab

Cada versión publicada, de la más nueva a la más vieja. El texto de cada versión es también el de su página de descarga en GitHub (lo toma `scripts/publicar-version.ps1`).

## 0.2.25 (05-11-2026)

- Nuevo panel "Sesión de hoy" en el perfil, con las partidas desde las 5:00 de todas las colas:
  - victorias, derrotas y winrate del día;
  - LP ganados o perdidos y tu rango actual (en las clasificatorias jugadas con la app abierta);
  - racha y tiempo jugado (desde las 3 horas se marca en dorado);
  - nota del día comparada con lo habitual.
- Cada partida del día aparece en orden con su campeón y resultado. Al pasar el mouse muestra el detalle y al tocarla abre su resumen.

## 0.2.24 (05-11-2026)

- "Aceptar la partida sola" acepta aunque lleves rato sin usar el computador (antes no aceptaba después de 3 minutos sin actividad). Sigues pudiendo rechazarla en el cliente o cancelar desde RiftLab en esos 3 segundos.

## 0.2.23 (05-11-2026)

- Nueva opción en Ajustes → Selección de campeones: "Aceptar la partida sola". Viene apagada. Acepta 3 segundos después de encontrar partida, con un aviso y un botón "Cancelar"; si la rechazas en el cliente o llevas más de 3 minutos sin usar el computador, no la acepta.

## 0.2.22 (04-11-2026)

- El set de objetos que se importa a la tienda vuelve a traer "Según la partida" (armadura, resistencia mágica o anticuración según los rivales) y "Situacionales". Con campeones de pocas partidas registradas, como Poppy soporte, esos bloques quedaban vacíos; ahora se completan con objetos típicos de su clase.
- Hover nuevos en toda la app: un recuadro de ancho fijo con título, filas y viñetas en vez del globo de texto largo del sistema.
- Al pasar el mouse por un objeto aparece su ficha: precio, estadísticas y efectos.
- Las recomendaciones de En vivo muestran en el hover su puntaje, el winrate esperado, tu maestría, los motivos y el aviso de pocas partidas, cada uno por separado.

## 0.2.21 (04-11-2026)

- Worlds: DK ya aparece en su cruce de cuartos contra BLG (Leaguepedia lo escribía con otras mayúsculas y quedaba "Por definir").

## 0.2.20 (04-11-2026)

- Pestaña "Bloqueos" en la selección: sugiere qué bloquear según tu línea (los rivales que más les cuestan a los campeones que más juegas o, si no hay datos tuyos, los más fuertes de la línea). Al tocar uno queda marcado en el cliente, sin confirmar el bloqueo, cuando es tu turno.
- Las recomendaciones tienen en cuenta lo que le falta a tu equipo: suben los campeones de daño mágico si casi todo es físico (y al revés) y los tanques si nadie aguanta daño.
- Las recomendaciones con pocas partidas se marcan con "?" y avisan por qué el puntaje es menos confiable.
- En la pantalla de carga se destaca a tu rival de línea, con consejos para jugarle y la build que suele armar.
- Al terminar la partida se abre siempre tu resumen; ya no aparece la opción de elegir el de otro jugador.
- El botón "Volver" también aparece al pasar de un campeón a otro (por ejemplo, de Aatrox a uno de sus counters) o al abrir un campeón desde En vivo o un perfil. Desde la lista de campeones o la tier list sigue sin aparecer.
- La sección de Worlds queda una semana más después de la final y luego desaparece sola.
- La descripción de la app en Windows ya no tiene caracteres dañados.

## 0.2.19 (04-11-2026)

- La pantalla de carga marca a los premades de los dos equipos: una franja del mismo color arriba de sus tarjetas y "Dúo con X" (o trío, grupo de 4...). Se deduce de sus últimas partidas: con 2 o más juntos es premade; con una sola dice "Posible", porque puede ser casualidad.
- La build se importa sola aunque durante la selección estés en otra sección de la app (antes solo funcionaba con En vivo abierto).
- Al tocar una recomendación, el campeón queda seleccionado en el cliente de League sin fijarlo: fijarlo sigue siendo tu decisión.
- Las recomendaciones muestran primero "Tus campeones" (los que más juegas que encajan en el draft) y después los mejores para el draft. Solo aparecen campeones que tienes y que nadie eligió ni bloqueó.
- El botón "Volver" aparece solo donde sirve: al abrir un perfil, una partida, un resumen o una comparación desde otra página. Ya no aparece en las secciones de la barra lateral ni en lo que se abre desde ella.

## 0.2.18 (01-11-2026)

- Selección de campeones renovada: cada campeón se evalúa con puntajes de 0 a 5 (2.5 es parejo, desde 3 es ventaja) en la puntuación global, la fase de líneas, la sinergia, el counter y la ventaja temprana.
- Antes de elegir se muestra el mejor pick para tu línea, y las recomendaciones aparecen en una grilla de 15 campeones con su puntaje. Al tocar uno ves cómo cambian los números frente a tu campeón actual.
- La puntuación global usa el mismo cálculo que las recomendaciones, así que el mismo campeón tiene el mismo puntaje en los dos lugares.
- Pestañas "Recomendaciones" y "Emparejamiento" (consejos y qué comprar contra tu rival de línea).
- El ícono de RiftLab en la barra de tareas ya no vuelve al de Electron después de un aviso de Windows.

## 0.2.17 (31-10-2026)

- Los picks recomendados en la selección son solo de campeones que de verdad se juegan en tu línea (ya no aparecen Katarina o Karthus de tirador).
- La recomendación da más peso a tu rival de línea y el winrate esperado es más realista: antes, sumar muchos cruces con pocas partidas lo inflaba hasta 60 % o más.

## 0.2.16 (30-10-2026)

- Worlds se actualiza solo: los equipos y resultados de cada serie se toman de Leaguepedia y la página se refresca cada dos minutos mientras está abierta. Si la wiki no responde, se muestran los últimos resultados guardados.

## 0.2.15 (30-10-2026)

- Pantalla de carga renovada: la imagen de cada campeón queda bien encuadrada y la tarjeta separa el rango, la línea y la maestría, las últimas partidas y los avisos.
- Cada jugador muestra la línea que más juega ("Suele jugar") y el aviso "Posible autofill" cuando en esta partida va en otra. Las últimas partidas muestran en qué línea jugó cada una.
- En tu partida, la línea de tus aliados es la real del cliente; la de los rivales es una estimación.

## 0.2.14 (29-10-2026)

- En vivo recomienda picks para tu línea desde el primer momento de la selección, aunque nadie haya elegido todavía (por ejemplo, si eliges primero).
- Al entrar a la selección, RiftLab abre En vivo aunque la ventana estuviera en segundo plano (antes a veces quedaba en tu perfil).

## 0.2.13 (28-10-2026)

- Al entrar a la selección de campeones, RiftLab pasa al frente sola y abre En vivo, con los picks y la build recomendada. Se puede apagar en Ajustes → Selección de campeones.

## 0.2.12 (28-10-2026)

- Nueva página de maestría de cada jugador (botón "Ver todas" en el perfil): puntaje de maestría, puntos totales, campeones con maestría y todos los campeones con su nivel, puntos, avance al siguiente nivel y última vez jugado. Se puede ordenar y buscar, y abajo aparecen los campeones sin jugar.

## 0.2.11 (28-10-2026)

- En el historial, las clasificatorias muestran los LP que ganaste o perdiste junto a "Victoria" o "Derrota". Se registran desde ahora, en las partidas que juegues con RiftLab abierta (Riot no entrega los LP de partidas anteriores).
- "Amigos jugando" muestra el ícono de perfil de cada amigo, con el campeón que está jugando en la esquina y su tag al lado del nombre.

## 0.2.10 (28-10-2026)

- La partida en curso aparece ordenada por línea, en el perfil y en la pantalla de carga: cada jugador queda frente a su rival, de Superior a Soporte. La línea se estima por el campeón y por Aplastar.

## 0.2.9 (28-10-2026)

- Arreglado el "Error 400" al abrir la partida de un amigo desde "Amigos jugando".
- Con el mismo arreglo vuelven a funcionar tu pantalla de carga, el resumen al terminar la partida y el aviso cuando alguien con quien juegas seguido entra a partida.
- Los seis cuadros de "Lo más fuerte por línea" en el inicio tienen la misma altura.

## 0.2.8 (28-10-2026)

- El buscador grande del inicio y el de cada perfil encuentran campeones y jugadores, igual que el de la barra lateral.

## 0.2.7 (27-10-2026)

- Configuración inicial al abrir la app: qué juegas (LoL y TFT o solo LoL), en qué tecla usas Destello, si la build se importa sola y opciones de inicio.
- Destello queda siempre en la tecla que elijas al poner hechizos.
- La importación automática deja elegir runas, hechizos y set de objetos por separado.
- Con "Solo League" se ocultan la sección de TFT y su ventana flotante.

## 0.2.6 (27-10-2026)

- Los nombres con letras japonesas, chinas, coreanas o símbolos ya no se ven gigantes en el perfil.

## 0.2.5 (27-10-2026)

- Worlds: logos de los equipos y cuadros de la fase suiza, las eliminatorias y el Play-In.

## 0.2.4 (27-10-2026)

- Calendario de Worlds 2026, con un botón junto a la versión en la barra lateral mientras dure el torneo.

## 0.2.3 (26-10-2026)

- Ajustes por las políticas de Riot: aviso legal exacto y la importación automática de la build pasa a ser opcional.
- Páginas de error y de "no encontrado" en español.
- Las runas ya no se desbordan en pantallas chicas.

## 0.2.2 (26-10-2026)

- Aviso de tilt en el perfil y en el resumen después de la partida cuando la sesión viene mal.
- Reintentos ante cortes de red y mensajes de error en español.

## 0.2.1 (26-10-2026)

- RiftLab funciona sin clave propia de Riot: usa el servidor del grupo.

## 0.2.0 (26-10-2026)

- Primera versión con actualizaciones automáticas desde GitHub.
- Ícono y nivel de la cuenta vinculada en Ajustes.
