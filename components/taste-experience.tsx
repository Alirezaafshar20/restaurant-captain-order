'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Coffee,
  Utensils,
  Sparkles,
  Bookmark,
  ArrowUpLeft,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { menu, categories, money } from '@/lib/menu';
import {
  emptyContext,
  emptyPreferences,
  flavorLabels,
  inOccasion,
  type TasteContext,
  type Preferences,
  type Occasion,
  type Profile,
  type Decision,
  type Knowledge,
  type Feedback,
  type Flavor,
} from '@/lib/taste';
import type { OrderItem } from '@/lib/domain';
type Snapshot = {
  profile: Profile | null;
  knowledge: Knowledge[];
  feedback: Feedback[];
  decisions: Decision[];
};
async function post<T = Snapshot>(body: object): Promise<T> {
  const response = await fetch('/api/taste', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'ارتباط برقرار نشد.');
  return data;
}
export function useTaste() {
  const [context, updateContext] = useState<TasteContext>(emptyContext);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    profile: null,
    knowledge: [],
    feedback: [],
    decisions: [],
  });
  const [decision, setDecision] = useState<Decision | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/taste', { cache: 'no-store' });
      if (!r.ok)
        throw new Error('حساب سلیقه دریافت نشد. منو همچنان در دسترس است.');
      setSnapshot((await r.json()) as Snapshot);
      setReady(true);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ارتباط برقرار نشد.');
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(initial);
  }, [refresh]);
  const setContext = useCallback((next: TasteContext) => {
    generation.current++;
    updateContext(next);
    setDecision(null);
  }, []);
  async function mutate(body: object) {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      setSnapshot(await post(body));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ذخیره انجام نشد.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function suggest(cartIds: string[]) {
    if (busy) return;
    const turn = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const d = await post<Decision>({
        action: 'recommend',
        context: { ...context, source: 'requested' },
        cartIds,
        requestId: crypto.randomUUID(),
      });
      if (turn === generation.current) setDecision(d);
    } catch (e) {
      if (turn === generation.current)
        setError(e instanceof Error ? e.message : 'پیشنهاد دریافت نشد.');
    } finally {
      setBusy(false);
    }
  }
  async function event(
    itemId: string,
    kind: 'shown' | 'selected' | 'rejected',
  ) {
    if (!decision) return;
    try {
      await post({
        action: 'event',
        decisionId: decision.id,
        itemId,
        event: kind,
      });
    } catch {
      setError('ثبت بازخورد پیشنهاد انجام نشد؛ سفارش شما تحت تأثیر نیست.');
    }
  }
  return {
    context,
    setContext,
    snapshot,
    decision,
    setDecision,
    error,
    setError,
    busy,
    ready,
    profileOpen,
    setProfileOpen,
    refresh,
    mutate,
    suggest,
    event,
  };
}
export type TasteModel = ReturnType<typeof useTaste>;
const toggle = <T,>(items: T[], item: T) =>
  items.includes(item) ? items.filter((i) => i !== item) : [...items, item];
