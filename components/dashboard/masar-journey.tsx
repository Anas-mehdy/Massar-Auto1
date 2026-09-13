import {
  ClipboardCheck,
  PackageCheck,
  PackageOpen,
  SearchCheck,
  ShieldCheck,
  Wrench,
} from "lucide-react";

const stages = [
  { label: "استقبال المركبة", helper: "تسجيل الحالة والعداد", icon: PackageOpen },
  { label: "الفحص والتشخيص", helper: "تحديد العطل", icon: SearchCheck },
  { label: "موافقة العميل", helper: "اعتماد عرض السعر", icon: ClipboardCheck },
  { label: "تنفيذ الصيانة", helper: "قطع الغيار والأجور", icon: Wrench },
  { label: "اختبار الجودة", helper: "فحص نهائي", icon: ShieldCheck },
  { label: "تسليم المركبة", helper: "إغلاق أمر الصيانة", icon: PackageCheck },
];

export function MasarJourney() {
  return (
    <div
      className="masar-journey"
      role="img"
      aria-label="مخطط توضيحي متحرك لرحلة المركبة من الاستقبال حتى التسليم"
    >
      <div className="masar-path-track" aria-hidden="true">
        <span className="masar-path-beam" />
      </div>

      <div className="masar-stages">
        {stages.map((stage, index) => {
          const Icon = stage.icon;

          return (
            <div className="masar-stage" key={stage.label}>
              <div className="masar-stage-icon" aria-hidden="true">
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="masar-stage-number">{index + 1}</span>
              </div>
              <div className="min-w-0 sm:text-center">
                <p className="text-xs font-black text-slate-800 sm:text-[13px]">
                  {stage.label}
                </p>
                <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                  {stage.helper}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
