import { onboardingDestination } from "@/lib/onboarding/navigation";
import type { OnboardingJob } from "@/lib/onboarding/jobs";

export type SmartEmptyStateCopy = {
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
};

const COPY_BY_JOB: Record<OnboardingJob, Omit<SmartEmptyStateCopy, "actionHref">> = {
  REPAIRS: {
    title: "استقبل أول مركبة فعلية",
    description: "اختر العميل ومركبته وسجّل سبب الدخول أو الشكوى. بعدها تتابع الفحص والتشخيص والموافقة وقطع الغيار والأجور حتى التسليم من أمر الصيانة نفسه.",
    actionLabel: "استقبل أول مركبة",
  },
  SALES: {
    title: "سجّل أول عملية بيع حقيقية",
    description: "ابدأ ببند واحد وسعره فقط. لا تحتاج تجهيز عميل أو محفظة أو مخزون كامل قبل ما تشوف أول قيمة من نقطة البيع.",
    actionLabel: "نفّذ أول بيع",
  },
  INVENTORY: {
    title: "أدخل أول قطعة موجودة عندك فعلياً",
    description: "اكتب اسم قطعة الغيار والكمية الحالية. مسار يسجل الرصيد الافتتاحي كحركة مخزون حقيقية ويبدأ تاريخ القطعة من هناك.",
    actionLabel: "أضف أول قطعة",
  },
  WALLETS: {
    title: "ابدأ بمحفظة ثم أول حركة حقيقية",
    description: "أنشئ المحفظة برصيدها الحالي، وبعدها سجّل أول إيداع أو سحب فعلي حتى تشاهد أثر الحركة على الرصيد.",
    actionLabel: "ابدأ إعداد المحافظ",
  },
  DEBTS: {
    title: "سجّل أول دين حقيقي",
    description: "اختر عميلاً ومبلغاً مستحقاً فعلياً. عند أول تحصيل لاحقاً سيخفض مسار الرصيد ويسجل مكان وصول المال.",
    actionLabel: "سجّل أول دين",
  },
};

export function smartEmptyStateCopy(job: OnboardingJob): SmartEmptyStateCopy {
  return {
    ...COPY_BY_JOB[job],
    actionHref: onboardingDestination(job),
  };
}
