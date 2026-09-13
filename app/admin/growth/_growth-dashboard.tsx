import Link from "next/link";
import {
  ArrowDown,
  BarChart3,
  Clock3,
  FlaskConical,
  MousePointerClick,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  WalletCards,
} from "lucide-react";
import type { OnboardingJob } from "@/lib/onboarding/jobs";
import type { GrowthDashboardData } from "@/lib/services/growthDashboardService";

const JOB_LABELS: Record<OnboardingJob | "UNSELECTED", string> = {
  REPAIRS: "الصيانة",
  SALES: "المبيعات",
  INVENTORY: "المخزون",
  WALLETS: "المحافظ",
  DEBTS: "الديون",
  UNSELECTED: "غير محدد",
};

const STEP_LABELS = {
  SIGNUP: "التسجيل",
  ONBOARDING: "إكمال البداية",
  FIRST_VALUE: "أول قيمة",
  HABIT: "عادة الاستخدام",
} as const;

function pct(value: number) { return `${Math.round(value)}%`; }
function rate(num: number, den: number) { return den > 0 ? (num / den) * 100 : 0; }
function duration(value: number | null) {
  if (value == null) return "—";
  if (value < 1) return `${Math.max(1, Math.round(value * 60))} د`;
  if (value < 48) return `${Math.round(value * 10) / 10} س`;
  return `${Math.round((value / 24) * 10) / 10} يوم`;
}

function FunnelBar({ label, value, base, helper }: { label: string; value: number; base: number; helper: string }) {
  const width = base > 0 ? Math.max(4, Math.round((value / base) * 100)) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div><div className="text-xs font-black text-slate-200">{label}</div><div className="mt-0.5 text-[10px] font-semibold text-slate-500">{helper}</div></div>
        <div className="text-left"><div className="font-numeric text-xl font-black text-white">{value}</div><div className="font-numeric text-[10px] font-bold text-violet-300">{pct(rate(value, base))} من التسجيلات</div></div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-l from-violet-500 to-indigo-500" style={{ width: `${width}%` }} /></div>
    </div>
  );
}

