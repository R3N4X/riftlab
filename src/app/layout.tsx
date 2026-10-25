import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { Suspense } from "react";
import { LiveWatcher } from "@/components/live-client";
import { FriendAlerts } from "@/components/friends";
import { Nav, NavView } from "@/components/nav";
import { getChampionList, getLatestVersion, versionToPatch } from "@/lib/ddragon";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "RiftLab — estadísticas de League of Legends", template: "%s · RiftLab" },
  description: "Builds, tier list por línea y rango, sinergias, notas del parche y perfiles de invocador.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const version = await getLatestVersion();
  const patch = versionToPatch(version);
  const champions = (await getChampionList(version)).map((c) => ({ id: c.id, name: c.name, key: c.key }));
  return (
    <html lang="es" className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="min-h-full lg:flex">
        <div className="titlebar" aria-hidden="true" />
        <Suspense fallback={<NavView patch={patch} version={version} champions={champions} pathname={null} />}>
          <Nav patch={patch} version={version} champions={champions} />
        </Suspense>
        <main className="min-w-0 flex-1">{children}</main>
        <Suspense fallback={null}>
          <LiveWatcher />
        </Suspense>
        <FriendAlerts champions={champions} />
      </body>
    </html>
  );
}
