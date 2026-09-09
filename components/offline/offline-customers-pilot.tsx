"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createCustomerOffline,
  deleteCustomerOffline,
  getCustomersOffline,
  updateCustomerOffline,
  type OfflineActor,
  type OfflineCustomerInput,
} from "@/lib/offline/customerRepository";
import {
  acceptServerCustomer,
  reapplyLocalCustomer,
} from "@/lib/offline/customerConflictResolution";
import {
  readOfflineSession,
  refreshOfflineSessionSnapshot,
  type OfflineSessionSnapshot,
} from "@/lib/offline/offlineSession";
import { syncCustomersNow, type CustomerSyncSummary } from "@/lib/offline/syncEngine";
import type { OfflineCustomer } from "@/lib/offline/types";

const emptyForm: OfflineCustomerInput = { name: "", phone: "", email: "", notes: "" };

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "حدث خطأ غير متوقع.";
}

function statusLabel(status: OfflineCustomer["syncStatus"]) {
  if (status === "pending") return "بانتظار المزامنة";
  if (status === "conflict") return "تعارض يحتاج مراجعة";
  return "متزامن";
}

export function OfflineCustomersPilot() {
  const [session, setSession] = useState<OfflineSessionSnapshot | null>(null);
  const [customers, setCustomers] = useState<OfflineCustomer[]>([]);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<CustomerSyncSummary | null>(null);
  const [form, setForm] = useState<OfflineCustomerInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const actor = useMemo<OfflineActor | null>(() => {
    if (!session) return null;
    return { shopId: session.shop.id, userId: session.user.id };
  }, [session]);

  const reloadCustomers = useCallback(async (shopId: string) => {
    setCustomers(await getCustomersOffline(shopId));
  }, []);

  const runSync = useCallback(async (activeSession: OfflineSessionSnapshot) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setSyncing(true);
    try {
      const summary = await syncCustomersNow(activeSession.shop.id);
      setSyncSummary(summary);
      await reloadCustomers(activeSession.shop.id);
      setMessage(summary.conflicts > 0 ? `تمت المزامنة مع ${summary.conflicts} تعارض يحتاج مراجعة.` : "تمت المزامنة بنجاح.");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSyncing(false);
    }
  }, [reloadCustomers]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let snapshot: OfflineSessionSnapshot | null = null;
        if (navigator.onLine) {
          try {
            snapshot = await refreshOfflineSessionSnapshot();
          } catch {
            snapshot = await readOfflineSession();
          }
        } else {
          snapshot = await readOfflineSession();
        }

        if (cancelled) return;
        setSession(snapshot);
        if (!snapshot) {
          setMessage("يلزم تسجيل دخول واتصال بالإنترنت مرة واحدة لتفعيل العمل دون اتصال على هذا الجهاز.");
          return;
        }
        await reloadCustomers(snapshot.shop.id);
        if (navigator.onLine) await runSync(snapshot);
      } catch (error) {
        if (!cancelled) setMessage(errorText(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadCustomers, runSync]);

  useEffect(() => {
    if (!online || !session) return;
    void runSync(session);
  }, [online, session, runSync]);

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actor || !session) return;
    setMessage(null);
    try {
      if (editingId) await updateCustomerOffline(actor, editingId, form);
      else await createCustomerOffline(actor, form);
      setForm(emptyForm);
      setEditingId(null);
      await reloadCustomers(session.shop.id);
      setMessage(online ? "تم الحفظ محلياً، وجاري إرساله للسيرفر." : "تم الحفظ على هذا الجهاز وسيُزامن عند عودة الإنترنت.");
      if (online) await runSync(session);
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  function startEdit(customer: OfflineCustomer) {
    setEditingId(customer.id);
    setForm({ name: customer.name, phone: customer.phone ?? "", email: customer.email ?? "", notes: customer.notes ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeCustomer(customer: OfflineCustomer) {
    if (!actor || !session) return;
    if (!window.confirm(`حذف العميل ${customer.name}؟`)) return;
    try {
      await deleteCustomerOffline(actor, customer.id);
      await reloadCustomers(session.shop.id);
      setMessage(online ? "تم تسجيل الحذف محلياً وجاري مزامنته." : "تم تسجيل الحذف محلياً وسيُزامن لاحقاً.");
      if (online) await runSync(session);
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  async function useServerVersion(customer: OfflineCustomer) {
    if (!session) return;
    try {
      await acceptServerCustomer(session.shop.id, customer.id);
      await reloadCustomers(session.shop.id);
      setMessage("تم اعتماد نسخة السيرفر وإنهاء التعارض.");
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  async function keepLocalVersion(customer: OfflineCustomer) {
    if (!session || !actor) return;
    try {
      await reapplyLocalCustomer(actor, customer.id);
      await reloadCustomers(session.shop.id);
      setMessage("تم إنشاء محاولة جديدة اعتماداً على أحدث نسخة من السيرفر.");
      if (online) await runSync(session);
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  if (loading) return <div className="rounded-2xl border bg-white p-8 text-sm font-bold">جاري تهيئة قاعدة البيانات المحلية...</div>;
  if (!session) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm font-bold text-amber-900">{message ?? "تعذر تهيئة جلسة العمل المحلية."}</div>;

  const canManage = session.permissions.includes("customers:manage");
  const canDelete = session.permissions.includes("customers:delete");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 font-black">
            {online ? <Cloud className="h-4 w-4 text-emerald-600" /> : <CloudOff className="h-4 w-4 text-amber-600" />}
            {online ? "متصل" : "وضع دون اتصال"}
          </div>
          <p className="mt-1 text-xs text-slate-500">{session.shop.name} · {session.user.name}</p>
        </div>
        <Button type="button" variant="outline" disabled={!online || syncing} onClick={() => void runSync(session)} className="font-bold">
          <RefreshCw className={`ml-1.5 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          مزامنة الآن
        </Button>
      </div>

      {message && <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">{message}</div>}

      {syncSummary && (
        <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-5">
          <div className="rounded-xl border bg-white p-3"><b>{syncSummary.pushed}</b><br />مرسلة</div>
          <div className="rounded-xl border bg-white p-3"><b>{syncSummary.applied}</b><br />مطبقة</div>
          <div className="rounded-xl border bg-white p-3"><b>{syncSummary.pulled}</b><br />مستلمة</div>
          <div className="rounded-xl border bg-white p-3"><b>{syncSummary.conflicts}</b><br />تعارض</div>
          <div className="rounded-xl border bg-white p-3"><b>{syncSummary.failed}</b><br />فاشلة</div>
        </div>
      )}

      {canManage && (
        <form onSubmit={submitCustomer} className="grid gap-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-black">{editingId ? "تعديل عميل محلياً" : "إضافة عميل محلياً"}</h2>
            {editingId && <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setForm(emptyForm); }}>إلغاء التعديل</Button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="h-11 rounded-xl border px-3 text-sm" required placeholder="اسم العميل" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} />
            <input className="h-11 rounded-xl border px-3 text-sm" placeholder="رقم الهاتف" value={form.phone ?? ""} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} />
            <input className="h-11 rounded-xl border px-3 text-sm" type="email" placeholder="البريد الإلكتروني" value={form.email ?? ""} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} />
            <input className="h-11 rounded-xl border px-3 text-sm" placeholder="ملاحظات" value={form.notes ?? ""} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} />
          </div>
          <Button type="submit" className="w-fit font-black">
            {editingId ? <Pencil className="ml-1.5 h-4 w-4" /> : <Plus className="ml-1.5 h-4 w-4" />}
            {editingId ? "حفظ التعديل" : "إضافة العميل"}
          </Button>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-black">العملاء المحليون</h2>
          <span className="text-xs font-bold text-slate-500">{customers.length} عميل</span>
        </div>
        {customers.length === 0 ? (
          <div className="p-8 text-center text-sm font-bold text-slate-500">لا توجد بيانات محلية بعد.</div>
        ) : (
          <div className="divide-y">
            {customers.map((customer) => (
              <div key={customer.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-black text-slate-900">{customer.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{customer.phone ?? "بدون هاتف"} · v{customer.version}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${customer.syncStatus === "conflict" ? "bg-red-100 text-red-700" : customer.syncStatus === "pending" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {statusLabel(customer.syncStatus)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {customer.syncStatus === "conflict" ? (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => void useServerVersion(customer)}>اعتماد السيرفر</Button>
                      {canManage && <Button type="button" variant="outline" size="sm" onClick={() => void keepLocalVersion(customer)}>إعادة تطبيق المحلي</Button>}
                    </>
                  ) : (
                    <>
                      {canManage && <Button type="button" variant="outline" size="sm" onClick={() => startEdit(customer)}><Pencil className="h-3.5 w-3.5" /></Button>}
                      {canDelete && <Button type="button" variant="outline" size="sm" onClick={() => void removeCustomer(customer)} className="text-red-700"><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
