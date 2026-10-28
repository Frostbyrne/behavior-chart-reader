"use client";

import { useEffect, useState } from "react";
import { RotateIcon, ZoomIcon } from "./icons";

async function rotated(src: string, turns: number): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const sideways = turns % 2 === 1;
  const canvas = document.createElement("canvas");
  canvas.width = sideways ? img.naturalHeight : img.naturalWidth;
  canvas.height = sideways ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  return blob ? URL.createObjectURL(blob) : src;
}

/** The original photo, for checking the reading against. Rotate and zoom only change this view. */
export function PhotoViewer({ src, initialTurns = 0 }: { src: string; initialTurns?: number }) {
  const [turns, setTurns] = useState(initialTurns);
  const [view, setView] = useState<{ turns: number; url: string } | null>(null);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (turns === 0) return;
    let live = true;
    let made: string | null = null;
    rotated(src, turns).then((url) => {
      made = url;
      if (live) setView({ turns, url });
      else if (url !== src) URL.revokeObjectURL(url);
    });
    return () => {
      live = false;
      if (made && made !== src) URL.revokeObjectURL(made);
    };
  }, [src, turns]);

  const shown = turns === 0 ? src : view?.turns === turns ? view.url : null;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-[#1b2333]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-white/70">
        <span>Paper chart</span>
        <div className="flex gap-1">
          <button
            onClick={() => setTurns((t) => (t + 1) % 4)}
            className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10 hover:text-white"
          >
            <RotateIcon /> Rotate
          </button>
          <button
            onClick={() => setZoom((z) => !z)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10 hover:text-white ${zoom ? "bg-white/10 text-white" : ""}`}
          >
            <ZoomIcon /> {zoom ? "Fit" : "Zoom"}
          </button>
        </div>
      </div>
      <div className={zoom ? "h-[560px] overflow-auto" : "grid h-[380px] place-items-center overflow-hidden 2xl:h-[480px]"}>
        {shown && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt="Photo of the paper behavior chart"
            className={zoom ? "w-[240%] max-w-none" : "max-h-full max-w-full object-contain"}
          />
        )}
      </div>
    </div>
  );
}
