"use client";

/**
 * Preferencias de quien usa la app, guardadas en este navegador (o en la app de
 * escritorio). No son datos importantes: si el almacenamiento no está
 * disponible, se usan los valores por defecto.
 */
import { useMemo, useSyncExternalStore } from "react";
import { DEFAULT_PLATFORM, isPlatform, type Platform } from "./constants";

const PLATFORM_KEY = "riftlab:servidor";
const CHANGE_EVENT = "riftlab:preferencias";

function readPlatform(): Platform {
  try {
    const value = localStorage.getItem(PLATFORM_KEY);
    return isPlatform(value) ? value : DEFAULT_PLATFORM;
  } catch {
    return DEFAULT_PLATFORM;
  }
}

function subscribe(onChange: () => void) {
  // "storage" avisa de cambios hechos en otra pestaña; el evento propio, de los de esta.
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Servidor con el que se buscan los Riot ID cuando no se elige otro. */
export function usePreferredPlatform(): Platform {
  return useSyncExternalStore(subscribe, readPlatform, () => DEFAULT_PLATFORM);
}

export function setPreferredPlatform(platform: Platform) {
  try {
    localStorage.setItem(PLATFORM_KEY, platform);
  } catch {
    // sin almacenamiento, la preferencia dura hasta recargar
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/* ---------- Comps de TFT fijadas ---------- */

// Se comparten entre la ventana principal y la flotante de TFT (mismo origen): el evento
// "storage" avisa a la otra ventana cuando se fija o se suelta una comp.
const PINS_KEY = "riftlab:tft-fijadas";

function readPinsRaw(): string {
  try {
    return localStorage.getItem(PINS_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parsePins(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Claves de las comps que la persona fijó para tener a mano en la partida. */
export function usePinnedComps(): string[] {
  const raw = useSyncExternalStore(subscribe, readPinsRaw, () => "[]");
  return useMemo(() => parsePins(raw), [raw]);
}

export function togglePinnedComp(key: string) {
  const pins = parsePins(readPinsRaw());
  const next = pins.includes(key) ? pins.filter((k) => k !== key) : [...pins, key];
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(next));
  } catch {
    // sin almacenamiento no se puede fijar
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
