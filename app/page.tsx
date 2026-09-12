import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  CarFront,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Gauge,
  PackageCheck,
  QrCode,
  ShieldCheck,
  Sparkles,
  Truck,
  UsersRound,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: CarFront,
    title: "العملاء والمركبات",
    description: "ملف مستقل لكل عميل ومركبة مع اللوحة وVIN والعداد وسجل الصيانة الكامل.",
  },
  {
    icon: ClipboardCheck,
    title: "أوامر الصيانة",
    description: "من استقبال المركبة وتسجيل الشكوى والفحص إلى التنفيذ والتسليم وإغلاق الأمر.",
  },
  {
    icon: FileText,
    title: "عروض الأسعار والموافقات",
    description: "أنشئ عرض سعر واضحاً للقطع والأجور وسجّل موافقة العميل قبل بدء العمل.",
  },
  {
    icon: Boxes,
    title: "المخزون وقطع الغيار",
    description: "تابع الكميات والمستودعات وحركة الصنف وحد إعادة الطلب وربط القطع بأوامر الصيانة.",
  },
  {
    icon: PackageCheck,
    title: "المشتريات والموردون",
    description: "استلم فواتير الشراء، حدّث المخزون تلقائياً، وتابع دفعات الموردين وأرصدتهم.",
  },
  {
    icon: BarChart3,
    title: "الفواتير والتقارير",
    description: "راقب المبيعات والتحصيل والأرباح والذمم وحركة النقد من شاشة واحدة مترابطة.",
  },
];