export function TasteWelcome({
  model: t,
  onOccasion,
  onItem,
  cartIds,
  unavailable,
  onCaptain,
}: {
  model: TasteModel;
  onOccasion: (v: Occasion) => void;
  onItem: (id: string) => void;
  cartIds: string[];
  unavailable: string[];
  onCaptain: () => void;
}) {
  const { context: c, snapshot: s, decision: d } = t;
  const shown = useRef('');
  useEffect(() => {
    if (!d || d.id === shown.current) return;
    shown.current = d.id;
    for (const id of d.selected) void t.event(id, 'shown');
  }, [d, t]);
  return (
    <section className="taste-welcome" aria-label="نوع مراجعه و راهنمای سلیقه">
      <div className="taste-intro">
        <div>
          <span className="eyebrow">YOUR MOMENT AT MOYA</span>
          <h1>امروز چه میل دارید؟</h1>
          <p>یک فنجان قهوه، یک وعده غذا، یا هر دو.</p>
        </div>
        <Button variant="outline" onClick={() => t.setProfileOpen(true)}>
          <Bookmark size={17} />
          {s.profile ? 'حساب سلیقهٔ من' : 'سلیقه‌ام را به خاطر بسپار'}
        </Button>
      </div>
      <RadioGroup
        className="occasion-options"
        value={c.occasion || ''}
        onValueChange={(v) => {
          const occasion = v as Occasion;
          t.setContext({ ...c, occasion });
          onOccasion(occasion);
        }}
        aria-label="کدام منو را می‌خواهید؟"
      >
        {(
          [
            {
              id: 'cafe',
              title: 'کافه',
              text: 'قهوه، نوشیدنی و دسر',
              icon: Coffee,
            },
            {
              id: 'dining',
              title: 'غذا',
              text: 'برای یک وعده در مویا',
              icon: Utensils,
            },
            {
              id: 'both',
              title: 'هر دو',
              text: 'تمام انتخاب‌های منو',
              icon: Sparkles,
            },
          ] as const
        ).map(({ id, title, text, icon: Icon }) => (
          <label
            key={id}
            className={'occasion-card ' + (c.occasion === id ? 'chosen' : '')}
          >
            <RadioGroupItem value={id} />
            <Icon size={27} />
            <span>
              <b>{title}</b>
              <small>{text}</small>
            </span>
            <ArrowUpLeft size={18} />
          </label>
        ))}
      </RadioGroup>
      {s.profile && (
        <div className="returning-guest">
          <span>
            {s.profile.displayName}، خوش آمدید. انتخاب امروزتان می‌تواند متفاوت
            باشد.
          </span>
          <Button
            variant="ghost"
            disabled={!t.ready}
            onClick={() =>
              t.setContext({
                ...c,
                mine: true,
                preferences: { ...s.profile!.preferences },
              })
            }
          >
            استفاده از سلیقهٔ ذخیره‌شده
          </Button>
        </div>
      )}
      {c.occasion && (
        <div className="taste-actions">
          <Button
            disabled={t.busy || !t.ready}
            onClick={() => void t.suggest(cartIds)}
          >
            <Sparkles size={17} />
            {t.busy ? 'در حال بررسی…' : 'کمکم کن انتخاب کنم'}
          </Button>
          <Button variant="ghost" onClick={() => t.setProfileOpen(true)}>
            تنظیم سلیقه و مبلغ
          </Button>
          <span>دیدن منو و سفارش به ساخت حساب نیاز ندارد.</span>
        </div>
      )}
      {t.error && (
        <div className="taste-error" role="alert">
          {t.error}
          <Button variant="ghost" onClick={() => void t.refresh()}>
            تلاش دوباره
          </Button>
        </div>
      )}
      {d && (
        <div className="taste-results" aria-live="polite">
          <div className="row-between">
            <h2>برای انتخاب شما</h2>
            <button
              className="icon-button"
              aria-label="بستن پیشنهادها"
              onClick={() => t.setDecision(null)}
            >
              <X size={18} />
            </button>
          </div>
          <p>{d.message}</p>
          <div className="taste-candidates">
            {d.selected.map((id) => {
              const item = menu.find((m) => m.id === id)!;
              const candidate = d.ranked.find((r) => r.itemId === id)!;
              return (
                <article key={id}>
                  {item.image && (
                    <img src={item.image} alt={item.name} loading="lazy" />
                  )}
                  <div>
                    <h3>{item.name}</h3>
                    <b>{money(item.price)} تومان</b>
                    <p>{candidate.reasons.join(' · ')}</p>
                    <small>{candidate.evidence}</small>
                    <div className="taste-actions">
                      <Button
                        size="sm"
                        disabled={unavailable.includes(id)}
                        onClick={() => {
                          void t.event(id, 'selected');
                          onItem(id);
                        }}
                      >
                        بررسی انتخاب
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void t.event(id, 'rejected');
                          t.setContext({
                            ...c,
                            preferences: {
                              ...c.preferences,
                              avoidIds: [
                                ...new Set([...c.preferences.avoidIds, id]),
                              ],
                            },
                          });
                        }}
                      >
                        الان نمی‌خواهم
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {d.action === 'handoff' && (
            <Button variant="outline" onClick={onCaptain}>
              همراهی کاپیتان
            </Button>
          )}
          {!s.profile && d.selected.length > 0 && (
            <div className="taste-save-invite">
              <Bookmark size={20} />
              <div>
                <b>دفعهٔ بعد، انتخاب را از همین‌جا ادامه دهید.</b>
                <p>
                  با نام دلخواه و تأیید خودتان، سلیقه‌تان را در حساب ذخیره کنید.
                </p>
              </div>
              <Button variant="outline" onClick={() => t.setProfileOpen(true)}>
                ذخیرهٔ سلیقه
              </Button>
            </div>
          )}
        </div>
      )}
      {t.profileOpen && <TasteProfile model={t} />}
    </section>
  );
}
function TasteProfile({ model: t }: { model: TasteModel }) {
  const [prefs, setPrefs] = useState<Preferences>(() => t.context.preferences);
  const [name, setName] = useState(() => t.snapshot.profile?.displayName || '');
  const [consent, setConsent] = useState(false);
  const [forget, setForget] = useState(false);
  const [status, setStatus] = useState('');
  const apply = () => t.setContext({ ...t.context, preferences: prefs });
  return (
    <Dialog open={t.profileOpen} onOpenChange={t.setProfileOpen}>
      <DialogContent className="taste-profile-dialog">
        <DialogTitle>انتخاب امروز، سلیقهٔ شما</DialogTitle>
        <DialogDescription>
          برای امروز تنظیم کنید؛ اگر مایل بودید، برای مراجعات بعد هم به خاطر
          می‌سپاریم.
        </DialogDescription>
        <label className="taste-check">
          <Checkbox
            checked={t.context.mine}
            onCheckedChange={(v) => {
              setPrefs(emptyPreferences());
              t.setContext({
                ...t.context,
                mine: !!v,
                preferences: emptyPreferences(),
              });
            }}
          />
          این انتخاب‌ها برای خودم است
        </label>
        {!t.context.mine && (
          <p className="taste-hint">
            در انتخاب برای همراهان، سابقهٔ شخصی شما در پیشنهاد اثر نمی‌گذارد و
            چیزی به سلیقهٔ شما اضافه نمی‌شود.
          </p>
        )}
        <label className="taste-check">
          <Checkbox
            checked={t.context.quick}
            onCheckedChange={(v) => t.setContext({ ...t.context, quick: !!v })}
          />
          زمان کمی دارم؛ انتخاب کوتاه و سریع می‌خواهم
        </label>
        <fieldset>
          <legend>بیشتر کدام بخش‌ها را می‌پسندید؟</legend>
          <div className="taste-chip-grid">
            {categories
              .filter((c) => c !== 'همه' && inOccasion(c, t.context.occasion))
              .map((c) => (
                <label key={c} className="taste-check">
                  <Checkbox
                    checked={prefs.categories.includes(c)}
                    onCheckedChange={() =>
                      setPrefs({
                        ...prefs,
                        categories: toggle(prefs.categories, c),
                      })
                    }
                  />
                  {c}
                </label>
              ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>طعم‌های دلخواه — اختیاری</legend>
          <div className="taste-chip-grid">
            {Object.entries(flavorLabels).map(([f, title]) => (
              <label key={f} className="taste-check">
                <Checkbox
                  checked={prefs.flavors.includes(f as Flavor)}
                  onCheckedChange={() =>
                    setPrefs({
                      ...prefs,
                      flavors: toggle(prefs.flavors, f as Flavor),
                    })
                  }
                />
                {title}
              </label>
            ))}
          </div>
          <p className="taste-hint">
            این ترجیحات ذخیره می‌شوند؛ تأثیر طعم در پیشنهاد به تأیید شناسنامهٔ هر
            غذا نیاز دارد.
          </p>
        </fieldset>
        <label className="field">
          حداکثر مبلغ هر انتخاب، به تومان — اختیاری
          <input
            type="number"
            min="1000"
            max="100000000"
            placeholder="بدون سقف مشخص"
            value={prefs.maxPrice ?? ''}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                maxPrice: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        {prefs.avoidIds.length > 0 && (
          <fieldset>
            <legend>فعلاً از پیشنهادها کنار گذاشته‌اید</legend>
            <div className="taste-chip-grid">
              {prefs.avoidIds.map((id) => (
                <Button
                  key={id}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setPrefs({
                      ...prefs,
                      avoidIds: prefs.avoidIds.filter((i) => i !== id),
                    })
                  }
                >
                  {menu.find((m) => m.id === id)?.name}
                  <X size={14} />
                </Button>
              ))}
            </div>
          </fieldset>
        )}
        <Button
          variant="outline"
          onClick={() => {
            apply();
            t.setProfileOpen(false);
          }}
        >
          فقط برای این مراجعه اعمال کن
        </Button>
        <div className="taste-account">
          <h3>
            {t.snapshot.profile
              ? 'به‌روزرسانی حساب سلیقه'
              : 'دفعهٔ بعد هم مرا بشناس'}
          </h3>
          <p>
            ترجیحات و بازخورد غذاهایی که خودتان خورده‌اید، به انتخاب‌های بعدی کمک
            می‌کنند.
          </p>
          <label className="field">
            با چه نامی صدایتان کنیم؟
            <input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="taste-check">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(!!v)}
            />
            این سلیقه با انتخاب من در حساب ذخیره شود.
          </label>
          <Button
            disabled={
              t.busy || !t.ready || !consent || !name.trim() || !t.context.mine
            }
            onClick={async () => {
              if (
                await t.mutate({
                  action: 'save-profile',
                  displayName: name,
                  preferences: prefs,
                  consent,
                  revision: t.snapshot.profile?.revision || 0,
                })
              ) {
                apply();
                setStatus(
                  'سلیقه ذخیره شد. هر زمان بخواهید قابل تغییر یا حذف است.',
                );
                setConsent(false);
              }
            }}
          >
            <Check size={16} />
            ذخیره در حساب من
          </Button>
          <small>
            در این نسخهٔ خصوصی، حساب متعلق به شخص واردشده به محیط ارائه است. ورود
            مستقل مشتریان رستوران هنوز فعال نشده است.
          </small>
        </div>
        {status && <output>{status}</output>}
        {t.error && (
          <p className="taste-error" role="alert">
            {t.error}
          </p>
        )}
        {t.snapshot.profile && (
          <div className="taste-account-tools">
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  const data = await post({ action: 'export' });
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(data, null, 2)], {
                      type: 'application/json',
                    }),
                  );
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'my-captain-taste.json';
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  setStatus(
                    'نسخهٔ سلیقه برای خودتان دریافت شد؛ به رستوران دیگری ارسال نشده است.',
                  );
                } catch {
                  setStatus('دریافت انجام نشد؛ دوباره تلاش کنید.');
                }
              }}
            >
              دریافت نسخهٔ سلیقهٔ من
            </Button>
            <Button variant="ghost" onClick={() => setForget(true)}>
              حذف حافظهٔ سلیقه
            </Button>
            {forget && (
              <div className="taste-delete">
                <p>
                  ترجیحات، بازخوردهای شخصی و سابقهٔ پیشنهادها حذف می‌شوند. سوابق
                  سفارش و حساب میز باقی می‌مانند.
                </p>
                <Button
                  variant="destructive"
                  disabled={t.busy}
                  onClick={async () => {
                    if (await t.mutate({ action: 'forget', confirm: true })) {
                      t.setContext({
                        ...t.context,
                        preferences: emptyPreferences(),
                      });
                      setPrefs(emptyPreferences());
                      setName('');
                      setForget(false);
                      setStatus('حافظهٔ سلیقه حذف شد.');
                    }
                  }}
                >
                  تأیید حذف حافظه
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function TasteFeedback({
  model: t,
  items,
}: {
  model: TasteModel;
  items: OrderItem[];
}) {
  const [own, setOwn] = useState<string[]>([]);
  const served = items.filter((i) => i.status === 'served');
  if (!served.length) return null;
  return (
    <section className="taste-feedback">
      <h3>این بار چطور بود؟</h3>
      <p>فقط دربارهٔ انتخابی نظر بدهید که خودتان میل کرده‌اید.</p>
      {served.map((item) => {
        const feedback = t.snapshot.feedback.find(
          (f) => f.orderItemId === item.id,
        );
        return (
          <div key={item.id} className="feedback-item">
            <b>{item.name}</b>
            <label className="taste-check">
              <Checkbox
                checked={own.includes(item.id)}
                onCheckedChange={() => setOwn(toggle(own, item.id))}
              />
              خودم میل کردم
            </label>
            {t.snapshot.profile ? (
              <div className="taste-actions">
                {(
                  [
                    { value: 'like', title: 'با سلیقه‌ام جور بود' },
                    { value: 'dislike', title: 'با سلیقه‌ام جور نبود' },
                    { value: 'service', title: 'مسئلهٔ پخت یا سرو داشتم' },
                  ] as const
                ).map((r) => (
                  <Button
                    key={r.value}
                    size="sm"
                    variant={
                      feedback?.rating === r.value ? 'default' : 'outline'
                    }
                    disabled={!own.includes(item.id) || t.busy}
                    onClick={() =>
                      void t.mutate({
                        action: 'feedback',
                        orderItemId: item.id,
                        rating: r.value,
                        mine: true,
                      })
                    }
                  >
                    {r.title}
                  </Button>
                ))}
              </div>
            ) : (
              <Button variant="outline" onClick={() => t.setProfileOpen(true)}>
                سلیقه‌ام ذخیره شود تا بازخوردم را به خاطر بسپارد
              </Button>
            )}
            {feedback && (
              <output className="taste-hint">
                {feedback.rating === 'service'
                  ? 'ثبت شد؛ این مورد به معنی نپسندیدن غذا نیست. برای رسیدگی همین الان از همراهی کاپیتان استفاده کنید.'
                  : 'ثبت شد؛ در پیشنهادهای شخصی بعدی اثر می‌گذارد.'}
              </output>
            )}
          </div>
        );
      })}
      {t.error && (
        <p className="taste-error" role="alert">
          {t.error}
        </p>
      )}
    </section>
  );
}
