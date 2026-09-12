from pathlib import Path

path = Path("app/service-orders/[id]/page.tsx")
text = path.read_text()
old = '''          <div className="border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 font-black text-slate-950"><PackagePlus className="h-4 w-4 text-amber-700" />قطع الغيار</h2></div>'''
new = '''          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 font-black text-slate-950"><PackagePlus className="h-4 w-4 text-amber-700" />قطع الغيار</h2>
            {["DELIVERED", "CLOSED"].includes(order.status) ? (
              <Button asChild size="sm" variant="outline" className="font-black">
                <Link href={`/service-orders/${order.id}/corrections`}><RotateCcw className="ml-1.5 h-4 w-4" />تصحيحات بعد التسليم</Link>
              </Button>
            ) : null}
          </div>'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"parts header anchor mismatch: {count}")
path.write_text(text.replace(old, new, 1))