const workflow = [
  ["01", "استقبال المركبة", "اختيار العميل والمركبة وتسجيل الشكوى والعداد ومعلومات الاستلام."],
  ["02", "الفحص والتشخيص", "توثيق نتيجة الفحص وتحديد قطع الغيار والأعمال المطلوبة."],
  ["03", "عرض السعر والموافقة", "تجهيز السعر النهائي وتسجيل قرار العميل قبل التنفيذ."],
  ["04", "التنفيذ والتسليم", "استهلاك القطع وتسجيل الأجور وإصدار الفاتورة ثم تسليم المركبة."],
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100 selection:bg-teal-500 selection:text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-28 right-[12%] h-[520px] w-[520px] rounded-full bg-teal-500/10 blur-[130px]" />
        <div className="absolute top-[760px] -left-40 h-[440px] w-[440px] rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white p-2 shadow-lg shadow-teal-500/10 sm:h-11 sm:w-11 sm:rounded-2xl">
              <Image src="/masar-icon.png" alt="مسار" width={32} height={32} className="h-full w-full object-contain" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-black tracking-tight text-white sm:text-xl">مسار</span>
              <span className="hidden text-[9px] font-bold tracking-wider text-teal-400 sm:block">إدارة مراكز صيانة المركبات</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-xs font-bold text-slate-300 md:flex">
            <a href="#features" className="transition hover:text-teal-400">المميزات</a>
            <a href="#how-it-works" className="transition hover:text-teal-400">دورة العمل</a>
            <a href="#operations" className="transition hover:text-teal-400">التشغيل والمحاسبة</a>
            <a href="#faq" className="transition hover:text-teal-400">الأسئلة الشائعة</a>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost" className="h-9 rounded-xl px-3 text-xs font-bold text-slate-300 hover:bg-slate-900 hover:text-white sm:h-10 sm:px-4">
              <Link href="/login">تسجيل الدخول</Link>
            </Button>
            <Button asChild className="h-9 rounded-xl border-0 bg-gradient-to-r from-teal-400 to-teal-600 px-3 text-xs font-black text-slate-950 shadow-lg shadow-teal-500/20 sm:h-10 sm:px-5">
              <Link href="/register" className="flex items-center gap-1.5">ابدأ مجاناً <ArrowLeft className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="mx-auto max-w-7xl text-center">
          <div className="mx-auto inline-flex max-w-full items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-4 py-1.5 text-[11px] font-black text-teal-300 sm:text-xs">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>نظام واحد لإدارة مركز صيانة المركبات من الاستقبال حتى التسليم</span>
          </div>

          <h1 className="mx-auto mt-7 max-w-5xl text-3xl font-black leading-[1.25] tracking-tight text-white sm:text-5xl lg:text-6xl">
            شغّل مركز الصيانة بوضوح،
            <span className="mt-2 block bg-gradient-to-l from-teal-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
              واربط المركبة والعمل والمخزون والمحاسبة معاً
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-sm font-medium leading-8 text-slate-400 sm:text-base">
            مسار يساعدك على إدارة العملاء والمركبات وأوامر الصيانة وعروض الأسعار وقطع الغيار والمشتريات والفواتير،
            مع سجل واضح لكل مركبة وصلاحيات دقيقة لفريق العمل.
          </p>

          <div className="mx-auto mt-8 flex max-w-md flex-col items-center justify-center gap-3 sm:max-w-none sm:flex-row">
            <Button asChild className="h-12 w-full rounded-2xl border-0 bg-gradient-to-r from-teal-400 via-teal-500 to-teal-700 px-8 text-sm font-black text-slate-950 shadow-xl shadow-teal-500/20 sm:w-auto">
              <Link href="/register" className="flex items-center justify-center gap-2">أنشئ حسابك وابدأ الآن <ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" className="h-12 w-full rounded-2xl border-slate-800 bg-slate-900/60 px-7 text-sm font-bold text-white hover:bg-slate-800 sm:w-auto">
              <Link href="/login">الدخول للنظام</Link>
            </Button>
          </div>

          <div className="mx-auto mt-14 max-w-5xl rounded-3xl border border-slate-800 bg-slate-900/70 p-4 text-right shadow-2xl backdrop-blur-xl sm:mt-20 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-teal-400">لوحة تشغيل موحدة</p>
                <h2 className="mt-1 text-lg font-black text-white">صورة واضحة عن ورشة اليوم</h2>
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black text-emerald-300">بيانات مترابطة لحظياً</span>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <PreviewMetric icon={Wrench} label="أوامر قيد التنفيذ" value="12" />
              <PreviewMetric icon={CarFront} label="مركبات جاهزة للتسليم" value="5" />
              <PreviewMetric icon={Gauge} label="مواعيد اليوم" value="8" />
              <PreviewMetric icon={Boxes} label="قطع تحت حد الطلب" value="7" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <PreviewRow title="تويوتا كامري 2022" subtitle="فحص فرامل وتغيير فحمات" badge="قيد التنفيذ" />
              <PreviewRow title="هيونداي إلنترا 2020" subtitle="تغيير زيت وفلاتر" badge="جاهزة" />
              <PreviewRow title="كيا سبورتاج 2021" subtitle="تشخيص نظام التبريد" badge="بانتظار الموافقة" />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="relative border-y border-slate-800/80 bg-slate-900/40 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="كل الأساسيات في مكان واحد" title="مصمم لدورة عمل مركز صيانة المركبات" description="بدل الملفات المنفصلة والحسابات اليدوية، كل خطوة تبني على الخطوة التي قبلها وتترك سجلاً واضحاً يمكن الرجوع إليه." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-2xl border border-slate-800 bg-slate-950/65 p-5 shadow-lg shadow-black/10">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 ring-1 ring-teal-500/20"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-4 text-sm font-black text-white">{title}</h3>
                <p className="mt-2 text-xs font-medium leading-6 text-slate-400">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="من الاستقبال إلى الفاتورة" title="دورة عمل واضحة لفريق الاستقبال والفني والمحاسبة" description="كل قسم يرى ما يحتاجه، مع بقاء المركبة وأمر الصيانة والمخزون والفاتورة ضمن سلسلة واحدة." />
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {workflow.map(([number, title, description]) => (
              <div key={number} className="relative rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <span className="font-numeric text-3xl font-black text-teal-500/30">{number}</span>
                <h3 className="mt-3 text-sm font-black text-white">{title}</h3>
                <p className="mt-2 text-xs font-medium leading-6 text-slate-400">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="operations" className="relative px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 sm:p-8">
            <Truck className="h-7 w-7 text-teal-400" />
            <h2 className="mt-4 text-xl font-black text-white">المخزون والمشتريات مرتبطان بالصيانة</h2>
            <p className="mt-3 text-sm font-medium leading-7 text-slate-400">استلام البضاعة يرفع المخزون، واستخدام القطعة في أمر الصيانة يسجل حركتها، والمرتجعات والتوالف تبقى ضمن سجل يمكن مراجعته.</p>
            <div className="mt-5 space-y-2 text-xs font-bold text-slate-300">
              <CheckLine>مستودعات وكميات وحركات صنف</CheckLine>
              <CheckLine>فواتير شراء وموردون ودفعات</CheckLine>
              <CheckLine>تنبيه حد إعادة الطلب وجرد المخزون</CheckLine>
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 sm:p-8">
            <ShieldCheck className="h-7 w-7 text-emerald-400" />
            <h2 className="mt-4 text-xl font-black text-white">صلاحيات ومحاسبة بدون خلط الأدوار</h2>
            <p className="mt-3 text-sm font-medium leading-7 text-slate-400">فريق الاستقبال ينفذ عمله، الفني يتابع أوامر الصيانة، المخزن يدير القطع، والمالية تتحكم بالحركات النقدية حسب الصلاحية.</p>
            <div className="mt-5 space-y-2 text-xs font-bold text-slate-300">
              <CheckLine>درج نقدي ومحافظ وحسابات بنكية</CheckLine>
              <CheckLine>فواتير ودفعات وذمم وأقساط</CheckLine>
              <CheckLine>سجل عمليات وتقارير قابلة للمراجعة</CheckLine>
            </div>
          </article>
        </div>
      </section>

      <section id="faq" className="relative border-t border-slate-800 bg-slate-900/40 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <SectionHeading eyebrow="أسئلة سريعة" title="ابدأ بدون تعقيد" description="النظام يعمل من المتصفح ومصمم ليتدرج مع مركز الصيانة من العمليات اليومية إلى التقارير والمحاسبة." />
          <div className="mt-9 space-y-3">
            <Faq question="هل أستطيع حفظ سجل صيانة مستقل لكل مركبة؟" answer="نعم. كل مركبة مرتبطة بعميلها ولها بيانات اللوحة وVIN والعداد وسجل أوامر الصيانة السابق." />
            <Faq question="هل المخزون يتحدث عند استخدام قطع الغيار؟" answer="نعم، العمليات المخزنية مرتبطة بأوامر الصيانة والمبيعات والمشتريات مع سجل حركة للصنف والمستودع." />
            <Faq question="هل يمكن توزيع العمل بين موظفين بصلاحيات مختلفة؟" answer="نعم. النظام يعتمد أدواراً وصلاحيات لفريق الإدارة والاستقبال والفنيين والمخزن والمالية." />
          </div>
          <div className="mt-10 rounded-3xl border border-teal-500/20 bg-teal-500/10 p-6 text-center sm:p-8">
            <UsersRound className="mx-auto h-8 w-8 text-teal-400" />
            <h2 className="mt-3 text-xl font-black text-white">جاهز لتنظيم مركز الصيانة؟</h2>
            <p className="mt-2 text-sm font-medium text-slate-400">أنشئ حسابك وابدأ بإضافة أول عميل ومركبة.</p>
            <Button asChild className="mt-5 h-11 rounded-xl bg-teal-400 px-7 text-xs font-black text-slate-950 hover:bg-teal-300">
              <Link href="/register">ابدأ الآن <ArrowLeft className="mr-1.5 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 px-4 py-7 text-center text-[11px] font-medium text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row">
          <span>مسار — إدارة مراكز صيانة المركبات</span>
          <div className="flex items-center gap-4"><Link href="/privacy" className="hover:text-teal-400">الخصوصية</Link><Link href="/terms" className="hover:text-teal-400">الشروط</Link><Link href="/support" className="hover:text-teal-400">الدعم</Link></div>
        </div>
      </footer>
    </main>
  );
}

function PreviewMetric({ icon: Icon, label, value }: { icon: typeof Wrench; label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/75 p-4"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-slate-400">{label}</span><Icon className="h-4 w-4 text-teal-400" /></div><span className="font-numeric mt-3 block text-2xl font-black text-white">{value}</span></div>;
}

function PreviewRow({ title, subtitle, badge }: { title: string; subtitle: string; badge: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-xs font-black text-white">{title}</div><div className="mt-1 truncate text-[10px] font-medium text-slate-500">{subtitle}</div></div><span className="shrink-0 rounded-lg bg-teal-500/10 px-2 py-1 text-[9px] font-black text-teal-300">{badge}</span></div></div>;
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mx-auto max-w-3xl text-center"><p className="text-[11px] font-black uppercase tracking-wider text-teal-400">{eyebrow}</p><h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">{title}</h2><p className="mt-3 text-sm font-medium leading-7 text-slate-400">{description}</p></div>;
}

function CheckLine({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /><span>{children}</span></div>;
}

function Faq({ question, answer }: { question: string; answer: string }) {
  return <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 text-right"><h3 className="text-sm font-black text-white">{question}</h3><p className="mt-2 text-xs font-medium leading-6 text-slate-400">{answer}</p></article>;
}
