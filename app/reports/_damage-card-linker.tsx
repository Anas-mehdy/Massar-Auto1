"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function DamageCardLinker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname !== "/reports") return;

    const labels = Array.from(document.querySelectorAll("p"));
    const label = labels.find((node) => node.textContent?.trim() === "إجمالي التوالف");
    const card = label?.closest("div.rounded-2xl.border.p-5") as HTMLElement | null;
    if (!card || card.dataset.damageLinked === "1") return;

    const params = new URLSearchParams();
    const preset = searchParams.get("preset") || "month";
    params.set("preset", preset);
    if (preset === "custom") {
      const start = searchParams.get("start");
      const end = searchParams.get("end");
      if (start) params.set("start", start);
      if (end) params.set("end", end);
    }
    const href = `/reports/damages?${params.toString()}`;

    card.dataset.damageLinked = "1";
    card.setAttribute("role", "link");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", "فتح تفاصيل وسجل التوالف");
    card.classList.add("cursor-pointer", "transition-transform", "hover:-translate-y-0.5");

    const navigate = () => { window.location.href = href; };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigate();
      }
    };

    card.addEventListener("click", navigate);
    card.addEventListener("keydown", onKeyDown);
    return () => {
      card.removeEventListener("click", navigate);
      card.removeEventListener("keydown", onKeyDown);
      delete card.dataset.damageLinked;
    };
  }, [pathname, searchParams]);

  return null;
}
