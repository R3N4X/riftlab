/**
 * Tabla de recetas: cruzando dos componentes se ve el objeto que se arma.
 * Se usa en /tft/objetos y en el modo partida.
 */
import { TftItemIcon } from "./tft";
import type { TftItem } from "@/lib/tft/data";

export function RecipeGrid({ items, size = 30 }: { items: Record<string, TftItem>; size?: number }) {
  const components = Object.values(items)
    .filter((i) => i.kind === "component")
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const byPair = new Map<string, TftItem>();
  for (const item of Object.values(items)) {
    if (!item.from) continue;
    byPair.set(`${item.from[0]}+${item.from[1]}`, item);
    byPair.set(`${item.from[1]}+${item.from[0]}`, item);
  }
  const cell = (a: TftItem, b: TftItem) => byPair.get(`${a.id}+${b.id}`);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5">
        <caption className="sr-only">Recetas de objetos: fila más columna</caption>
        <thead>
          <tr>
            <td />
            {components.map((c) => (
              <th key={c.id} scope="col" className="rounded bg-raised p-0.5">
                <TftItemIcon item={c} size={size} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {components.map((row) => (
            <tr key={row.id}>
              <th scope="row" className="rounded bg-raised p-0.5">
                <TftItemIcon item={row} size={size} />
              </th>
              {components.map((col) => {
                const item = cell(row, col);
                return (
                  <td key={col.id} className="bg-night/50 p-0.5">
                    {item ? <TftItemIcon item={item} size={size} /> : <span className="block" style={{ width: size, height: size }} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
