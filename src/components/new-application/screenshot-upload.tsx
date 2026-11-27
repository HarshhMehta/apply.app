"use client";

import * as React from "react";
import { ImageUp, Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Notice } from "@/components/ui/states";
import { readEmailsFromImage, validateImage } from "@/lib/ocr";
import { cn } from "@/lib/utils";

type Phase = "idle" | "reading" | "done" | "error";

export function ScreenshotUpload({
  alreadyAdded,
  onSingle,
  onAdd,
}: {
  alreadyAdded: Set<string>;
  /** Exactly one address found: put it in the email field for the user to confirm. */
  onSingle: (email: string) => void;
  /** Add several addresses straight to the batch. */
  onAdd: (emails: string[]) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [preview, setPreview] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [found, setFound] = React.useState<string[]>([]);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [dragging, setDragging] = React.useState(false);
  const urlRef = React.useRef<string | null>(null);

  const discardImage = React.useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPreview(null);
  }, []);

  React.useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    discardImage();
    setFound([]);
    setPicked(new Set());
    const invalid = validateImage(file);
    if (invalid) {
      setError(invalid);
      setPhase("error");
      return;
    }
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    setPreview(url);
    setError(null);
    setProgress(0);
    setPhase("reading");
    try {
      const emails = await readEmailsFromImage(file, setProgress);
      setFound(emails);
      setPhase("done");
      if (emails.length === 1) onSingle(emails[0]);
      if (emails.length > 1) setPicked(new Set(emails.filter((e) => !alreadyAdded.has(e))));
    } catch (e) {
      console.error("[ocr]", e);
      setError("Couldn’t read this screenshot. Check your internet connection (the text-recognition engine downloads on first use), try a clearer image, or type the email below.");
      setPhase("error");
    } finally {
      // The screenshot has served its purpose: drop it from memory and from the screen.
      discardImage();
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const reading = phase === "reading";

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a screenshot"
        aria-busy={reading}
        onClick={() => !reading && inputRef.current?.click()}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !reading) { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!reading) void handleFile(e.dataTransfer.files?.[0]); }}
        className={cn(
          "flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-panel border-2 border-dashed border-input px-4 py-6 text-center transition-colors hover:bg-muted/50",
          dragging && "border-primary bg-primary-soft",
          reading && "cursor-progress",
        )}
      >
        <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => void handleFile(e.target.files?.[0])} />
        {reading ? (
          <div className="flex w-full max-w-xs flex-col items-center gap-3">
            {preview && (
              // Blob URL of a local file, so next/image does not apply.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Screenshot being read" className="max-h-28 rounded-control border object-contain" />
            )}
            <p className="flex items-center gap-2 text-sm font-medium"><Loader2 className="size-4 animate-spin" /> Reading text… {progress > 0 ? `${progress}%` : ""}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>
          </div>
        ) : (
          <>
            <ImageUp className="mb-2 size-7 text-muted-foreground" />
            <p className="text-sm font-medium">Drop a screenshot here, or choose a file</p>
            <p className="mt-1 text-[13px] text-muted-foreground">PNG, JPG, JPEG or WEBP · up to 10 MB</p>
          </>
        )}
      </div>

      <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        Text is read inside your browser and the image is discarded right after. Screenshots are never uploaded or saved.
      </p>

      {phase === "error" && error && <Notice tone="error">{error}</Notice>}

      {phase === "done" && found.length === 0 && (
        <Notice tone="warning" title="No email address found">Try a sharper or larger screenshot, or type the address manually.</Notice>
      )}

      {phase === "done" && found.length === 1 && (
        <Notice tone="success" title="Found 1 email address">
          {alreadyAdded.has(found[0]) ? `${found[0]} is already in this batch.` : `${found[0]} was filled into the email field. Review it, then choose Add email.`}
        </Notice>
      )}

      {phase === "done" && found.length > 1 && (
        <div className="rounded-panel border">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-medium">Found {found.length} email addresses</p>
            <button type="button" className="text-[13px] font-medium text-primary hover:underline" onClick={() => setPicked(picked.size === found.filter((e) => !alreadyAdded.has(e)).length ? new Set() : new Set(found.filter((e) => !alreadyAdded.has(e))))}>
              {picked.size ? "Clear selection" : "Select all"}
            </button>
          </div>
          <ul className="divide-y">
            {found.map((email) => {
              const dup = alreadyAdded.has(email);
              return (
                <li key={email}>
                  <label className={cn("flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50", dup && "cursor-not-allowed opacity-60")}>
                    <Checkbox
                      disabled={dup}
                      checked={picked.has(email)}
                      onChange={(e) => setPicked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(email); else n.delete(email); return n; })}
                    />
                    <span className="min-w-0 flex-1 truncate">{email}</span>
                    {dup && <span className="text-xs text-muted-foreground">Already added</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
            <Button variant="ghost" size="sm" onClick={() => { setFound([]); setPhase("idle"); }}><X /> Dismiss</Button>
            <Button size="sm" disabled={picked.size === 0} onClick={() => { onAdd([...picked]); setFound([]); setPicked(new Set()); setPhase("idle"); }}>
              Add {picked.size || ""} selected
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