export function GrowthDashboardView({ data }: { data: GrowthDashboardData }) {
  const f = data.funnel;
  const telemetry = data.telemetry;
  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-violet-300"><TrendingUp className="h-5 w-5" /><span className="text-xs font-black">GROWTH</span></div>
          <h1 className="mt-1 text-2xl font-black text-white">لوحة النمو والتفعيل</h1>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-6 text-slate-400">Cohort حسب تاريخ التسجيل. التفعيل والدفع من بيانات مسار الحقيقية، بينما نية الشراء تُقرأ من PostHog عندما يكون اتصال الإدارة مفعلاً.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link href="/admin/growth/experiments" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 text-xs font-black text-fuchsia-200 hover:bg-fuchsia-500/15"><FlaskConical className="h-4 w-4" />تجارب A/B</Link>
        </div>
        <form className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 sm:grid-cols-[150px_210px_auto]" method="get">
          <select name="range" defaultValue={String(data.rangeDays)} className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs font-bold text-slate-200"><option value="7">آخر 7 أيام</option><option value="30">آخر 30 يوم</option><option value="90">آخر 90 يوم</option></select>
          <select name="job" defaultValue={data.primaryJob ?? ""} className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs font-bold text-slate-200"><option value="">كل الأنشطة الأساسية</option>{Object.entries(JOB_LABELS).filter(([job]) => job !== "UNSELECTED").map(([job, label]) => <option key={job} value={job}>{label}</option>)}</select>
          <button className="h-10 rounded-xl bg-violet-600 px-4 text-xs font-black text-white hover:bg-violet-500" type="submit">تطبيق</button>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat icon={Users} label="تسجيلات Cohort" value={f.signups} helper={`${data.rangeDays} يوم`} />
        <Stat icon={UserCheck} label="أكملوا البداية" value={f.onboardingCompleted} helper={`${pct(rate(f.onboardingCompleted, f.signups))} من المسجلين`} />
        <Stat icon={Sparkles} label="وصلوا لأول قيمة" value={f.firstValue} helper={`${pct(rate(f.firstValue, f.onboardingCompleted))} بعد البداية`} />
        <Stat icon={Target} label="حققوا Habit" value={f.habit} helper={`${pct(rate(f.habit, f.firstValue))} بعد أول قيمة`} />
        <Stat icon={WalletCards} label="مدفوعون" value={f.paid} helper={`${pct(rate(f.paid, f.signups))} من Cohort`} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,.6fr)]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="text-sm font-black text-white">Activation Funnel</h2><p className="mt-1 text-[10px] font-semibold text-slate-500">المراحل Authoritative من قاعدة البيانات.</p></div><BarChart3 className="h-5 w-5 text-violet-400" /></div>
          <div className="space-y-5"><FunnelBar label="التسجيل" value={f.signups} base={f.signups} helper="مراكز دخلت Cohort الجديد" /><FunnelBar label="إكمال Onboarding" value={f.onboardingCompleted} base={f.signups} helper="اختاروا طبيعة العمل ونقطة البداية" /><FunnelBar label="First Value" value={f.firstValue} base={f.signups} helper="عملية حقيقية واحدة على الأقل" /><FunnelBar label="Habit" value={f.habit} base={f.signups} helper="3 عمليات حقيقية على يومي عمل مختلفين" /><FunnelBar label="Paid" value={f.paid} base={f.signups} helper="اشتراك تم تفعيله في قاعدة البيانات" /></div>
        </div>
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5"><div className="flex items-center gap-2"><ArrowDown className="h-4 w-4 text-amber-400" /><h2 className="text-sm font-black text-white">أكبر Drop-off</h2></div>{data.biggestDropoff ? <><div className="mt-4 text-xl font-black text-amber-300">{data.biggestDropoff.lost} مركز</div><p className="mt-1 text-xs font-bold text-slate-300">{STEP_LABELS[data.biggestDropoff.from]} → {STEP_LABELS[data.biggestDropoff.to]}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">نسبة العبور {pct(data.biggestDropoff.conversionRate)}</p></> : <p className="mt-4 text-xs text-slate-500">لا توجد بيانات كافية.</p>}</div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-cyan-400" /><h2 className="text-sm font-black text-white">سرعة الوصول للقيمة</h2></div><div className="mt-4 grid grid-cols-2 gap-3"><Timing label="Signup → Onboarding" value={duration(data.timing.medianSignupToOnboardingHours)} /><Timing label="Signup → First Value" value={duration(data.timing.medianSignupToFirstValueHours)} /><Timing label="Signup → Habit" value={duration(data.timing.medianSignupToHabitHours)} /><Timing label="First Value → Habit" value={duration(data.timing.medianFirstValueToHabitHours)} /></div></div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><MousePointerClick className="h-4 w-4 text-fuchsia-400" /><h2 className="text-sm font-black text-white">Monetization Telemetry</h2></div><p className="mt-1 text-[10px] font-semibold text-slate-500">Unique shops من نفس Cohort؛ هذه Intent signals وليست بديلاً عن Paid DB.</p></div>{telemetry.status === "ok" ? <Status tone="ok">PostHog متصل</Status> : telemetry.status === "unconfigured" ? <Status tone="muted">PostHog Admin غير مهيأ</Status> : <Status tone="error">تعذر قراءة PostHog</Status>}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Telemetry label="Prompt Viewed" value={telemetry.promptViewed} /><Telemetry label="Subscription Viewed" value={telemetry.subscriptionViewed} /><Telemetry label="Upgrade Clicked" value={telemetry.upgradeClicked} /><Telemetry label="Activated Event" value={telemetry.subscriptionActivated} /><Telemetry label="Paid DB" value={f.paid} emphasized /></div>
        {telemetry.status !== "ok" ? <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-[10px] font-semibold leading-5 text-slate-500">الـActivation Funnel يعمل بدون PostHog. لتعبئة intent telemetry لاحقاً نحتاج POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID + POSTHOG_API_HOST على السيرفر فقط.</p> : null}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60">
          <div className="border-b border-slate-800 px-5 py-4"><h2 className="text-sm font-black text-white">حسب النشاط الأساسي</h2><p className="mt-1 text-[10px] font-semibold text-slate-500">نعرف إذا المشكلة عامة أو مرتبطة بمسار معين.</p></div>
          <div className="overflow-x-auto"><table className="min-w-[700px] w-full text-right text-xs"><thead className="bg-slate-950/60 text-[10px] text-slate-500"><tr><th className="px-4 py-3">النشاط</th><th className="px-4 py-3">Signup</th><th className="px-4 py-3">First Value</th><th className="px-4 py-3">Habit</th><th className="px-4 py-3">Paid</th><th className="px-4 py-3">Habit rate</th></tr></thead><tbody className="divide-y divide-slate-800">{data.jobs.map((row) => <tr key={row.job}><td className="px-4 py-3 font-black text-slate-200">{JOB_LABELS[row.job]}</td><td className="px-4 py-3 font-numeric text-slate-300">{row.signups}</td><td className="px-4 py-3 font-numeric text-slate-300">{row.firstValue}</td><td className="px-4 py-3 font-numeric text-slate-300">{row.habit}</td><td className="px-4 py-3 font-numeric text-slate-300">{row.paid}</td><td className="px-4 py-3 font-numeric font-black text-violet-300">{pct(row.habitRate)}</td></tr>)}</tbody></table></div>
          {data.weakestJob ? <div className="border-t border-slate-800 bg-amber-500/5 px-5 py-3 text-[10px] font-semibold text-amber-200">أضعف Habit rate حالياً بين الأنشطة ذات ≥3 تسجيلات: <strong>{JOB_LABELS[data.weakestJob.job]}</strong> — {pct(data.weakestJob.habitRate)}.</div> : null}
        </div>
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60">
          <div className="border-b border-slate-800 px-5 py-4"><h2 className="text-sm font-black text-white">Cohort حسب التسجيل</h2><p className="mt-1 text-[10px] font-semibold text-slate-500">7 أيام = يومي، 30/90 يوم = أسبوعي.</p></div>
          <div className="max-h-[420px] overflow-auto"><table className="w-full min-w-[600px] text-right text-xs"><thead className="sticky top-0 bg-slate-950 text-[10px] text-slate-500"><tr><th className="px-4 py-3">Cohort</th><th className="px-4 py-3">Signup</th><th className="px-4 py-3">Onboarding</th><th className="px-4 py-3">First</th><th className="px-4 py-3">Habit</th><th className="px-4 py-3">Paid</th></tr></thead><tbody className="divide-y divide-slate-800">{data.cohorts.map((row) => <tr key={row.key}><td className="px-4 py-3 font-numeric font-bold text-slate-300">{row.key}</td><td className="px-4 py-3 font-numeric text-slate-400">{row.signups}</td><td className="px-4 py-3 font-numeric text-slate-400">{row.onboardingCompleted}</td><td className="px-4 py-3 font-numeric text-slate-400">{row.firstValue}</td><td className="px-4 py-3 font-numeric text-slate-400">{row.habit}</td><td className="px-4 py-3 font-numeric text-slate-400">{row.paid}</td></tr>)}</tbody></table></div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-[10px] font-semibold leading-5 text-slate-500"><strong className="text-slate-300">ملاحظة قياس:</strong> Paid لا يشترط أن يأتي بعد Habit؛ بعض العملاء قد يشتركون مبكراً. حالياً {f.paidBeforeHabit} اشتراك حصل قبل تحقق Habit و{f.paidAfterHabit} بعد Habit. لذلك لا نحول التسلسل التسويقي إلى شرط محاسبي كاذب.</section>
    </div>
  );
}

