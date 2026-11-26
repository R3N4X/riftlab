"use client";

/**
 * Historial de rangos por temporada (máximo y final de cada una). La API de Riot solo entrega el
 * rango actual: esto sale del cliente de League por la app de escritorio, que entrega esta temporada
 * y la anterior y guarda lo que ve para que el historial crezca. En el navegador no aparece.
 */
import { useEffect, useState } from "react";
import { RankCrest } from "@/components/icons";
import { useIsDesktop, useLiveState } from "@/components/live-client";
import { TIER_LABEL, type Tier } from "@/lib/constants";
import type { RankHistory as RankHistoryData, RankMark, SeasonQueueRanks, SeasonRanks } from "@/lib/live";
import { row, tip } from "@/lib/tip";

const rankText = (m: RankMark) => `${TIER_LABEL[m.tier as Tier] ?? m.tier}${m.division ? ` ${m.division}` : ""}`;
const monthYear = (at: number) => new Date(at).toLocaleDateString("es-CL", { month: "short", year: "numeric" });

function seasonLabel(s: SeasonRanks, newestId: number): string {
  if (s.current) return "Esta temporada";
  if (s.seasonId === newestId - 1 && !s.endsAt) return "Temporada anterior";
  return s.endsAt ? `Terminó en ${monthYear(s.endsAt)}` : `Temporada ${s.seasonId}`;
}

export function RankHistory({ gameName, tagLine, platform }: { gameName: string; tagLine: string; platform: string }) {
  const isDesktop = useIsDesktop();
  const connected = useLiveState()?.connected ?? false;
  const [data, setData] = useState<{ key: string; history: RankHistoryData | null } | null>(null);
  const key = `${platform}:${gameName}#${tagLine}`;

  useEffect(() => {
    if (!isDesktop) return;
    let alive = true;
    window
      .riftlab!.getRankHistory(gameName, tagLine, platform)
      .then((history) => alive && setData({ key, history }))
      .catch(() => alive && setData({ key, history: null }));
    return () => {
      alive = false;
    };
    // Se vuelve a pedir al conectarse el cliente, por si al abrir el perfil estaba cerrado.
  }, [isDesktop, connected, gameName, tagLine, platform, key]);

  if (!isDesktop) return null;
  const history = data?.key === key ? data.history : undefined;
  if (history === undefined) return null;

  const seasons = (history?.seasons ?? []).filter((s) => s.solo || s.flex);
  const newestId = Math.max(0, ...(history?.seasons ?? []).map((s) => s.seasonId));

  return (
    // Mismo aspecto que Panel (ui.tsx importa código de servidor y no se puede usar aquí).
    <div className="rounded-lg border border-line bg-surface p-4">
      <h2 className="mb-3 font-display text-xl font-semibold">Historial de rangos</h2>
      {seasons.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-dim">
              <th className="pb-2 font-normal">Temporada</th>
              <th className="pb-2 font-normal">Solo/Dúo</th>
              <th className="pb-2 font-normal">Flexible</th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((s) => {
              const label = seasonLabel(s, newestId);
              return (
                <tr key={s.seasonId} className="border-t border-line/60 align-top">
                  <td className="py-2 pr-2 text-muted">{label}</td>
                  <QueueCell ranks={s.solo} queue="Solo/Dúo" season={label} current={s.current} />
                  <QueueCell ranks={s.flex} queue="Flexible" season={label} current={s.current} />
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-dim">Sin rangos en esta temporada ni en la anterior.</p>
      )}
      <p className="mt-3 text-xs text-dim">
        {history?.live === false && "Abre el cliente de League para actualizarlo. "}
        Riot entrega esta temporada y la anterior; RiftLab guarda las que ve para sumar las siguientes.
      </p>
    </div>
  );
}

function QueueCell({ ranks, queue, season, current }: { ranks?: SeasonQueueRanks; queue: string; season: string; current: boolean }) {
  if (!ranks?.peak && !ranks?.end) return <td className="py-2 text-dim">—</td>;
  const main = ranks.peak ?? ranks.end!;
  return (
    <td
      className="cursor-help py-2"
      title={tip(
        `${queue}: ${season.toLowerCase()}`,
        ranks.peak && row("Máximo", rankText(ranks.peak)),
        ranks.end && row("Final", rankText(ranks.end)),
        current && row("Final", "Todavía en juego"),
      )}
    >
      <span className="flex items-center gap-1.5">
        <RankCrest tier={main.tier} size={22} />
        <span className="leading-tight">
          <span className="block font-semibold text-ink">{rankText(main)}</span>
          <span className="block text-xs text-dim">
            {ranks.peak ? "Máximo" : "Final"}
            {ranks.peak && ranks.end && rankText(ranks.end) !== rankText(ranks.peak) ? ` · terminó ${rankText(ranks.end)}` : ""}
          </span>
        </span>
      </span>
    </td>
  );
}
