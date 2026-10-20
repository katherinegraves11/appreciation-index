"use client";

import { useRef, useState } from "react";
import BagPlate from "./BagPlate";

type Id = { is_bag: boolean; house: string; model: string; spec: string; designer_era: string; confidence: "high" | "medium" | "low"; alternatives: string[]; tell: string };

/** Shrink the photo in the browser so we send a small JPEG, then ask the server what bag it is. */
async function shrink(file: File, max = 1024): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally { URL.revokeObjectURL(url); }
}

export default function PhotoDrop({ onAsk, disabled, horizon }: { onAsk: (question: string) => void; disabled?: boolean; horizon: 1 | 5 | 10 }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [id, setId] = useState<Id | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handle(file: File | undefined) {
    if (!file || disabled) return;
    if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) { setErr("Drop a photo (JPEG, PNG or WebP)."); return; }
    setErr(null); setId(null); setBusy(true);
    try {
      const image = await shrink(file);
      setPreview(image);
      const res = await fetch("/api/identify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image }) });
      const j = (await res.json()) as Id & { error?: string };
      if (!res.ok || j.error) throw new Error(j.error || "Couldn't read that photo.");
      if (!j.is_bag || !j.house) throw new Error("That doesn't look like a bag we can place. Try a clearer photo of the whole bag.");
      setId(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't read that photo."); setPreview(null); }
    finally { setBusy(false); }
  }

  const question = (name: string) => horizon === 1 ? `Is the ${name} worth buying right now?` : horizon === 5 ? `Will the ${name} be worth more in five years?` : `Will the ${name} be worth more in ten years?`;
  const name = id ? `${id.house} ${id.model}${id.spec ? ` (${id.spec})` : ""}` : "";

  return (
    <div className="photodrop">
      {!id && (
        <div
          className={`dropzone ${over ? "over" : ""} ${busy ? "busy" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files?.[0]); }}
          onClick={() => fileRef.current?.click()}
          role="button" tabIndex={0} aria-label="Drop a photo of the bag, or tap to choose one"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
        >
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files?.[0] ?? undefined)} />
          {busy ? <span>Reading the photo…</span> : <span><b>or drop a photo</b> of the bag here · a screenshot of a listing works</span>}
        </div>
      )}
      {err && <p className="status error" role="alert">{err}</p>}
      {id && (
        <div className="idcard">
          {preview && <img src={preview} alt="" className="idthumb" />}
          <div className="idbody">
            <p className="lab">looks like · {id.confidence} confidence</p>
            <p className="idname"><b>{id.house}</b> <i>{id.model}</i>{id.spec ? <span className="idspec"> · {id.spec}</span> : null}</p>
            {id.designer_era && <p className="idera">{id.designer_era}</p>}
            <p className="idtell">{id.tell}</p>
            <div className="idactions">
              <button type="button" className="go" onClick={() => onAsk(question(name))}>Ask about this bag</button>
              {id.alternatives.slice(0, 3).map((a) => <button key={a} type="button" className="alt" onClick={() => onAsk(question(a))}>or: {a}</button>)}
              <button type="button" className="alt" onClick={() => { setId(null); setPreview(null); }}>different photo</button>
            </div>
          </div>
          <BagPlate name={name} size={64} className="idplate" />
        </div>
      )}
      <p className="photonote">Photos are read once to name the bag and are not kept.</p>
    </div>
  );
}
