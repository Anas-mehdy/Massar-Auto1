export const TUTORIAL_VIDEO_CATEGORIES = [
  {
    key: "repair",
    title: "أوامر صيانة المركبات",
    description: "استقبال المركبة، الفحص والتشخيص، موافقة العميل، التنفيذ والتسليم والتتبع.",
    icon: "WRENCH",
  },
  {
    key: "sales-pos",
    title: "المبيعات و POS",
    description: "عمليات البيع السريعة، نقطة البيع، الإيصالات وربط المبيعات بالمخزون.",
    icon: "SHOPPING_CART",
  },
  {
    key: "software-services",
    title: "خدمات السوفتوير",
    description: "تسجيل خدمات السوفتوير وربطها بالفواتير والعملاء.",
    icon: "CODE",
  },
  {
    key: "electronic-services",
    title: "الخدمات الإلكترونية",
    description: "إدارة المزودين، تنفيذ الخدمات الإلكترونية ومتابعة الرصيد والربح.",
    icon: "ZAP",
  },
  {
    key: "inventory-compatibility",
    title: "المخزون وقطع الغيار",
    description: "إدارة قطع الغيار والكميات وحركات المخزون وحد إعادة الطلب والتوريد والتوالف.",
    icon: "BOXES",
  },
  {
    key: "installments-payments",
    title: "الأقساط والدفعات",
    description: "إنشاء خطط الأقساط، تسجيل الدفعات ومشاركة رابط المتابعة مع العميل.",
    icon: "CALENDAR",
  },
  {
    key: "debts",
    title: "دفتر الديون",
    description: "تسجيل ديون العملاء والتحصيلات ومتابعة الرصيد المستحق.",
    icon: "BOOK",
  },
  {
    key: "cash-drawer",
    title: "الدرج النقدي",
    description: "متابعة الكاش وحركات الدخول والخروج وتسوية الرصيد اليومي.",
    icon: "BANKNOTE",
  },
  {
    key: "wallets-transfers",
    title: "المحافظ والتحويلات",
    description: "إدارة المحافظ الإلكترونية والتحويلات وتأثير كل حركة على الرصيد.",
    icon: "TRANSFER",
  },
  {
    key: "reports-profits",
    title: "التقارير والأرباح",
    description: "قراءة التقارير، الإيرادات، المصروفات وصافي الأرباح.",
    icon: "CHART",
  },
] as const;

export type TutorialVideoCategoryKey = (typeof TUTORIAL_VIDEO_CATEGORIES)[number]["key"];
export type TutorialVideoIcon = (typeof TUTORIAL_VIDEO_CATEGORIES)[number]["icon"];

const CATEGORY_KEYS = new Set<string>(TUTORIAL_VIDEO_CATEGORIES.map((category) => category.key));

export function isTutorialVideoCategoryKey(value: string): value is TutorialVideoCategoryKey {
  return CATEGORY_KEYS.has(value);
}

export function getTutorialVideoCategory(value: string | null | undefined) {
  if (!value) return null;
  return TUTORIAL_VIDEO_CATEGORIES.find((category) => category.key === value) ?? null;
}
