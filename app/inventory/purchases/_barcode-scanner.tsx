"use client";

import { Camera, CameraOff, Keyboard, Loader2, ScanBarcode } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { isLikelyScannerSequence } from "@/lib/purchase-import";
import { lookupPurchaseBarcodeAction, searchPurchaseInventoryAction } from "./actions";

type InventoryCandidate = Awaited<ReturnType<typeof searchPurchaseInventoryAction>>[number];

export type ResolvedBarcodeScan = {
  code: string;
  source: "scanner" | "manual" | "camera";
  state: "existing" | "new" | "review";
  item: InventoryCandidate | null;
  candidates: InventoryCandidate[];
};

type BarcodeDetection = { rawValue?: string };
type BarcodeDetectorInstance = { detect(source: unknown): Promise<BarcodeDetection[]> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

export function PurchaseBarcodeScanner({ onScan }: { onScan: (result: ResolvedBarcodeScan) => void }) {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [cameraSupported, setCameraSupported] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const keyTimesRef = useRef<number[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectingRef = useRef(false);

  useEffect(() => {
    setCameraSupported(Boolean(typeof window !== "undefined" && window.BarcodeDetector && navigator.mediaDevices?.getUserMedia));
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (active) requestAnimationFrame(() => inputRef.current?.focus());
  }, [active]);

  async function resolveCode(raw: string, source: ResolvedBarcodeScan["source"]) {
    const code = raw.trim().replace(/\s+/g, "");
    if (!code) return;
    setLoading(true);
    setMessage("");
    const result = await lookupPurchaseBarcodeAction(code);
    setLoading(false);
    if (!result.ok) {
      setMessage("error" in result ? result.error : "تعذر قراءة الباركود.");
      return;
    }
    onScan({
      code,
      source,
      state: result.state,
      item: result.item,
      candidates: result.candidates,
    });
    setValue("");
    keyTimesRef.current = [];
    if (active && source !== "camera") requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      keyTimesRef.current.push(performance.now());
      if (keyTimesRef.current.length > 80) keyTimesRef.current.shift();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!active) {
      setMessage("فعّل «وضع المسح» ليتم اعتماد الإدخال السريع من قارئ الباركود تلقائياً، أو استخدم زر البحث للإدخال اليدوي.");
      return;
    }
    const likelyScanner = isLikelyScannerSequence(keyTimesRef.current, Math.min(4, Math.max(2, value.trim().length)));
    if (!likelyScanner) {
      setMessage("يبدو أن الإدخال تم بالكتابة العادية. اضغط «بحث بالباركود» إذا كنت تريد استخدامه يدوياً.");
      return;
    }
    void resolveCode(value, "scanner");
  }

  function stopCamera() {
    if (cameraTimerRef.current) clearInterval(cameraTimerRef.current);
    cameraTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    detectingRef.current = false;
    setCameraOpen(false);
  }

  async function startCamera() {
    if (!cameraSupported || !window.BarcodeDetector) return;
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(async () => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const BarcodeDetectorCtor = window.BarcodeDetector;
        if (!BarcodeDetectorCtor) {
          setCameraError("المتصفح أوقف دعم قراءة الباركود بالكاميرا أثناء التشغيل. استخدم القارئ الخارجي أو الإدخال اليدوي.");
          stopCamera();
          return;
        }
        const detector = new BarcodeDetectorCtor({ formats: ["ean_13", "ean_8", "code_128", "upc_a", "upc_e", "qr_code"] });
        cameraTimerRef.current = setInterval(async () => {
          if (detectingRef.current || !videoRef.current || videoRef.current.readyState < 2) return;
          detectingRef.current = true;
          try {
            const results = await detector.detect(videoRef.current);
            const code = results.find((result) => result.rawValue?.trim())?.rawValue?.trim();
            if (code) {
              stopCamera();
              await resolveCode(code, "camera");
            }
          } catch {
            // Transient frame/detector errors are ignored; the next frame can still succeed.
          } finally {
            detectingRef.current = false;
          }
        }, 260);
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setCameraError(name === "NotAllowedError" ? "تم رفض إذن الكاميرا. يمكنك الاستمرار بقارئ الباركود الخارجي أو الإدخال اليدوي." : "تعذر تشغيل الكاميرا على هذا الجهاز/المتصفح.");
      stopCamera();
    }
  }

  return <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900/70 dark:bg-violet-950/20">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><ScanBarcode className="h-5 w-5 text-violet-700 dark:text-violet-300" /><div><h3 className="text-sm font-black text-slate-900 dark:text-slate-100">إدخال بالباركود</h3><p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">وضع المسح مخصص لقارئ الباركود الذي يرسل الأحرف سريعاً ثم Enter، حتى لا تختلط القراءة مع الكتابة العادية.</p></div></div>
      <Button type="button" variant={active ? "default" : "outline"} onClick={() => setActive((current) => { keyTimesRef.current = []; setMessage(""); return !current; })} className="font-black"><Keyboard className="ml-1.5 h-4 w-4" />{active ? "وضع المسح مفعّل" : "تفعيل وضع المسح"}</Button>
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
      <input ref={inputRef} value={value} onChange={(event) => { setValue(event.target.value); setMessage(""); }} onKeyDown={handleKeyDown} className="erp-input font-numeric" placeholder="امسح الباركود هنا أو اكتبه للبحث اليدوي" autoComplete="off" inputMode="numeric" />
      <Button type="button" variant="outline" disabled={loading || !value.trim()} onClick={() => void resolveCode(value, "manual")} className="font-bold">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "بحث بالباركود"}</Button>
      {cameraSupported ? <Button type="button" variant="outline" onClick={() => cameraOpen ? stopCamera() : void startCamera()} className="font-bold">{cameraOpen ? <><CameraOff className="ml-1.5 h-4 w-4" />إيقاف الكاميرا</> : <><Camera className="ml-1.5 h-4 w-4" />مسح بالكاميرا</>}</Button> : null}
    </div>
    {message && <p className="mt-2 text-[11px] font-bold text-amber-700 dark:text-amber-300">{message}</p>}
    {!cameraSupported && <p className="mt-2 text-[10px] font-semibold text-slate-400">المسح بالكاميرا لا يظهر إلا إذا كان المتصفح يدعم BarcodeDetector والوصول للكاميرا فعلياً. قارئ USB/Bluetooth يعمل عبر وضع المسح أعلاه.</p>}
    {cameraError && <p className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-300">{cameraError}</p>}
    {cameraOpen && <div className="mt-3 overflow-hidden rounded-xl border border-violet-200 bg-black dark:border-violet-800"><video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" /><div className="bg-slate-950 px-3 py-2 text-center text-[10px] font-bold text-white">وجّه الكاميرا إلى الباركود. عند القراءة تُغلق الكاميرا تلقائياً وتُعالج النتيجة.</div></div>}
  </section>;
}
