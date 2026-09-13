export type HelpCategory =
  | "GETTING_STARTED"
  | "REPAIRS"
  | "SALES"
  | "INVENTORY"
  | "WALLETS"
  | "DEBTS"
  | "ELECTRONIC_SERVICES"
  | "ACCOUNT";

export type HelpArticle = {
  slug: string;
  category: HelpCategory;
  title: string;
  summary: string;
  keywords: string[];
  contextRoutes: string[];
  estimatedMinutes: number;
  steps: string[];
  tips?: string[];
  cta?: { href: string; label: string };
};

export const HELP_CATEGORY_LABELS: Record<HelpCategory, string> = {
  GETTING_STARTED: "البدء مع مسار",
  REPAIRS: "صيانة المركبات",
  SALES: "المبيعات",
  INVENTORY: "المخزون وقطع الغيار",
  WALLETS: "المحافظ والتحويلات",
  DEBTS: "الديون والتحصيلات",
  ELECTRONIC_SERVICES: "الخدمات الإلكترونية",
  ACCOUNT: "الحساب والاشتراك",
};

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "start-first-real-operation",
    category: "GETTING_STARTED",
    title: "كيف تبدأ بأول عملية حقيقية بدون إعداد طويل؟",
    summary: "ابدأ من القسم الذي يمثل شغلك اليومي وسجل عملية حقيقية واحدة؛ الإعدادات المتقدمة يمكن تأجيلها.",
    keywords: ["بداية", "اول عملية", "onboarding", "تجربة", "سريع"],
    contextRoutes: ["/dashboard", "/onboarding"],
    estimatedMinutes: 2,
    steps: [
      "اختر القسم الأساسي الذي تستخدمه فعلياً في مركزك.",
      "سجل أول عملية حقيقية من الاختصارات السريعة بدل ملء كل الإعدادات.",
      "ارجع لمسار في يوم عمل آخر وسجل شغلك الحقيقي حتى يكتمل هدف التفعيل.",
    ],
    tips: ["لا تسجل بيانات تجريبية أو عمليات وهمية فقط لإكمال التفعيل."],
    cta: { href: "/dashboard", label: "العودة للوحة التحكم" },
  },
  {
    slug: "repair-create-first-ticket",
    category: "REPAIRS",
    title: "تسجيل أول أمر صيانة مركبة",
    summary: "اربط العميل بمركبته وسجل سبب الدخول والعداد وحالة الاستلام، ثم أكمل الفحص والأعمال من نفس الأمر.",
    keywords: ["صيانة", "مركبة", "سيارة", "أمر صيانة", "استقبال", "عميل", "عداد"],
    contextRoutes: ["/service-orders", "/service-orders/new", "/vehicles", "/point-of-sale"],
    estimatedMinutes: 2,
    steps: [
      "افتح «أمر صيانة جديد» أو «استقبال مركبة».",
      "اختر المركبة المرتبطة بالعميل وسجل شكوى العميل أو سبب دخول المركبة.",
      "أضف قراءة العداد والوقود وحالة المركبة وموعد التسليم المتوقع عند الحاجة، ثم احفظ الأمر.",
    ],
    tips: ["سجل حالة المركبة والمفاتيح أو الأغراض المستلمة عند الاستقبال لتبقى موثقة داخل أمر الصيانة."],
    cta: { href: "/service-orders/new", label: "استقبال مركبة" },
  },
  {
    slug: "repair-customer-tracking",
    category: "REPAIRS",
    title: "كيف يتابع العميل حالة صيانة مركبته؟",
    summary: "QR الموجود على أمر الاستلام يفتح صفحة تتبع محدودة للعميل، والبحث اليدوي يتطلب رقم أمر الصيانة ورقم الجوال.",
    keywords: ["تتبع", "qr", "واتساب", "حالة المركبة", "أمر الصيانة", "العميل"],
    contextRoutes: ["/service-orders"],
    estimatedMinutes: 2,
    steps: [
      "افتح أمر الصيانة واطبع نسخة A4 أو الإيصال الحراري.",
      "يستطيع العميل مسح QR المطبوع لفتح رابط التتبع مباشرة.",
      "عند تحديث حالة أمر الصيانة تظهر المرحلة الجديدة في صفحة التتبع بدون عرض البيانات الداخلية الحساسة.",
    ],
    tips: ["البحث اليدوي برقم الأمر يتطلب أيضاً رقم جوال العميل لحماية بيانات أوامر الصيانة."],
  },
  {
    slug: "repair-status-workflow",
    category: "REPAIRS",
    title: "متى أغيّر حالة أمر الصيانة؟",
    summary: "استخدم الحالات لتعكس المرحلة الحقيقية للمركبة من الاستلام والفحص والموافقة حتى التنفيذ والتسليم.",
    keywords: ["حالة", "فحص", "تشخيص", "موافقة", "قيد الصيانة", "قطع", "جاهزة", "تسليم"],
    contextRoutes: ["/service-orders"],
    estimatedMinutes: 3,
    steps: [
      "يبدأ الأمر عند استلام المركبة ثم ينتقل للفحص والتشخيص.",
      "إذا كانت الأعمال تحتاج اعتماداً، استخدم مرحلة انتظار موافقة العميل قبل بدء التنفيذ.",
      "أثناء التنفيذ استخدم «قيد الصيانة» أو «بانتظار قطع الغيار»، ثم «جاهزة للتسليم» عند اكتمال العمل.",
      "سجل «تم التسليم» فقط بعد تسليم المركبة فعلياً، ثم أغلق الأمر عندما تكتمل الدورة.",
    ],
  },
  {
    slug: "repair-print-receipt-sticker",
    category: "REPAIRS",
    title: "طباعة أمر الصيانة A4 أو حراري",
    summary: "يمكن طباعة أمر استلام مفصل أو نسخة حرارية مختصرة، وكلاهما يتضمن QR لتتبع حالة الصيانة.",
    keywords: ["طباعة", "a4", "حراري", "qr", "ايصال", "أمر صيانة"],
    contextRoutes: ["/service-orders"],
    estimatedMinutes: 2,
    steps: [
      "افتح أمر الصيانة المطلوب.",
      "اختر الطباعة العادية A4 للتفاصيل الكاملة أو الطباعة الحرارية للإيصال المختصر.",
      "تأكد من إعداد مقاس الورق الصحيح في نافذة الطباعة؛ QR المطبوع يفتح صفحة تتبع العميل.",
    ],
  },
  {
    slug: "sales-first-sale",
    category: "SALES",
    title: "تنفيذ أول عملية بيع بسرعة",
    summary: "يمكن البيع من المخزون أو كتابة بند يدوي، ولا تحتاج إنشاء عميل لعملية البيع النقدية السريعة.",
    keywords: ["بيع", "pos", "كاش", "ايصال", "قطعة"],
    contextRoutes: ["/sales", "/sales/new", "/point-of-sale"],
    estimatedMinutes: 2,
    steps: [
      "افتح نقطة البيع أو عملية بيع جديدة.",
      "اختر قطعة من المخزون أو أدخل بنداً يدوياً مع الكمية والسعر.",
      "أكمل البيع ثم افتح الإيصال للتأكد من التفاصيل.",
    ],
    tips: ["إذا كان البند مرتبطاً بصنف مخزون، يمكن لمسار تسجيل أثر البيع على الكمية تلقائياً."],
    cta: { href: "/point-of-sale?tab=sale", label: "فتح نقطة البيع" },
  },
  {
    slug: "inventory-opening-balance",
    category: "INVENTORY",
    title: "إضافة أول قطعة غيار ورصيد افتتاحي صحيح",
    summary: "أدخل الكمية الموجودة فعلياً الآن؛ مسار يسجلها كحركة مخزون افتتاحية بدل رقم بلا تاريخ.",
    keywords: ["مخزون", "رصيد افتتاحي", "كمية", "stock in", "قطعة غيار", "صنف"],
    contextRoutes: ["/inventory", "/inventory/new"],
    estimatedMinutes: 2,
    steps: [
      "أضف اسم قطعة الغيار والكمية الفعلية الموجودة عندك.",
      "أدخل تكلفة الشراء وسعر البيع وحد إعادة الطلب إذا كانت متوفرة.",
      "بعد الحفظ افتح القطعة وشاهد حركة الرصيد الافتتاحي في سجل الحركات.",
    ],
    tips: ["لا تضع كمية تجريبية؛ الرصيد الافتتاحي يدخل في تقارير وحركات المخزون."],
    cta: { href: "/inventory/new", label: "إضافة قطعة غيار" },
  },
  {
    slug: "inventory-reorder-and-history",
    category: "INVENTORY",
    title: "كيف أستخدم حد إعادة الطلب وسجل الحركات؟",
    summary: "حدد الحد الأدنى المناسب لكل قطعة وتابع التوريد والاستهلاك والتوالف والتسويات من سجل المخزون.",
    keywords: ["مخزون", "حد إعادة الطلب", "نقص", "توريد", "تالف", "جرد", "قطعة غيار"],
    contextRoutes: ["/inventory", "/suppliers"],
    estimatedMinutes: 3,
    steps: [
      "افتح قطعة الغيار وحدد «حد إعادة الطلب» حسب معدل استهلاكها.",
      "سجل التوريد الحقيقي عند دخول كمية جديدة، واربط المورد عند توفره.",
      "راجع سجل الحركات لمعرفة الرصيد بعد كل حركة، وسجل التالف أو تسوية الجرد عند الحاجة.",
    ],
    tips: ["لا تستخدم تسوية الجرد بدل حركة التوريد العادية؛ التسوية مخصصة لتصحيح الفرق بين الرصيد المسجل والكمية الفعلية."],
    cta: { href: "/inventory", label: "فتح المخزون" },
  },
  {
    slug: "wallet-balance-direction",
    category: "WALLETS",
    title: "ليش زاد أو نقص رصيد المحفظة بعد العملية؟",
    summary: "اتجاه الرصيد يعتمد على نوع الحركة: شحن وسحب من العميل يزيدان الرصيد، والإيداع للعميل ينقصه.",
    keywords: ["محفظة", "رصيد", "تحويل", "ايداع", "سحب", "شحن"],
    contextRoutes: ["/transfers"],
    estimatedMinutes: 2,
    steps: [
      "حدد المحفظة التي تمت عليها الحركة.",
      "اختر نوع العملية الحقيقي، وليس النوع الذي يعطي الرصيد الذي تتوقعه.",
      "راجع «الرصيد بعد العملية» ثم احفظ الحركة.",
    ],
    tips: ["إيداع مبلغ للعميل يعني خروج قيمة من رصيد محفظتك، لذلك ينقص الرصيد."],
    cta: { href: "/transfers", label: "فتح المحافظ والتحويلات" },
  },
  {
    slug: "wallet-insufficient-balance",
    category: "WALLETS",
    title: "ماذا أفعل إذا ظهر أن رصيد المحفظة غير كافٍ؟",
    summary: "لا يمكن تنفيذ حركة خارجة أكبر من الرصيد الحقيقي المسجل للمحفظة.",
    keywords: ["رصيد غير كافي", "محفظة", "رفض", "ايداع"],
    contextRoutes: ["/transfers"],
    estimatedMinutes: 2,
    steps: [
      "راجع الرصيد الحالي للمحفظة في لوحة المحافظ.",
      "إذا استلمت رصيداً جديداً من مزود المحفظة، سجل حركة شحن حقيقية أولاً.",
      "أعد تنفيذ العملية بالمبلغ الفعلي بعد تحديث الرصيد.",
    ],
  },
  {
    slug: "debts-record-and-collect",
    category: "DEBTS",
    title: "تسجيل دين ثم تحصيل دفعة بشكل صحيح",
    summary: "سجل الدين عند نشوء المبلغ المستحق، وسجل التحصيل فقط عندما تستلم دفعة حقيقية من العميل.",
    keywords: ["دين", "تحصيل", "دفعة", "رصيد العميل", "ذمم"],
    contextRoutes: ["/debts", "/installments"],
    estimatedMinutes: 3,
    steps: [
      "اختر العميل وسجل مبلغ الدين الحقيقي.",
      "افتح دفتر العميل وشاهد الرصيد المستحق.",
      "عند استلام دفعة فعلية، سجل التحصيل ليُخفض الرصيد تلقائياً.",
    ],
    tips: ["لا تسجل تحصيلاً وهمياً للتجربة؛ الحركة تؤثر على رصيد العميل والتقارير."],
    cta: { href: "/debts", label: "فتح دفتر الديون" },
  },
  {
    slug: "electronic-provider-first-service",
    category: "ELECTRONIC_SERVICES",
    title: "إعداد مزود خدمة وتنفيذ أول خدمة",
    summary: "أدخل رصيد المزود الحقيقي، ثم نفذ خدمة فعلية حتى يسجل مسار تكلفة المزود والربح وأثر الرصيد.",
    keywords: ["خدمات الكترونية", "مزود", "رصيد المزود", "شحن", "ربح"],
    contextRoutes: ["/electronic-services"],
    estimatedMinutes: 3,
    steps: [
      "أنشئ المزود وأدخل الرصيد الفعلي الموجود في حسابه.",
      "ابدأ خدمة جديدة وحدد تكلفة التنفيذ والمبلغ على العميل.",
      "بعد الحفظ راجع الخصم من رصيد المزود والربح المسجل للعملية.",
    ],
    tips: ["إنشاء المزود وحده إعداد فقط؛ أول خدمة فعلية هي التي تختبر دورة العمل كاملة."],
    cta: { href: "/electronic-services", label: "فتح الخدمات الإلكترونية" },
  },
  {
    slug: "account-trial-and-data",
    category: "ACCOUNT",
    title: "ماذا يحدث عند انتهاء الفترة التجريبية؟",
    summary: "بيانات المركز تبقى محفوظة، بينما صلاحية إنشاء عمليات جديدة تعتمد على حالة الاشتراك.",
    keywords: ["اشتراك", "تجربة", "انتهاء", "بيانات", "خطة"],
    contextRoutes: ["/subscription", "/dashboard"],
    estimatedMinutes: 2,
    steps: [
      "افتح صفحة الاشتراك لمعرفة الوقت المتبقي وحالة الخطة.",
      "اختر مدة الاشتراك المناسبة عندما تصبح جاهزاً للمتابعة.",
      "إذا انتهت الفترة، تظل سجلات مركزك محفوظة ويمكنك استعادتها عند تفعيل الاشتراك.",
    ],
    cta: { href: "/subscription", label: "فتح الاشتراك" },
  },
  {
    slug: "account-password-reset",
    category: "ACCOUNT",
    title: "نسيت كلمة المرور أو لا تستطيع تسجيل الدخول",
    summary: "استخدم استعادة كلمة المرور من شاشة الدخول قبل التواصل مع الدعم.",
    keywords: ["كلمة المرور", "دخول", "نسيت", "بريد", "reset"],
    contextRoutes: ["/account/security", "/support"],
    estimatedMinutes: 2,
    steps: [
      "من شاشة تسجيل الدخول اختر «نسيت كلمة المرور».",
      "أدخل البريد المسجل وافتح رسالة الاستعادة.",
      "استخدم الرابط خلال مدة صلاحيته وحدد كلمة مرور جديدة.",
    ],
    tips: ["إذا لم تصل الرسالة، راجع البريد غير المرغوب فيه وتأكد أنك تستخدم البريد المسجل فعلاً."],
  },
];

