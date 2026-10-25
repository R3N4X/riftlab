"use client";

/**
 * Amigos de la lista del cliente de League (solo en la app de escritorio):
 * recuadro en la barra lateral con quién está jugando y aviso de Windows cuando
 * alguien con quien juegas seguido entra a una partida. Los amigos salen del
 * chat del cliente; "con quién juegas seguido" sale de tus últimas 20 partidas.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { img } from "@/lib/assets";
import type { LiveFriend } from "@/lib/live";
import { useLiveState } from "./live-client";

export interface FriendChampion {
  id: string;
  name: string;
  key?: string;
}

const QUEUE_LABEL: Record<string, string> = {
  RANKED_SOLO_5x5: "Solo/Dúo",
  RANKED_FLEX_SR: "Flexible",
  NORMAL: "Normal",
  NORMAL_DRAFT: "Normal",
  BLIND_PICK: "Normal a ciegas",
  ARAM_UNRANKED_5x5: "ARAM",
  CHERRY: "Arena",
  RANKED_TFT: "TFT clasificatoria",
  NORMAL_TFT: "TFT",
};

/* ---------- Con quién juegas seguido (una consulta por sesión) ---------- */

let frequent: { key: string; puuids: Set<string> } | null = null;
let frequentLoading: string | null = null;
const frequentListeners = new Set<() => void>();

function loadFrequent(platform: string, puuid: string) {
  const key = `${platform}:${puuid}`;
  if (frequent?.key === key || frequentLoading === key) return;
  frequentLoading = key;
  fetch(`/api/frecuentes?platform=${platform}&puuid=${encodeURIComponent(puuid)}`)
    .then((r) => (r.ok ? r.json() : []))
    .then((list: { puuid: string }[]) => {
      frequent = { key, puuids: new Set(list.map((m) => m.puuid)) };
      frequentListeners.forEach((l) => l());
    })
    .catch(() => {
      frequentLoading = null;
    });
}

function useFrequent(platform: string | null | undefined, puuid: string | undefined): Set<string> {
  const set = useSyncExternalStore(
    (cb) => {
      frequentListeners.add(cb);
      return () => frequentListeners.delete(cb);
    },
    () => frequent?.puuids ?? EMPTY,
    () => EMPTY,
  );
  useEffect(() => {
    if (platform && puuid) loadFrequent(platform, puuid);
  }, [platform, puuid]);
  return set;
}
const EMPTY = new Set<string>();

/* ---------- Avisos encendidos o apagados (preferencia de este equipo) ---------- */

const ALERTS_KEY = "riftlab:avisos-amigos";
const alertListeners = new Set<() => void>();

function alertsOn(): boolean {
  try {
    return localStorage.getItem(ALERTS_KEY) !== "0";
  } catch {
    return true;
  }
}

function setAlerts(on: boolean) {
  try {
    localStorage.setItem(ALERTS_KEY, on ? "1" : "0");
  } catch {
    // sin almacenamiento: queda solo para esta sesión
  }
  alertListeners.forEach((l) => l());
}

function useAlertsOn() {
  return useSyncExternalStore(
    (cb) => {
      alertListeners.add(cb);
      return () => alertListeners.delete(cb);
    },
    alertsOn,
    () => true,
  );
}

function spectatePath(platform: string, f: LiveFriend) {
  return `/espectar/${platform}/${encodeURIComponent(f.puuid)}?nombre=${encodeURIComponent(`${f.gameName}#${f.tagLine}`)}`;
}

function minutesSince(since: number | null, now: number) {
  return since && now ? Math.max(0, Math.floor((now - since) / 60000)) : null;
}

/* ---------- Aviso de Windows ---------- */

