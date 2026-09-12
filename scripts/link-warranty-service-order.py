from pathlib import Path

path = Path("app/service-orders/[id]/page.tsx")
text = path.read_text()

old_import = 'import { ArrowRight, ClipboardCheck, FileText, Gauge, LockKeyhole, PackagePlus, Plus, RotateCcw, Truck, UserRound, Wrench } from "lucide-react";'
new_import = 'import { ArrowRight, ClipboardCheck, FileText, Gauge, LockKeyhole, PackagePlus, Plus, RotateCcw, ShieldCheck, Truck, UserRound, Wrench } from "lucide-react";'
if text.count(old_import) != 1:
    raise SystemExit(f"import anchor mismatch: {text.count(old_import)}")
text = text.replace(old_import, new_import, 1)

old = '''            {["DELIVERED", "CLOSED"].includes(order.status) ? (
              <Button asChild size="sm" variant="outline" className="font-black">
                <Link href={`/service-orders/${order.id}/corrections`}><RotateCcw className="ml-1.5 h-4 w-4" />تصحيحات بعد التسليم</Link>
              </Button>
            ) : null}'''
new = '''            {["DELIVERED", "CLOSED"].includes(order.status) ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline" className="font-black">
                  <Link href={`/service-orders/${order.id}/warranty`}><ShieldCheck className="ml-1.5 h-4 w-4" />ضمان / عودة للصيانة</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="font-black">
                  <Link href={`/service-orders/${order.id}/corrections`}><RotateCcw className="ml-1.5 h-4 w-4" />تصحيحات بعد التسليم</Link>
                </Button>
              </div>
            ) : null}'''
if text.count(old) != 1:
    raise SystemExit(f"parts actions anchor mismatch: {text.count(old)}")
text = text.replace(old, new, 1)
path.write_text(text)
