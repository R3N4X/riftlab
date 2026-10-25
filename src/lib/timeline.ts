/**
 * Resumen de la línea de tiempo de una partida (match-v5 timeline): oro por
 * minuto, compras, orden de habilidades y objetivos. Una partida terminada no
 * cambia, así que se cachea por días: abrir el detalle dos veces no gasta
 * consultas a Riot.
 */
import { cacheLife } from "next/cache";
import { PLATFORMS, type Platform } from "./constants";
import { getItems } from "./ddragon";
import { riotFetch } from "./riot";

interface RawTimeline {
  info: {
    participants: { participantId: number; puuid: string }[];
    frames: {
      timestamp: number;
      participantFrames: Record<string, { totalGold: number; minionsKilled?: number; jungleMinionsKilled?: number; xp?: number }>;
      events: {
        type: string;
        timestamp: number;
        participantId?: number;
        itemId?: number;
        beforeId?: number;
        skillSlot?: number;
        levelUpType?: string;
        killerTeamId?: number;
        teamId?: number;
        monsterType?: string;
        monsterSubType?: string;
        buildingType?: string;
        killerId?: number;
        victimId?: number;
        assistingParticipantIds?: number[];
      }[];
    }[];
  };
}

export type ObjectiveType = "DRAGON" | "BARON" | "HERALD" | "HORDE" | "ATAKHAN" | "TOWER" | "INHIBITOR";

export interface TimelineObjective {
  minute: number;
  /** Equipo que lo consiguió (100 azul, 200 rojo). */
  teamId: number;
  type: ObjectiveType;
  /** Tipo de dragón ("FIRE_DRAGON", "ELDER_DRAGON"...). */
  detail?: string;
}

export interface ShopVisit {
  minute: number;
  items: number[];
}

/** Un asesinato de campeón (puuid del que mató, vacío si fue una torre o un monstruo). */
export interface TimelineKill {
  minute: number;
  killer: string | null;
  victim: string;
  assists: string[];
}

export interface TimelineSummary {
  /** Oro total de cada jugador por minuto, por puuid. */
  gold: Record<string, number[]>;
  /** Súbditos y monstruos acumulados por minuto, por puuid. */
  cs: Record<string, number[]>;
  /** Experiencia acumulada por minuto, por puuid. */
  xp: Record<string, number[]>;
  kills: TimelineKill[];
  teams: Record<string, number>;
  purchases: Record<string, ShopVisit[]>;
  skills: Record<string, string>;
  objectives: TimelineObjective[];
  itemNames: Record<string, string>;
}

const MONSTER: Record<string, ObjectiveType> = {
  DRAGON: "DRAGON",
  BARON_NASHOR: "BARON",
  RIFTHERALD: "HERALD",
  HORDE: "HORDE",
  ATAKHAN: "ATAKHAN",
};

const SKILL = ["", "Q", "W", "E", "R"];
const TRINKETS = new Set([3340, 3363, 3364]);

export async function getTimelineSummary(platform: Platform, matchId: string): Promise<TimelineSummary> {
  "use cache";
  cacheLife("days");
  const raw = await riotFetch<RawTimeline>(PLATFORMS[platform].region, `/lol/match/v5/matches/${matchId}/timeline`);
  const idToPuuid = new Map(raw.info.participants.map((p) => [p.participantId, p.puuid]));
  // En partidas de 5 contra 5, los participantes 1 a 5 son el lado azul (100).
  const teams = Object.fromEntries(raw.info.participants.map((p) => [p.puuid, p.participantId <= 5 ? 100 : 200]));

  const gold: Record<string, number[]> = {};
  const cs: Record<string, number[]> = {};
  const xp: Record<string, number[]> = {};
  const kills: TimelineKill[] = [];
  const bought: Record<string, { id: number; t: number }[]> = {};
  const skills: Record<string, string> = {};
  const objectives: TimelineObjective[] = [];

  for (const frame of raw.info.frames) {
    for (const [pid, pf] of Object.entries(frame.participantFrames)) {
      const puuid = idToPuuid.get(Number(pid));
      if (!puuid) continue;
      (gold[puuid] ??= []).push(pf.totalGold);
      (cs[puuid] ??= []).push((pf.minionsKilled ?? 0) + (pf.jungleMinionsKilled ?? 0));
      (xp[puuid] ??= []).push(pf.xp ?? 0);
    }
    for (const ev of frame.events) {
      const minute = Math.floor(ev.timestamp / 60000);
      const puuid = ev.participantId ? idToPuuid.get(ev.participantId) : undefined;
      if (ev.type === "ITEM_PURCHASED" && puuid && ev.itemId && !TRINKETS.has(ev.itemId)) {
        (bought[puuid] ??= []).push({ id: ev.itemId, t: ev.timestamp });
      } else if (ev.type === "ITEM_UNDO" && puuid && ev.beforeId) {
        const list = bought[puuid] ?? [];
        const idx = list.map((b) => b.id).lastIndexOf(ev.beforeId);
        if (idx >= 0) list.splice(idx, 1);
      } else if (ev.type === "CHAMPION_KILL" && ev.victimId && idToPuuid.has(ev.victimId)) {
        kills.push({
          minute,
          killer: (ev.killerId && idToPuuid.get(ev.killerId)) || null,
          victim: idToPuuid.get(ev.victimId)!,
          assists: (ev.assistingParticipantIds ?? []).map((id) => idToPuuid.get(id)).filter((x): x is string => Boolean(x)),
        });
      } else if (ev.type === "SKILL_LEVEL_UP" && puuid && ev.skillSlot && ev.levelUpType === "NORMAL") {
        skills[puuid] = (skills[puuid] ?? "") + SKILL[ev.skillSlot];
      } else if (ev.type === "ELITE_MONSTER_KILL" && ev.killerTeamId && ev.monsterType && MONSTER[ev.monsterType]) {
        objectives.push({ minute, teamId: ev.killerTeamId, type: MONSTER[ev.monsterType], detail: ev.monsterSubType });
      } else if (ev.type === "BUILDING_KILL" && ev.teamId) {
        // teamId es el dueño del edificio destruido: el punto es para el otro equipo.
        const type = ev.buildingType === "INHIBITOR_BUILDING" ? "INHIBITOR" : "TOWER";
        objectives.push({ minute, teamId: ev.teamId === 100 ? 200 : 100, type });
      }
    }
  }

  // Compras agrupadas por visita a la tienda: lo comprado con menos de 45 s de diferencia.
  const purchases: Record<string, ShopVisit[]> = {};
  for (const [puuid, list] of Object.entries(bought)) {
    const visits: { start: number; last: number; items: number[] }[] = [];
    for (const b of list) {
      const current = visits[visits.length - 1];
      if (current && b.t - current.last < 45_000) {
        current.items.push(b.id);
        current.last = b.t;
      } else {
        visits.push({ start: b.t, last: b.t, items: [b.id] });
      }
    }
    purchases[puuid] = visits.map((v) => ({ minute: Math.floor(v.start / 60000), items: v.items }));
  }

  const items = await getItems();
  const itemNames: Record<string, string> = {};
  for (const list of Object.values(purchases))
    for (const v of list) for (const id of v.items) if (items[id]) itemNames[id] = items[id].name;

  return { gold, cs, xp, kills, teams, purchases, skills, objectives, itemNames };
}
