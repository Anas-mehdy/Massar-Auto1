"use client";

import { useEffect } from "react";

function setControlledSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function findBulkCategorySection(button: HTMLButtonElement) {
  let node: HTMLElement | null = button;
  while (node) {
    if (node.querySelector("h2")?.textContent?.includes("تصنيف جماعي للأصناف الجديدة")) return node;
    node = node.parentElement;
  }
  return null;
}

function applyCategoryToInvoiceLines(section: HTMLElement, categoryId: string) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>("article.purchase-line-card"));
  const newCards = cards.filter((card) => {
    const select = card.querySelector<HTMLSelectElement>("select[data-purchase-field]");
    return Boolean(select?.querySelector(`option[value=\"${CSS.escape(categoryId)}\"]`));
  });
  if (!newCards.length) return;

  const selectedCards = newCards.filter((card) => card.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked);
  const targets = selectedCards.length ? selectedCards : newCards;
  for (const card of targets) {
    const categorySelect = Array.from(card.querySelectorAll<HTMLSelectElement>("select[data-purchase-field]"))
      .find((select) => Boolean(select.querySelector(`option[value=\"${CSS.escape(categoryId)}\"]`)));
    if (categorySelect && categorySelect.value !== categoryId) setControlledSelectValue(categorySelect, categoryId);
  }

  section.dispatchEvent(new CustomEvent("massar:bulk-category-applied", {
    bubbles: true,
    detail: { categoryId, count: targets.length },
  }));
}

export function PurchaseBulkCategorySyncBridge() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const onClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("button");
      if (!button || !button.textContent?.includes("إنشاء واختيار")) return;
      const section = findBulkCategorySection(button);
      if (!section) return;
      const bulkSelect = section.querySelector<HTMLSelectElement>("select.erp-input");
      if (!bulkSelect) return;
      const previousValue = bulkSelect.value;
      let attempts = 0;
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        attempts += 1;
        const categoryId = bulkSelect.value;
        if (categoryId && categoryId !== previousValue) {
          if (timer) clearInterval(timer);
          timer = null;
          requestAnimationFrame(() => applyCategoryToInvoiceLines(section, categoryId));
          return;
        }
        if (attempts >= 100 && timer) {
          clearInterval(timer);
          timer = null;
        }
      }, 50);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (timer) clearInterval(timer);
    };
  }, []);

  return null;
}
