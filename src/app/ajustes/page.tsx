import type { Metadata } from "next";
import { SettingsPanel } from "@/components/settings-panel";
import { PageHeader } from "@/components/ui";
import { getLatestVersion, versionToPatch } from "@/lib/ddragon";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const patch = versionToPatch(await getLatestVersion());
  return (
    <>
      <PageHeader title="Ajustes">Tu cuenta de League, la clave de Riot y cómo arranca la app.</PageHeader>
      <div className="p-4 sm:p-8">
        <SettingsPanel patch={patch} />
      </div>
    </>
  );
}
