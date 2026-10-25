"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { FriendsBox } from "./friends";
import { GlobalSearch, type SearchChampion } from "./global-search";
import { useDesktopAccount } from "./live-client";
import { profilePath } from "@/lib/live";

const LINKS = [
  { href: "/", label: "Inicio", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/tier-list", label: "Tier list", icon: "M4 5h16M4 10h11M4 15h7M4 20h4" },
  { href: "/campeones", label: "Campeones y builds", icon: "M12 3 4 7v6c0 4.4 3.4 7.6 8 8 4.6-.4 8-3.6 8-8V7z" },
  { href: "/sinergias", label: "Sinergias", icon: "M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM11 9l2 6" },
  { href: "/parche", label: "Parche", icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5" },
  {
    href: "/en-vivo",
    label: "En vivo",
    icon: "M12 12h.01M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8",
  },
];

/** En la app de escritorio: acceso a tu perfil (la cuenta del cliente de League). */
function MyProfileLink({ pathname, onNavigate }: { pathname: string | null; onNavigate: () => void }) {
  const account = useDesktopAccount();
  if (!account) return null;
  const href = profilePath(account);
  const active = pathname !== null && decodeURIComponent(pathname) === decodeURIComponent(href);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`mb-2 flex items-center gap-3 rounded-md border px-3 py-2 text-[15px] transition-colors ${
        active ? "border-gold/60 bg-raised text-gold-soft" : "border-line text-ink hover:bg-raised/60"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px] shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0" />
      </svg>
      <span className="min-w-0">
        <span className="block truncate">Mi perfil</span>
        <span className="block truncate text-xs text-muted">
          {account.gameName}#{account.tagLine}
        </span>
      </span>
    </Link>
  );
}

/*
 * La app de escritorio no tiene la barra del navegador: sin esto, al abrir el perfil de otro
 * jugador no había cómo volver. Atrás conserva la página anterior tal como estaba (scroll y
 * partidas desplegadas), así que se vuelve al lugar exacto.
 */
type NavigationLike = EventTarget & { canGoBack: boolean };
const navigationApi = () => (window as unknown as { navigation?: NavigationLike }).navigation;

function subscribeHistory(onChange: () => void) {
  const nav = navigationApi();
  nav?.addEventListener("currententrychange", onChange);
  return () => nav?.removeEventListener("currententrychange", onChange);
}

function BackButton({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter();
  const canGoBack = useSyncExternalStore(
    subscribeHistory,
    () => Boolean(window.riftlab) && (navigationApi()?.canGoBack ?? window.history.length > 1),
    () => false,
  );
  if (!canGoBack) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate();
        router.back();
      }}
      title="Volver (Alt + ←)"
      // Dorado y con borde, como la acción principal: con el estilo de los links pasaba desapercibido.
      className="group mb-2 flex items-center gap-3 rounded-md border border-gold/60 bg-gold/15 px-3 py-2.5 text-left font-display text-[15px] font-semibold text-gold-soft shadow-sm transition-colors hover:border-gold hover:bg-gold hover:text-night"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0 transition-transform group-hover:-translate-x-0.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 12H5m6-6-6 6 6 6" />
      </svg>
      Volver
    </button>
  );
}

const SETTINGS_ICON =
  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z";

/** TFT es otro juego: va en su propio recuadro, separado de las secciones de League. */
const TFT_LINKS = [
  { href: "/tft", label: "Comps" },
  { href: "/tft/campeones", label: "Campeones" },
  { href: "/tft/objetos", label: "Objetos" },
  { href: "/tft/rasgos", label: "Rasgos" },
  { href: "/tft/partida", label: "Modo partida" },
];
const TFT_ICON = "M12 2.5 20.5 7.25v9.5L12 21.5 3.5 16.75v-9.5zM12 8l3.5 2v4L12 16l-3.5-2v-4z";

function TftBox({ pathname, onNavigate }: { pathname: string | null; onNavigate: () => void }) {
  return (
    <div className="mt-3 rounded-md border border-line bg-night/40 p-1.5">
      <p className="flex items-center gap-2 px-2 pt-1 pb-1.5 font-display text-sm font-semibold tracking-wide text-muted uppercase">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-gold"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={TFT_ICON} />
        </svg>
        Teamfight Tactics
      </p>
      {TFT_LINKS.map((l) => {
        // "/tft" (Comps) solo se marca en su propia página, no en las demás de TFT.
        const active = pathname !== null && (l.href === "/tft" ? pathname === "/tft" : pathname.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={onNavigate}
            className={`block rounded px-3 py-1 text-sm transition-colors ${
              active ? "bg-raised text-gold-soft" : "text-muted hover:bg-raised/60 hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

interface NavProps {
  patch: string;
  version: string;
  champions: SearchChampion[];
}

export function Nav(props: NavProps) {
  return <NavView {...props} pathname={usePathname()} />;
}

/** Misma barra sin ruta activa: se muestra mientras la ruta dinámica resuelve. */
export function NavView({ patch, version, champions, pathname }: NavProps & { pathname: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Barra superior en pantallas chicas */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-night/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo patch={patch} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Abrir menú"
          className="rounded-md border border-line px-3 py-1.5 text-sm text-muted"
        >
          Menú
        </button>
      </div>

      <aside
        className={`${open ? "block" : "hidden"} fixed inset-x-0 top-[57px] z-20 border-b border-line bg-surface px-3 py-4 lg:sticky lg:top-[var(--titlebar-h)] lg:flex lg:h-[calc(100dvh-var(--titlebar-h))] lg:flex-col no-scrollbar lg:overflow-y-auto lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0 lg:px-4 lg:py-6`}
      >
        <div className="mb-6 hidden px-2 lg:block">
          <Logo patch={patch} />
        </div>
        <div className="mb-4 lg:px-1">
          <GlobalSearch champions={champions} version={version} />
        </div>
        <nav className="flex flex-col gap-1 lg:pb-4">
          <BackButton onNavigate={() => setOpen(false)} />
          <MyProfileLink pathname={pathname} onNavigate={() => setOpen(false)} />
          {LINKS.map((l) => {
            const active = pathname !== null && isActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-[15px] transition-colors ${
                  active ? "bg-raised text-gold-soft" : "text-muted hover:bg-raised/60 hover:text-ink"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[18px] w-[18px] shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={l.icon} />
                </svg>
                {l.label}
              </Link>
            );
          })}
          {/* Misma línea que separa Ajustes: League arriba, TFT abajo. */}
          <span className="mt-3 h-px bg-line" aria-hidden="true" />
          <TftBox pathname={pathname} onNavigate={() => setOpen(false)} />
          <FriendsBox champions={champions} version={version} onNavigate={() => setOpen(false)} />
        </nav>
        {/* Ajustes va al final, aparte de las secciones de contenido, como en cualquier app. */}
        <div className="mt-4 flex flex-col gap-1 border-t border-line pt-3 lg:mt-auto">
          <Link
            href="/ajustes"
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-[15px] transition-colors ${
              pathname === "/ajustes" ? "bg-raised text-gold-soft" : "text-muted hover:bg-raised/60 hover:text-ink"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[18px] w-[18px] shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={SETTINGS_ICON} />
            </svg>
            Ajustes
          </Link>
        </div>
        <p className="mt-4 px-3 text-xs leading-relaxed text-dim">
          RiftLab no está respaldado por Riot Games. League of Legends es marca registrada de Riot Games, Inc.
        </p>
      </aside>
    </>
  );
}

function Logo({ patch }: { patch: string }) {
  return (
    <Link href="/" className="flex items-baseline gap-2">
      <span className="font-display text-2xl font-bold tracking-tight text-ink">
        Rift<span className="text-gold">Lab</span>
      </span>
      <span className="rounded border border-line px-1.5 py-0.5 font-display text-xs text-muted">{patch}</span>
    </Link>
  );
}