/** Va en el layout: avisa cuando un amigo frecuente entra a partida (una vez por partida). */
export function FriendAlerts({ champions }: { champions: FriendChampion[] }) {
  const state = useLiveState();
  const router = useRouter();
  const on = useAlertsOn();
  const platform = state?.summoner?.platform;
  const mates = useFrequent(platform, state?.summoner?.puuid);
  const previous = useRef<Map<string, LiveFriend["status"]> | null>(null);
  const friends = state?.friends ?? null;

  useEffect(() => {
    if (!friends) return;
    const before = previous.current;
    previous.current = new Map(friends.map((f) => [f.puuid, f.status]));
    // La primera lectura solo fija el punto de partida: no avisa de los que ya estaban jugando.
    if (!before || !on || !platform || typeof Notification === "undefined") return;
    for (const f of friends) {
      if (f.status !== "inGame" || before.get(f.puuid) === "inGame" || !mates.has(f.puuid)) continue;
      const champ = f.championId ? champions.find((c) => c.key === String(f.championId))?.name : null;
      const queue = f.queue ? (QUEUE_LABEL[f.queue] ?? null) : null;
      const n = new Notification(`${f.gameName} entró a partida`, {
        body: [champ && `Con ${champ}`, queue].filter(Boolean).join(" · ") + ". Haz clic para ver la partida.",
        silent: false,
      });
      n.onclick = () => {
        void window.riftlab?.focusWindow();
        router.push(spectatePath(platform, f));
      };
    }
  }, [friends, on, platform, mates, champions, router]);

  return null;
}

/* ---------- Recuadro de la barra lateral ---------- */

export function FriendsBox({ champions, version, onNavigate }: { champions: FriendChampion[]; version: string; onNavigate: () => void }) {
  const state = useLiveState();
  const on = useAlertsOn();
  const platform = state?.summoner?.platform;
  const mates = useFrequent(platform, state?.summoner?.puuid);
  // La hora se lee después de montar (leerla al renderizar rompe el prerender de Next).
  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  if (!state?.connected || !state.friends || !platform) return null;
  const playing = state.friends.filter((f) => f.status === "inGame" || f.status === "champSelect");
  // Primero los que juegan seguido contigo.
  playing.sort((a, b) => Number(mates.has(b.puuid)) - Number(mates.has(a.puuid)));
  const online = state.friends.length;

  return (
    <div className="mt-3 rounded-md border border-line bg-night/40 p-1.5">
      <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-1.5">
        <p className="font-display text-sm font-semibold tracking-wide text-muted uppercase">Amigos jugando</p>
        <button
          type="button"
          onClick={() => setAlerts(!on)}
          aria-pressed={on}
          title={on ? "Avisos activados: te avisamos cuando alguien con quien juegas seguido entra a partida" : "Avisos desactivados"}
          className={`rounded p-1 ${on ? "text-gold" : "text-dim"} hover:bg-raised`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
            {!on && <path d="M3 3l18 18" />}
          </svg>
          <span className="sr-only">{on ? "Desactivar avisos" : "Activar avisos"}</span>
        </button>
      </div>
      {playing.length === 0 ? (
        <p className="px-2 pb-1.5 text-xs text-dim">
          Nadie está jugando ahora{online ? ` · ${online} ${online === 1 ? "conectado" : "conectados"}` : ""}.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {playing.slice(0, 6).map((f) => {
            const champ = f.championId ? champions.find((c) => c.key === String(f.championId)) : undefined;
            const mins = minutesSince(f.since, now);
            const queue = f.queue ? QUEUE_LABEL[f.queue] : undefined;
            const status =
              f.status === "champSelect"
                ? "En selección"
                : ["En partida", mins !== null ? `${mins} min` : null, queue].filter(Boolean).join(" · ");
            const href =
              f.status === "inGame"
                ? spectatePath(platform, f)
                : `/invocador/${platform}/${encodeURIComponent(`${f.gameName}-${f.tagLine}`)}`;
            return (
              <li key={f.puuid}>
                <Link href={href} onClick={onNavigate} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-raised/60">
                  {champ ? (
                    <img
                      src={img.champion(version, champ.id)}
                      alt={champ.name}
                      width={24}
                      height={24}
                      className="h-6 w-6 shrink-0 rounded"
                    />
                  ) : f.icon !== null ? (
                    <img src={img.profileIcon(version, f.icon)} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded" />
                  ) : (
                    <span className="h-6 w-6 shrink-0 rounded bg-raised" />
                  )}
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="flex items-center gap-1 truncate text-sm text-ink">
                      {f.gameName}
                      {mates.has(f.puuid) && (
                        <span className="text-gold" title="Juegas seguido con esta persona" aria-label="Juegas seguido con esta persona">
                          ★
                        </span>
                      )}
                    </span>
                    <span className={`block truncate text-[11px] ${f.status === "inGame" ? "text-win" : "text-gold-soft"}`}>{status}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
