import { DEFAULT_RANK, isRankFilter, isRole, type RankFilter, type Role } from "./constants";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseRank(sp: SearchParams): RankFilter {
  const v = first(sp.rank);
  return isRankFilter(v) ? v : DEFAULT_RANK;
}

export function parseRole(sp: SearchParams): Role | undefined {
  const v = first(sp.role);
  return isRole(v) ? v : undefined;
}

export function parseString(sp: SearchParams, key: string): string | undefined {
  return first(sp[key]);
}
