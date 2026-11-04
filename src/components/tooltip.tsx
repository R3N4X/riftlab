"use client";

/*
 * Capa única de tooltips. Reemplaza el globo del sistema de cualquier elemento con title (y de los
 * íconos con data-item) por uno propio: ancho acotado, con título, filas y viñetas (ver lib/tip.ts)
 * y, en los objetos, su ficha con precio, estadísticas y efectos.
 *
 * El title se pasa a data-tip la primera vez que se apunta al elemento, así el navegador no muestra
 * además el suyo. Va en el layout: no hace falta tocar cada componente.
 */
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ItemTip } from "@/app/api/objetos/route";

interface Shown {
  anchor: Element;
  text: string;
  item: string | null;
}

/** Espera antes de mostrar; si se pasa de un elemento a otro enseguida, aparece sin espera. */
const SHOW_DELAY = 300;
const WARM_MS = 500;
const SELECTOR = "[title],[data-tip],[data-item]";

let itemTips: Record<string, ItemTip> | null = null;
let itemTipsLoading: Promise<void> | null = null;

function loadItemTips(): Promise<void> {
  itemTipsLoading ??= fetch("/api/objetos")
    .then((res) => (res.ok ? (res.json() as Promise<Record<string, ItemTip>>) : null))
    .then((data) => {
      itemTips = data ?? {};
    })
    .catch(() => {
      itemTipsLoading = null;
    });
  return itemTipsLoading;
}

/** Texto del tooltip del elemento; mueve su title a data-tip para que no salga el del sistema. */
function takeText(el: Element): string {
  const title = el.getAttribute("title");
  if (title !== null) {
    el.setAttribute("data-tip", title);
    el.removeAttribute("title");
  }
  return el.getAttribute("data-tip") ?? "";
}

export function TooltipLayer() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    let anchor: Element | null = null;
    let visible = false;
    let hiddenAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const hide = () => {
      clearTimeout(timer);
      if (visible) hiddenAt = Date.now();
      visible = false;
      anchor = null;
      setShown(null);
    };
    const show = (el: Element) => {
      const text = takeText(el);
      const item = el.getAttribute("data-item");
      if (!text.trim() && !item) return;
      anchor = el;
      if (item) void loadItemTips();
      const open = () => {
        visible = true;
        setShown({ anchor: el, text, item });
      };
      if (Date.now() - hiddenAt < WARM_MS) open();
      else timer = setTimeout(open, SHOW_DELAY);
    };
    const target = (t: EventTarget | null) => (t instanceof Element ? t.closest(SELECTOR) : null);

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = target(e.target);
      if (el === anchor) return;
      hide();
      if (el) show(el);
    };
    const onLeaveWindow = (e: PointerEvent) => {
      if (!e.relatedTarget) hide();
    };
    const onFocus = (e: FocusEvent) => {
      const el = target(e.target);
      if (el && e.target instanceof Element && e.target.matches(":focus-visible")) {
        hide();
        show(el);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onLeaveWindow);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onLeaveWindow);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  if (!shown) return null;
  return createPortal(<Bubble shown={shown} />, document.body);
}

function Bubble({ shown }: { shown: Shown }) {
  const box = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLSpanElement>(null);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const item = shown.item ? itemTips?.[shown.item] : undefined;

  useEffect(() => {
    if (shown.item && !itemTips) void loadItemTips().then(refresh);
  }, [shown.item]);

  // Arriba del elemento y centrado; abajo si no cabe. Nunca se sale de la ventana.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !shown.anchor.isConnected) return;
    const a = shown.anchor.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const below = a.top - b.height - gap < margin;
    const center = a.left + a.width / 2;
    const left = Math.min(Math.max(center - b.width / 2, margin), window.innerWidth - b.width - margin);
    el.style.left = `${left}px`;
    el.style.top = `${below ? a.bottom + gap : a.top - b.height - gap}px`;
    el.dataset.side = below ? "below" : "above";
    if (arrow.current) arrow.current.style.left = `${Math.min(Math.max(center - left, 12), b.width - 12)}px`;
    el.style.visibility = "visible";
  });

  return (
    <div
      ref={box}
      role="tooltip"
      className="tip-bubble pointer-events-none fixed top-0 left-0 z-[100] w-max max-w-72 rounded-lg border border-line bg-[#0c131d] px-3 py-2.5 text-xs leading-snug text-muted shadow-[0_10px_30px_-6px_rgba(0,0,0,0.7)]"
      style={{ visibility: "hidden" }}
    >
      {shown.item ? <ItemCard item={item} fallback={shown.text} /> : <TextTip text={shown.text} />}
      <span ref={arrow} className="tip-arrow" aria-hidden="true" />
    </div>
  );
}

type Block = { kind: "rows"; rows: [string, string][] } | { kind: "bullets"; items: string[] } | { kind: "warn" | "text"; text: string };

/** Agrupa las líneas: filas seguidas en una tabla, viñetas seguidas en una lista. */
function blocks(lines: string[]): Block[] {
  const out: Block[] = [];
  for (const line of lines) {
    const last = out.at(-1);
    if (line.includes("\t")) {
      const [label, value] = line.split("\t");
      if (last?.kind === "rows") last.rows.push([label, value]);
      else out.push({ kind: "rows", rows: [[label, value]] });
    } else if (line.startsWith("• ")) {
      if (last?.kind === "bullets") last.items.push(line.slice(2));
      else out.push({ kind: "bullets", items: [line.slice(2)] });
    } else if (line.startsWith("! ")) out.push({ kind: "warn", text: line.slice(2) });
    else out.push({ kind: "text", text: line });
  }
  return out;
}

function TextTip({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  const title = lines.length > 1 ? lines[0] : null;
  const body = title ? lines.slice(1) : lines;
  return (
    <div className="space-y-1.5">
      {title && <p className="font-display text-[15px] leading-tight font-semibold text-ink">{title}</p>}
      {blocks(body).map((b, i) => {
        if (b.kind === "rows") {
          return (
            <dl key={i} className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
              {b.rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt>{label}</dt>
                  <dd className="text-right font-medium text-ink tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          );
        }
        if (b.kind === "bullets") {
          return (
            <ul key={i} className="space-y-0.5">
              {b.items.map((t) => (
                <li key={t} className="flex gap-1.5">
                  <span className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.kind === "warn") {
          return (
            <p key={i} className="border-l-2 border-gold/70 pl-2 text-gold-soft">
              {b.text}
            </p>
          );
        }
        return (
          <p key={i} className={title ? "" : "text-ink"}>
            {b.text}
          </p>
        );
      })}
    </div>
  );
}

function ItemCard({ item, fallback }: { item: ItemTip | undefined; fallback: string }) {
  if (!item) return <TextTip text={fallback || "Cargando objeto…"} />;
  const note = fallback && fallback !== item.name ? fallback : null;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-display text-[15px] leading-tight font-semibold text-ink">{item.name}</p>
        {item.gold > 0 && <span className="shrink-0 font-medium text-gold-soft tabular-nums">{item.gold} de oro</span>}
      </div>
      {item.stats.length > 0 && (
        <ul className="space-y-0.5 text-ink/90">
          {item.stats.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      {item.effects.map((e) => (
        <p key={e.name} className="border-t border-line/70 pt-1.5">
          <span className="text-gold-soft">
            {e.kind}: {e.name}.
          </span>{" "}
          {e.text}
        </p>
      ))}
      {!item.stats.length && !item.effects.length && item.plaintext && <p>{item.plaintext}</p>}
      {note && <p className="border-t border-line/70 pt-1.5 text-ink">{note}</p>}
    </div>
  );
}
