/**
 * Sesión de hoy en el perfil: balance del día, LP (si la app los registró), racha, tiempo jugado
 * y nota, con cada partida en orden. Las partidas abren su resumen.
 */
import Link from "next/link";
import { QUEUES } from "@/lib/constants";
import { kda, pct, wrClass } from "@/lib/format";
import { DAY_START_HOUR, playTime, type DaySession } from "@/lib/session";
import { row, tip, warn } from "@/lib/tip";
import { ChampIcon } from "./icons";
import { GameLp, SessionLp } from "./match-lp";
import type { MatchCardData } from "./match-card";
import { Panel } from "./ui";

const RANKED_QUEUES = new Set([420, 440]);
/** Desde aquí el tiempo jugado se marca como sesión larga. */
const LONG_SESSION_MIN = 180;

export function SessionToday({ session, riotId, data }: { session: DaySession; riotId: string; data: MatchCardData }) {
  const { version, champsByKey, platform } = data;
  const { games, wins, losses, minutes, streak, score, usualScore } = session;
  const diff = score !== null && usualScore !== null ? score - usualScore : null;
  const long = minutes >= LONG_SESSION_MIN;

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <h2
            className="font-display text-xl font-semibold"
            title={tip("Sesión de hoy", `Partidas desde las ${DAY_START_HOUR}:00, sin contar las que se rehicieron.`)}
          >
            Sesión de hoy
          </h2>
          <p className="font-display text-3xl leading-tight font-semibold">
            <span className="text-win">{wins}V</span> <span className="text-loss">{losses}D</span>
            <span className={`ml-2 text-base font-normal ${wrClass(wins / games.length)}`}>{pct(wins / games.length, 0)}</span>
          </p>
          <SessionLp matchIds={games.filter((g) => RANKED_QUEUES.has(g.queueId)).map((g) => g.matchId)} riotId={riotId} />
        </div>

        <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-muted">Racha</dt>
            <dd className={`font-display text-lg font-semibold ${streak.win ? "text-win" : "text-loss"}`}>
              {streak.count} {streak.win ? (streak.count === 1 ? "victoria" : "victorias") : streak.count === 1 ? "derrota" : "derrotas"}
            </dd>
          </div>
          <div title={long ? tip("Sesión larga", "Después de 3 horas seguidas el rendimiento suele bajar: una pausa ayuda.") : undefined}>
            <dt className="text-muted">Tiempo jugado</dt>
            <dd className={`font-display text-lg font-semibold ${long ? "text-gold" : ""}`}>{playTime(minutes)}</dd>
          </div>
          {score !== null && (
            <div
              title={tip(
                "Nota del día",
                "Promedio de la nota de 0 a 100 de cada partida (la del resumen post-partida).",
                usualScore !== null && row("Lo habitual", usualScore),
              )}
            >
              <dt className="text-muted">Nota</dt>
              <dd className="font-display text-lg font-semibold">
                {score}
                {diff !== null && Math.abs(diff) >= 3 && (
                  <span className={`ml-1.5 text-sm ${diff > 0 ? "text-win" : "text-loss"}`}>
                    {diff > 0 ? "+" : "−"}
                    {Math.abs(diff)} sobre lo habitual
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <ol className="mt-4 flex flex-wrap gap-2.5" aria-label="Partidas de hoy, de la primera a la última">
        {games.map((g) => {
          const champ = champsByKey[g.me.championId];
          const time = new Date(g.end).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
          return (
            <li key={g.matchId}>
              <Link
                href={`/resumen/${platform}/${g.matchId}?yo=${g.me.puuid}`}
                className="flex w-11 flex-col items-center gap-1 rounded-md hover:opacity-80"
                title={tip(
                  g.me.win ? "Victoria" : "Derrota",
                  row("Campeón", champ?.name ?? "—"),
                  row("Cola", QUEUES[g.queueId] ?? "Otra"),
                  row("K/D/A", `${g.me.kills}/${g.me.deaths}/${g.me.assists}`),
                  row("KDA", kda(g.me.kills, g.me.deaths, g.me.assists)),
                  g.score !== null && row("Nota", g.score),
                  row("Terminó", time),
                  g.me.deaths >= 10 && warn(`${g.me.deaths} muertes`),
                )}
              >
                {champ ? (
                  <ChampIcon version={version} id={champ.id} name={champ.name} size={40} />
                ) : (
                  <span className="block h-10 w-10 rounded-md bg-raised" />
                )}
                <span className={`h-1 w-full rounded-full ${g.me.win ? "bg-win" : "bg-loss"}`} aria-hidden="true" />
                <span className="sr-only">{g.me.win ? "Victoria" : "Derrota"}</span>
                {RANKED_QUEUES.has(g.queueId) && <GameLp matchId={g.matchId} riotId={riotId} />}
              </Link>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