function Stat({ icon: Icon, label, value, helper }: { icon: typeof Users; label: string; value: number; helper: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><div className="flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300"><Icon className="h-4 w-4" /></span><span className="font-numeric text-2xl font-black text-white">{value}</span></div><div className="mt-3 text-xs font-black text-slate-200">{label}</div><div className="mt-1 text-[10px] font-semibold text-slate-500">{helper}</div></div>; }
function Timing({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="text-[9px] font-bold text-slate-500">{label}</div><div className="mt-1 font-numeric text-sm font-black text-cyan-300">{value}</div></div>; }
function Telemetry({ label, value, emphasized = false }: { label: string; value: number; emphasized?: boolean }) { return <div className={`rounded-2xl border p-4 ${emphasized ? "border-emerald-500/30 bg-emerald-500/10" : "border-slate-800 bg-slate-950/50"}`}><div className="text-[9px] font-black text-slate-500">{label}</div><div className={`mt-2 font-numeric text-2xl font-black ${emphasized ? "text-emerald-300" : "text-white"}`}>{value}</div></div>; }
function Status({ children, tone }: { children: string; tone: "ok" | "muted" | "error" }) { const style = tone === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : tone === "error" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-slate-700 bg-slate-800 text-slate-400"; return <span className={`rounded-full border px-3 py-1 text-[10px] font-black ${style}`}>{children}</span>; }
