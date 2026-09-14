"use client";

import Link from "next/link";
import { Check, Copy, Printer, QrCode, Truck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const SERVICE_ORDER_DETAIL_PATH = /^\/service-orders\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("تعذر نسخ الرابط.");
}

function findReadyDeliverySection() {
  return Array.from(document.querySelectorAll<HTMLElement>("section")).find((section) => {
    const heading = section.querySelector("h2");
    return heading?.textContent?.includes("تسليم المركبة") ?? false;
  }) ?? null;
}

export function ServiceOrderTrackingActions() {
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  const [deliveryReady, setDeliveryReady] = useState(false);
  const match = pathname.match(SERVICE_ORDER_DETAIL_PATH);
  const serviceOrderId = match?.[1] ?? null;

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  useEffect(() => {
    if (!serviceOrderId) {
      setDeliveryReady(false);
      return;
    }

    const refresh = () => setDeliveryReady(Boolean(findReadyDeliverySection()));
    refresh();

    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [serviceOrderId]);

  if (!serviceOrderId) return null;

  const publicPath = `/track/${serviceOrderId}`;
  const trackingManagerPath = `/service-orders/${serviceOrderId}/tracking`;
  const keyLabelPath = `/service-orders/${serviceOrderId}/print/key-label`;

  async function handleCopy() {
    try {
      await copyText(`${window.location.origin}${publicPath}`);
      setCopied(true);
    } catch {
      window.prompt("انسخ رابط التتبع:", `${window.location.origin}${publicPath}`);
    }
  }

  function handleDeliveryShortcut() {
    findReadyDeliverySection()?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      {deliveryReady ? (
        <Button type="button" className="font-bold" onClick={handleDeliveryShortcut}>
          <Truck className="ml-1.5 h-4 w-4" />
          تسليم المركبة
        </Button>
      ) : null}
      <Button asChild variant="outline" className="font-bold">
        <Link href={keyLabelPath} target="_blank" rel="noreferrer">
          <Printer className="ml-1.5 h-4 w-4" />
          ستيكر المفتاح
        </Link>
      </Button>
      <Button type="button" variant="outline" className="font-bold" onClick={handleCopy}>
        {copied ? <Check className="ml-1.5 h-4 w-4 text-emerald-600" /> : <Copy className="ml-1.5 h-4 w-4" />}
        {copied ? "تم نسخ الرابط" : "نسخ رابط التتبع"}
      </Button>
      <Button asChild variant="outline" className="font-bold">
        <Link href={trackingManagerPath}>
          <QrCode className="ml-1.5 h-4 w-4" />
          QR التتبع
        </Link>
      </Button>
    </>
  );
}
