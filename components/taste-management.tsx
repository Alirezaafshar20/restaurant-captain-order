'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { menu } from '@/lib/menu';
import { flavorLabels, type Knowledge, type Flavor } from '@/lib/taste';
import type { TasteModel } from './taste-experience';
export function TasteManagement({ model: t }: { model: TasteModel }) {
  const [editing, setEditing] = useState<Knowledge | null>(null);
  const s = t.snapshot;
  return (
    <section className="taste-management">
      <div className="section-heading">
        <div>
          <h2>دانش منو و منطق پیشنهاد</h2>
          <p>قواعد فعلی قابل بازبینی‌اند؛ امتیازها احتمال رضایت نیستند.</p>
        </div>
        <Button variant="outline" onClick={() => void t.refresh()}>
          تازه‌کردن اطلاعات
        </Button>
      </div>
      <div className="taste-admin-summary">
        <article>
          <b>
            {s.knowledge.filter((k) => k.status === 'verified').length} از{' '}
            {menu.length}
          </b>
          <span>شناسنامهٔ تأییدشده</span>
        </article>
        <article>
          <b>{s.feedback.filter((f) => f.rating !== 'service').length}</b>
          <span>بازخورد شخصی طعم در فضای ارائه</span>
        </article>
        <article>
          <b>اول تناسب، سپس اولویت تجاری</b>
          <span>اولویت رستوران فقط میان امتیازهای مساوی اثر می‌گذارد.</span>
        </article>
      </div>
      <p className="taste-hint">
        اطلاعات دقیق هنوز منتظر سرآشپز است. شناسنامهٔ پیش‌نویس در امتیاز طعم یا
        زمان پخت اثر نمی‌گذارد. اولویت تجاری بیانگر حاشیهٔ سود اندازه‌گیری‌شده نیست.
      </p>
      <div className="knowledge-grid">
        {menu.map((m) => {
          const k = s.knowledge.find((k) => k.itemId === m.id);
          return (
            <article key={m.id}>
              <div>
                <b>{m.name}</b>
                <small>
                  {k?.status === 'verified'
                    ? 'تأییدشده توسط ' + k.verifiedBy
                    : k
                      ? 'پیش‌نویس؛ منتظر تأیید'
                      : 'منتظر اطلاعات سرآشپز'}
                </small>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEditing(
                    k || {
                      itemId: m.id,
                      revision: 0,
                      status: 'draft',
                      flavors: [],
                      preparationMinutes: null,
                      businessPriority: 0,
                      pairings: [],
                      source: '',
                      verifiedBy: '',
                      verifiedAt: null,
                      notes: '',
                    },
                  )
                }
              >
                شناسنامه
              </Button>
            </article>
          );
        })}
      </div>
      <h3>چرا این پیشنهاد نمایش داده شد؟</h3>
      <p>
        ۲۰ تصمیم اخیر. «بررسی انتخاب» خرید محسوب نمی‌شود و رد پیشنهاد، نپسندیدن
        طعم را ثابت نمی‌کند.
      </p>
      {!s.decisions.length && (
        <p className="taste-hint">
          هنوز پیشنهادی ثبت نشده؛ در نمای مهمان «کمکم کن انتخاب کنم» را امتحان
          کنید.
        </p>
      )}
      {s.decisions.map((d) => (
        <details className="decision-record" key={d.id}>
          <summary>
            {new Date(d.createdAt).toLocaleString('fa-IR')} ·{' '}
            {d.context.occasion === 'cafe'
              ? 'کافه'
              : d.context.occasion === 'dining'
                ? 'غذا'
                : 'همهٔ منو'}{' '}
            · {d.selected.length} پیشنهاد
          </summary>
          <p>{d.message}</p>
          <small>سیاست {d.policy} · امتیاز داخلی برای رتبه‌بندی</small>
          {d.ranked.map((r) => (
            <div className="decision-row" key={r.itemId}>
              <b>
                {menu.find((m) => m.id === r.itemId)?.name} · تطابق خواستهٔ
                امروز: {r.explicitScore ?? 0} · امتیاز تکمیلی: {r.score}
              </b>
              <p>{r.reasons.join(' · ')}</p>
              <small>
                {d.events[r.itemId + '_shown']
                  ? 'نمایش ثبت شده'
                  : 'نمایش ثبت نشده'}
                {d.events[r.itemId + '_selected'] ? ' · بررسی انتخاب' : ''}
                {d.events[r.itemId + '_rejected'] ? ' · رد در این نوبت' : ''}
              </small>
            </div>
          ))}
          <details>
            <summary>گزینه‌های کنارگذاشته‌شده</summary>
            {d.excluded.map((e) => (
              <p key={e.itemId}>
                {menu.find((m) => m.id === e.itemId)?.name} — {e.reason}
              </p>
            ))}
          </details>
        </details>
      ))}
      {t.error && (
        <p className="taste-error" role="alert">
          {t.error}
        </p>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
      >
        <DialogContent className="taste-profile-dialog">
          <DialogTitle>
            شناسنامهٔ {menu.find((m) => m.id === editing?.itemId)?.name}
          </DialogTitle>
          <DialogDescription>
            تنها اطلاعاتی را تأیید کنید که از مسئول آشپزخانه دریافت کرده‌اید. این
            فرم تأیید ایمنی غذایی یا آلرژن نیست.
          </DialogDescription>
          {editing && (
            <>
              <fieldset>
                <legend>طعم‌های اعلام‌شده</legend>
                <div className="taste-chip-grid">
                  {Object.entries(flavorLabels).map(([f, title]) => (
                    <label className="taste-check" key={f}>
                      <Checkbox
                        checked={editing.flavors.includes(f as Flavor)}
                        onCheckedChange={(checked) =>
                          setEditing({
                            ...editing,
                            flavors: checked
                              ? [...editing.flavors, f as Flavor]
                              : editing.flavors.filter((i) => i !== f),
                          })
                        }
                      />
                      {title}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="field">
                زمان معمول آماده‌سازی، دقیقه — اگر مشخص است
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={editing.preparationMinutes ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      preparationMinutes: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                />
              </label>
              <label className="field">
                منبع اطلاعات
                <input
                  value={editing.source}
                  maxLength={300}
                  placeholder="مثلاً دستور تهیه یا توضیح سرآشپز در تاریخ…"
                  onChange={(e) =>
                    setEditing({ ...editing, source: e.target.value })
                  }
                />
              </label>
              <label className="field">
                نام تأییدکننده
                <input
                  value={editing.verifiedBy}
                  maxLength={100}
                  onChange={(e) =>
                    setEditing({ ...editing, verifiedBy: e.target.value })
                  }
                />
              </label>
              <label className="field">
                یادداشت برای تکمیل شناسنامه
                <textarea
                  value={editing.notes}
                  maxLength={1000}
                  onChange={(e) =>
                    setEditing({ ...editing, notes: e.target.value })
                  }
                />
              </label>
              <fieldset>
                <legend>وضعیت دانش غذا</legend>
                <RadioGroup
                  value={editing.status}
                  onValueChange={(v) =>
                    setEditing({ ...editing, status: v as Knowledge['status'] })
                  }
                >
                  <label className="taste-check">
                    <RadioGroupItem value="draft" />
                    پیش‌نویس؛ در پیشنهاد استفاده نشود
                  </label>
                  <label className="taste-check">
                    <RadioGroupItem value="verified" />
                    اطلاعات را از منبع نام‌برده تأیید کرده‌ام
                  </label>
                </RadioGroup>
              </fieldset>
              <fieldset>
                <legend>اولویت رستوران میان گزینه‌های هم‌امتیاز</legend>
                <RadioGroup
                  value={String(editing.businessPriority)}
                  onValueChange={(v) =>
                    setEditing({ ...editing, businessPriority: Number(v) })
                  }
                  className="taste-chip-grid"
                >
                  {['عادی', 'ترجیح رستوران', 'ویژهٔ رستوران'].map((label, i) => (
                    <label key={i} className="taste-check">
                      <RadioGroupItem value={String(i)} />
                      {label}
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>
              <Button
                disabled={t.busy}
                onClick={async () => {
                  if (
                    await t.mutate({
                      action: 'knowledge',
                      role: 'manager',
                      knowledge: editing,
                    })
                  )
                    setEditing(null);
                }}
              >
                ذخیرهٔ شناسنامه
              </Button>
              {t.error && (
                <p className="taste-error" role="alert">
                  {t.error}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
