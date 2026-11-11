"use client";

import { useEffect, useState } from "react";

export type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export type WorkerState = { status: "checking" | "ready" | "unsupported" | "failed"; detail?: string };

export default function PwaInstall({ worker, prompt, installed, onInstall }: { worker: WorkerState; prompt: InstallPromptEvent | null; installed: boolean; onInstall: () => void }) {
  const [assets, setAssets] = useState<"checking" | "ready" | "failed">("checking");
  const [assetDetail, setAssetDetail] = useState("");
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch("/manifest.webmanifest", { cache: "no-store" });
        if (!response.ok) throw new Error(`Manifesto: HTTP ${response.status}`);
        const manifest = await response.json() as { start_url?: string; display?: string; icons?: { src: string; sizes: string }[] };
        if (manifest.start_url !== "/" || manifest.display !== "standalone") throw new Error("Manifesto incompleto.");
        for (const size of ["192x192", "512x512"]) {
          const icon = manifest.icons?.find((item) => item.sizes === size);
          if (!icon) throw new Error(`Ícone ${size} ausente.`);
          const image = await fetch(icon.src, { cache: "no-store" });
          if (!image.ok || !image.headers.get("content-type")?.startsWith("image/png")) throw new Error(`Ícone ${size} indisponível.`);
        }
        if (active) setAssets("ready");
      } catch (error) {
        if (active) { setAssets("failed"); setAssetDetail(error instanceof Error ? error.message : "Falha ao verificar os arquivos."); }
      }
    };
    void check();
    return () => { active = false; };
  }, []);
  return <section className="panel form-panel install-panel"><span className="section-kicker">NO CELULAR</span><h2>Instalar o aplicativo</h2><p>Abra este endereço diretamente no Chrome do Android. O app instalado deve abrir sem a barra do navegador e continuar usando sua conta e seus dados sincronizados.</p>
    <div className="install-checks"><div><span>Manifesto e ícones</span><strong>{assets === "ready" ? "Disponíveis" : assets === "failed" ? "Problema detectado" : "Verificando"}</strong></div><div><span>Service worker</span><strong>{worker.status === "ready" ? "Registrado" : worker.status === "failed" ? "Falha ao registrar" : worker.status === "unsupported" ? "Indisponível" : "Verificando"}</strong></div><div><span>Modo instalado</span><strong>{installed ? "Ativo" : prompt ? "Instalação oferecida" : "Ainda não detectado"}</strong></div></div>
    {(assetDetail || worker.detail) && <p className="install-error" role="status">{assetDetail || worker.detail}</p>}
    {prompt && !installed && <button className="primary-button" onClick={onInstall}>Instalar aplicativo</button>}
    {!installed && <p className="quiet-note">No Chrome Android, use ⋮ → <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>. Se o Chrome recusar, envie uma captura desta seção e da mensagem exibida; o próprio aparelho precisa confirmar a instalação.</p>}
  </section>;
}
