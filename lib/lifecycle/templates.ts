import { onboardingDestination } from "@/lib/onboarding/navigation";
import type { OnboardingJob } from "@/lib/onboarding/jobs";
import type { LifecycleDecision } from "@/lib/lifecycle/rules";

const JOB_LABELS: Record<OnboardingJob, string> = {
  REPAIRS: "الصيانة",
  SALES: "المبيعات",
  INVENTORY: "المخزون",
  WALLETS: "المحافظ والتحويلات",
  DEBTS: "الديون والتحصيلات",
};

export type LifecycleEmailContent = {
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaPath: string;
  footnote: string;
};

function jobLabel(job: OnboardingJob | null) {
  return job ? JOB_LABELS[job] : "شغلك الأساسي";
}

function jobPath(job: OnboardingJob | null) {
  return job ? onboardingDestination(job) : "/dashboard";
}

export function buildLifecycleEmailContent(decision: LifecycleDecision): LifecycleEmailContent {
  if (decision.kind === "TRIAL_ENDING") {
    const hours = Math.max(1, Math.ceil(decision.remainingTrialHours));
    const dayText = hours > 24 ? "أقل من يومين" : "أقل من يوم";
    return {
      subject: "تجربتك في مسار تقترب من نهايتها",
      heading: "قبل ما تنتهي التجربة",
      body: `باقي ${dayText} على تجربتك. افتح مسار وراجع شغلك الحقيقي الذي سجلته، وإذا صار النظام مناسباً لطريقتك في العمل تقدر تشوف خيارات الاشتراك من نفس الحساب.`,
      ctaLabel: "مراجعة الاشتراك",
      ctaPath: "/subscription",
      footnote: "ما رح نطلب منك تسجيل عمليات تجريبية فقط لإكمال أي خطوة.",
    };
  }

  if (decision.kind === "ONBOARDING_INCOMPLETE") {
    return {
      subject: "كمل إعداد مسار من المكان اللي وقفت عنده",
      heading: "بقيت خطوة صغيرة قبل أول استخدام",
      body: "اختيار طبيعة شغلك يخلي مسار يفتح لك أقصر طريق لأول عملية بدل ما يتركك وسط كل أقسام النظام.",
      ctaLabel: "إكمال الإعداد",
      ctaPath: "/onboarding",
      footnote: "الاختيارات لا تقفل أي ميزة؛ هي فقط ترتب أول تجربة لك.",
    };
  }

  if (decision.kind === "NO_FIRST_VALUE") {
    const job = decision.nextJob ?? decision.primaryJob;
    return {
      subject: `جرّب أول عملية حقيقية في ${jobLabel(job)}`,
      heading: "لسه ما سجلنا أول قيمة حقيقية",
      body: `إعداد الحساب خلص. الخطوة المفيدة الآن هي تسجيل أول عملية فعلية في ${jobLabel(job)}؛ الفورم الأول مختصر ومصمم حتى ما تضطر تجهز كل تفاصيل النظام من البداية.`,
      ctaLabel: `ابدأ من ${jobLabel(job)}`,
      ctaPath: jobPath(job),
      footnote: "استخدم بيانات شغل حقيقية فقط، وليس بيانات تجريبية تلوث تقاريرك.",
    };
  }

  if (decision.kind === "HABIT_ONE_DAY") {
    return {
      subject: "استخدام واحد إضافي في يوم عمل حقيقي يكمل الصورة",
      heading: "أنت وصلت لعدد العمليات المطلوب",
      body: "صار عندك استخدام فعلي جيد داخل مسار. الشيء الوحيد الذي نريدك تجربه الآن هو استخدامه مرة ثانية في يوم عمل مختلف، وقت يجيك شغل حقيقي بشكل طبيعي.",
      ctaLabel: "فتح لوحة التحكم",
      ctaPath: "/dashboard",
      footnote: "لا تسجل عملية وهمية حتى تكمل المؤشر؛ انتظر أول شغل حقيقي عندك.",
    };
  }

  const job = decision.nextJob ?? decision.primaryJob;
  return {
    subject: "ارجع لأول عملية حقيقية في مسار",
    heading: "أول خطوة تمت — خلينا نخليها عادة",
    body: `أنت جربت مسار فعلياً، لكن الاستخدام توقف بعدها. لما يصير عندك شغل حقيقي جديد، سجله مباشرة من ${jobLabel(job)} حتى تشوف كيف يصير السجل مفيد مع تكرار الاستخدام.`,
    ctaLabel: `فتح ${jobLabel(job)}`,
    ctaPath: jobPath(job),
    footnote: "الهدف مو كثرة الإدخالات؛ الهدف إن مسار يدخل ضمن شغلك اليومي الحقيقي.",
  };
}

export const lifecycleTemplates = { buildLifecycleEmailContent };