function normalizeArabic(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function helpContextKeyForPath(pathname: string): HelpCategory {
  if (pathname.startsWith("/service-orders") || pathname.startsWith("/vehicles") || pathname.startsWith("/repair-orders")) return "REPAIRS";
  if (pathname.startsWith("/sales") || pathname.startsWith("/point-of-sale")) return "SALES";
  if (pathname.startsWith("/inventory") || pathname.startsWith("/suppliers") || pathname.startsWith("/warehouses")) return "INVENTORY";
  if (pathname.startsWith("/transfers") || pathname.startsWith("/cash-drawer")) return "WALLETS";
  if (pathname.startsWith("/debts") || pathname.startsWith("/installments")) return "DEBTS";
  if (pathname.startsWith("/electronic-services")) return "ELECTRONIC_SERVICES";
  if (pathname.startsWith("/subscription") || pathname.startsWith("/account") || pathname.startsWith("/settings")) return "ACCOUNT";
  return "GETTING_STARTED";
}

export function getHelpArticle(slug: string) {
  return HELP_ARTICLES.find((article) => article.slug === slug) ?? null;
}

export function getContextualHelpArticles(pathname: string, limit = 3) {
  const category = helpContextKeyForPath(pathname);
  return HELP_ARTICLES
    .map((article, index) => {
      const routeScore = article.contextRoutes.reduce((score, route) => {
        if (pathname === route) return Math.max(score, 30);
        if (pathname.startsWith(`${route}/`) || pathname.startsWith(`${route}?`) || pathname.startsWith(route)) return Math.max(score, 20);
        return score;
      }, 0);
      const categoryScore = article.category === category ? 10 : 0;
      return { article, score: routeScore + categoryScore, index };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, limit))
    .map((row) => row.article);
}

export function searchHelpArticles(query: string, category?: HelpCategory | null) {
  const normalizedQuery = normalizeArabic(query);
  const tokens = normalizedQuery.split(" ").filter((token) => token.length >= 2);
  return HELP_ARTICLES
    .filter((article) => !category || article.category === category)
    .map((article, index) => {
      if (!tokens.length) return { article, score: 0, index };
      const title = normalizeArabic(article.title);
      const summary = normalizeArabic(article.summary);
      const keywords = normalizeArabic(article.keywords.join(" "));
      const steps = normalizeArabic(article.steps.join(" "));
      const score = tokens.reduce((sum, token) => {
        if (title.includes(token)) sum += 8;
        if (keywords.includes(token)) sum += 5;
        if (summary.includes(token)) sum += 3;
        if (steps.includes(token)) sum += 1;
        return sum;
      }, 0);
      return { article, score, index };
    })
    .filter((row) => !tokens.length || row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.article);
}
