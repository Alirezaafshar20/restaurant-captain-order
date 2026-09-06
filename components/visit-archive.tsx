'use client';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Receipt } from 'lucide-react';
import { type Visit, total, paid, statusLabels } from '@/lib/domain';
import { money, label } from '@/lib/menu';
export function VisitArchive({
  visit,
  onClose,
}: {
  visit: Visit | undefined;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!visit}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="wide-dialog archive-dialog">
        {visit && (
          <>
            <DialogTitle>سابقهٔ حساب میز {label(visit.table)}</DialogTitle>
            <DialogDescription>
              {new Date(visit.createdAt).toLocaleDateString('fa-IR')} · شناسهٔ
              میزبانی {visit.id.slice(0, 8)} · صورت‌حساب داخلی محیط ارائه
            </DialogDescription>
            <div className="archive-lines">
              {visit.items.map((i) => (
                <div className="order-line" key={i.id}>
                  <div className="row-between">
                    <h4>
                      {label(i.quantity)} × {i.name}
                    </h4>
                    <span>
                      {i.status === 'cancelled'
                        ? 'لغو شده'
                        : money(i.quantity * i.price) + ' تومان'}
                    </span>
                  </div>
                  <p className="fineprint">
                    {statusLabels[i.status]} · {i.note || 'بدون توضیح اضافه'}
                  </p>
                </div>
              ))}
            </div>
            <div className="bill-summary">
              <div>
                <span>مبلغ سفارش</span>
                <b>{money(total(visit))} تومان</b>
              </div>
              <div>
                <span>دریافت ثبت‌شده</span>
                <b>{money(paid(visit))} تومان</b>
              </div>
              <p>
                مالیات و حق سرویس در این ارائه اعمال نشده‌اند. این سند رسید بانکی
                نیست.
              </p>
            </div>
            <div className="archive-payments">
              {visit.payments.map((p) => (
                <p className="payment-receipt" key={p.id}>
                  {p.method === 'card' ? 'کارت' : 'نقدی'} · {money(p.amount)}{' '}
                  تومان · پیگیری {p.reference} ·{' '}
                  {new Date(p.at).toLocaleTimeString('fa-IR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              ))}
            </div>
            <details>
              <summary>
                رویدادهای این میزبانی ({label(visit.events.length)})
              </summary>
              <div className="event-list">
                {visit.events.map((e, i) => (
                  <div key={i}>
                    <time>
                      {new Date(e.at).toLocaleTimeString('fa-IR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    <p>{e.text}</p>
                  </div>
                ))}
              </div>
            </details>
            <Button
              className="no-print"
              variant="outline"
              onClick={() => window.print()}
            >
              چاپ صورت‌حساب <Receipt size={16} />
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
