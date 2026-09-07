'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronLeft,
  ChefHat,
  Clock3,
  Coffee,
  CreditCard,
  LayoutGrid,
  Leaf,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Utensils,
  X,
  Mic,
  RefreshCw,
  Users,
  Receipt,
  SlidersHorizontal,
  CircleHelp,
  ArrowUpLeft,
  CheckCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMenuTools } from '@/components/use-menu-tools';
import { VisitArchive } from '@/components/visit-archive';
import {
  useTaste,
  TasteWelcome,
  TasteFeedback,
} from '@/components/taste-experience';
import { TasteManagement } from '@/components/taste-management';
import { emptyContext, inOccasion, type TasteContext } from '@/lib/taste';
import type { GuidePresentation } from '@/lib/guide-presentation';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  menu,
  categories,
  money,
  label,
  menuSource,
  type MenuItem,
  isBeverage,
} from '@/lib/menu';
import {
  initialState,
  total,
  paid,
  due,
  statusLabels,
  type Workspace,
  type Role,
  type OrderItem,
  type ServiceRequest,
} from '@/lib/domain';
type Draft = { menuId: string; quantity: number; note: string };
const roles: { id: Role; title: string; en: string; icon: typeof Users }[] = [
  { id: 'guest', title: 'مهمان', en: 'GUEST EXPERIENCE', icon: Utensils },
  { id: 'captain', title: 'کاپیتان', en: 'FLOOR SERVICE', icon: Users },
  { id: 'kitchen', title: 'آشپزخانه', en: 'KITCHEN PASS', icon: ChefHat },
  { id: 'cashier', title: 'صندوق', en: 'CASH DESK', icon: CreditCard },
  { id: 'manager', title: 'مدیریت', en: 'SERVICE OVERVIEW', icon: LayoutGrid },
];
const roleName = (r: Role) => roles.find((x) => x.id === r)?.title;
function time(s: string) {
  return new Date(s).toLocaleTimeString('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
function elapsed(s: string) {
  return label(
    Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 60000)),
  );
}
function Plate({ item }: { item: MenuItem }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  return item.image && failedImage !== item.image ? (
    <img
      src={item.image}
      alt={item.name}
      loading="lazy"
      className="food-photo"
      onError={() => setFailedImage(item.image || null)}
    />
  ) : (
    <div className={'menu-art art-' + item.category}>
      <span>
        {isBeverage(item.category) ? (
          <Coffee />
        ) : item.category === 'سالاد' ? (
          <Leaf />
        ) : item.category === 'دسر' ? (
          <Coffee />
        ) : (
          <Utensils />
        )}
      </span>
      <small>
        {item.image ? 'عکس فعلاً بارگذاری نشد' : 'عکس این آیتم در منو ثبت نشده'}
      </small>
    </div>
  );
}
export default function Experience({
  initialRole = 'guest',
  initialTable = 12,
}: {
  initialRole?: Role;
  initialTable?: number;
}) {
  const [state, setState] = useState<Workspace>(initialState);
  const taste = useTaste();
  const [role, setRole] = useState<Role>(initialRole);
  const [table, setTable] = useState(initialTable);
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [category, setCategory] = useState('همه');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<MenuItem | null>(null);
  const [itemNote, setItemNote] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [presentOpen, setPresentOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [serviceText, setServiceText] = useState('');
  const [changeItem, setChangeItem] = useState('');
  const [activeRequest, setActiveRequest] = useState<ServiceRequest | null>(
    null,
  );
  const [outcome, setOutcome] = useState('');
  const [editNote, setEditNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'card'>('card');
  const [reference, setReference] = useState('');
  const [staffTab, setStaffTab] = useState('tables');
  const [staffOrderOpen, setStaffOrderOpen] = useState(false);
  const [guests, setGuests] = useState(2);
  const [destination, setDestination] = useState(1);
  const [moveOpen, setMoveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [archiveId, setArchiveId] = useState('');
  const [decisionRequest, setDecisionRequest] = useState<ServiceRequest | null>(
    null,
  );
  const [decisionOutcome, setDecisionOutcome] = useState('');
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set('view', role);
    u.searchParams.set('table', String(table));
    window.history.replaceState(null, '', u);
  }, [role, table]);
  useMenuTools({
    unavailable: state.unavailable,
    role,
    draft,
    setSelection: (lines) => {
      setDraft(lines);
      setCartOpen(true);
    },
  });
  const pending = useRef<{ key: string; id: string } | null>(null);
  const visit = state.visits.find(
    (v) => v.table === table && v.phase === 'open',
  );
  const tasteVisit = useRef('');
  const resetTaste = taste.setContext;
  useEffect(() => {
    const key = String(table) + ':' + (visit?.id || 'none');
    if (tasteVisit.current && tasteVisit.current !== key) {
      resetTaste(emptyContext());
      setCategory('همه');
    }
    tasteVisit.current = key;
  }, [table, visit?.id, resetTaste]);
  const active = state.visits.filter((v) => v.phase === 'open');
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/workspace', { cache: 'no-store' });
      const data = (await r.json()) as Workspace & { error?: string };
      if (!r.ok) throw new Error(data.error);
      setState((s) => (data.revision >= s.revision ? data : s));
      setConnected(true);
      setLoaded(true);
    } catch {
      setConnected(false);
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    const first = setTimeout(() => {
      void refresh();
    }, 0);
    const t = setInterval(() => {
      void refresh();
    }, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  async function command(
    payload: Record<string, unknown>,
    success = 'تغییرات ثبت شد.',
  ) {
    if (busy) return false;
    setBusy(true);
    setError('');
    const content = { role, visitId: visit?.id, ...payload };
    const key = JSON.stringify(content);
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    try {
      const r = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...content, commandId: pending.current.id }),
      });
      const data = (await r.json()) as Workspace & { error?: string };
      if (!r.ok) {
        pending.current = null;
        throw new Error(data.error);
      }
      setState((s) => (data.revision >= s.revision ? data : s));
      pending.current = null;
      setConnected(true);
      setNotice(success);
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'ارتباط برقرار نشد؛ دوباره تلاش کنید.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const add = (m: MenuItem, q = 1, note = '') => {
    if (busy) return;
    setDraft((d) => {
      const old = d.find((x) => x.menuId === m.id && x.note === note);
      return old
        ? d.map((x) =>
            x === old ? { ...x, quantity: Math.min(20, x.quantity + q) } : x,
          )
        : [...d, { menuId: m.id, quantity: q, note }];
    });
    setNotice(`${m.name} به انتخاب شما اضافه شد.`);
    setDetail(null);
  };
  const draftCount = draft.reduce((s, l) => s + l.quantity, 0);
  const draftTotal = draft.reduce(
    (s, l) =>
      s + l.quantity * (menu.find((m) => m.id === l.menuId)?.price || 0),
    0,
  );
  const filtered = menu.filter(
    (m) =>
      (role !== 'guest' || inOccasion(m.category, taste.context.occasion)) &&
      (category === 'همه' || m.category === category) &&
      (!search ||
        `${m.name} ${m.description} ${m.en}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const switchTable = (n: number) => {
    if (busy) return;
    if (n !== table) {
      setDraft([]);
      setTable(n);
      setOrdersOpen(false);
    }
  };
  const openDetail = (m: MenuItem) => {
    setQuantity(1);
    setItemNote('');
    setDetail(m);
  };
  const openService = (item?: OrderItem) => {
    setServiceText('');
    setChangeItem(item?.id || '');
    setServiceOpen(true);
  };
  const changeRequest = (r: ServiceRequest) => {
    setActiveRequest(r);
    setOutcome('');
    setConsent(false);
    setEditNote(r.text);
  };
  const itemCount = active.reduce(
    (n, v) => n + v.items.filter((i) => i.status === 'pending').length,
    0,
  );
  const requestCount = active.reduce(
    (n, v) => n + v.requests.filter((r) => r.state !== 'resolved').length,
    0,
  );
  return (
    <div className={role === 'guest' ? 'guest-app' : 'staff-app'}>
      <div className="presentation-bar">
        <span>
          <i /> فضای ارائهٔ اختصاصی مویا
        </span>
        <button onClick={() => setPresentOpen(true)}>
          نمای {roleName(role)} <SlidersHorizontal size={13} />
        </button>
      </div>
      {role === 'guest' ? (
        <>
          <header className="guest-header">
            <div className="header-side">
              <span className="table-pill">
                <span className="tiny-dot" /> میز {label(table)}
              </span>
              <span className="desktop-only subtle">به مویا خوش آمدید</span>
            </div>
            <a className="wordmark" href="/" aria-label="مویا">
              MOYA<span>CUISINE & CULTURE</span>
            </a>
            <div className="header-side end">
              <button className="text-button" onClick={() => openService()}>
                <Bell size={17} />
                <span>همراهی کاپیتان</span>
              </button>
              <button
                className="icon-button cart-icon"
                aria-label="سبد سفارش"
                onClick={() => setCartOpen(true)}
              >
                <ShoppingBag size={20} />
                {draftCount > 0 && <b>{label(draftCount)}</b>}
              </button>
            </div>
          </header>
          <main className="guest-main">
            <TasteWelcome
              model={taste}
              unavailable={state.unavailable}
              cartIds={draft.map((d) => d.menuId)}
              onCaptain={() => openService()}
              onItem={(id) => openDetail(menu.find((m) => m.id === id)!)}
              onOccasion={() => {
                setCategory('همه');
                setSearch('');
              }}
            />
            <section className="welcome taste-secondary-welcome">
              <div className="welcome-copy">
                <div className="eyebrow">
                  <span />
                  THE MOYA EXPERIENCE
                </div>
                <h1>
                  انتخاب شما،
                  <br />
                  <em>آغاز یک تجربه.</em>
                </h1>
                <p>
                  طعم‌های آشنا، روایت‌های تازه.
                  <br />
                  منو را کشف کنید؛ ما برای همراهی شما اینجاییم.
                </p>
                <button
                  className="welcome-link"
                  onClick={() => setAssistantOpen(true)}
                >
                  <Sparkles size={17} /> گفت‌وگو دربارهٔ منو{' '}
                  <ArrowUpLeft size={17} />
                </button>
              </div>
              <div className="feature-dish">
                <div className="feature-visual">
                  <img
                    className="hero-food-photo"
                    src={menu[0].image}
                    alt="ریب آی از منوی رسمی مویا"
                    fetchPriority="high"
                  />
                  <span className="feature-caption">
                    A MOMENT, WELL SAVOURED.
                  </span>
                </div>
                <div className="feature-label">
                  <span>از منوی مویا</span>
                  <h2>ریب آی سووید</h2>
                  <p>گلیز گوساله · قارچ · سس تام</p>
                  <button
                    aria-label="مشاهده ریب آی"
                    onClick={() => openDetail(menu[0])}
                  >
                    <ArrowUpLeft size={22} />
                  </button>
                </div>
              </div>
            </section>
            <div className="hospitality-strip">
              <div>
                <Sparkles size={20} />
                <p>
                  <b>انتخابی به سلیقهٔ شما</b>
                  <span>راهنمای منو، بدون عجله</span>
                </p>
              </div>
              <div>
                <Utensils size={20} />
                <p>
                  <b>جزئیات هر طعم</b>
                  <span>مواد اولیه از منوی مویا</span>
                </p>
              </div>
              <div>
                <Bell size={20} />
                <p>
                  <b>همیشه با همراهی انسان</b>
                  <span>کاپیتان در کنار شماست</span>
                </p>
              </div>
            </div>
            <section className="menu-section" id="menu">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">CURATED WITH CARE</span>
                  <h2>
                    منوی مویا <small>{label(menu.length)} انتخاب</small>
                  </h2>
                </div>
                <label className="search-field">
                  <Search size={18} />
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      if (e.target.value) setCategory('همه');
                    }}
                    placeholder="جست‌وجوی غذا یا مواد اولیه"
                    aria-label="جست‌وجوی منو"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      aria-label="پاک کردن جست‌وجو"
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
              </div>
              <div className="menu-scope" aria-label="بخش‌های منو">
                {(
                  [
                    ['both', 'تمام منو'],
                    ['cafe', 'کافه و دسر'],
                    ['dining', 'غذا و صبحانه'],
                  ] as const
                ).map(([scope, title]) => (
                  <button
                    type="button"
                    key={scope}
                    aria-pressed={(taste.context.occasion || 'both') === scope}
                    onClick={() => {
                      taste.setContext({ ...taste.context, occasion: scope });
                      setCategory('همه');
                      setSearch('');
                    }}
                  >
                    {title}{' '}
                    <span>
                      {label(
                        menu.filter((m) => inOccasion(m.category, scope))
                          .length,
                      )}
                    </span>
                  </button>
                ))}
              </div>
              <Tabs
                value={category}
                onValueChange={(v) => setCategory(String(v))}
                className="menu-tabs"
              >
                <TabsList variant="line">
                  {categories
                    .filter(
                      (c) =>
                        c === 'همه' || inOccasion(c, taste.context.occasion),
                    )
                    .map((c) => (
                      <TabsTrigger key={c} value={c}>
                        {c === 'همه' ? 'همهٔ این بخش' : c}{' '}
                        <span className="category-count">
                          {label(
                            menu.filter(
                              (m) =>
                                inOccasion(
                                  m.category,
                                  taste.context.occasion,
                                ) &&
                                (c === 'همه' || m.category === c),
                            ).length,
                          )}
                        </span>
                      </TabsTrigger>
                    ))}
                </TabsList>
                <TabsContent value={category}>
                  <div className="menu-heading">
                    <span>
                      {category === 'همه' ? 'همهٔ انتخاب‌های این بخش' : category}{' '}
                      <small>
                        {' '}
                        / نمایش {label(filtered.length)} از {label(menu.length)}{' '}
                        آیتم منو
                      </small>
                    </span>
                    {category !== 'همه' ||
                    search ||
                    (taste.context.occasion &&
                      taste.context.occasion !== 'both') ? (
                      <button
                        type="button"
                        className="menu-reset"
                        onClick={() => {
                          taste.setContext({
                            ...taste.context,
                            occasion: 'both',
                          });
                          setCategory('همه');
                          setSearch('');
                        }}
                      >
                        نمایش تمام منو <ArrowLeft size={14} />
                      </button>
                    ) : (
                      <span>قیمت‌ها به تومان</span>
                    )}
                  </div>
                  {filtered.length === 0 ? (
                    <div className="empty-state">
                      <Search />
                      <h3>طعمی با این نام پیدا نشد.</h3>
                      <p>نام غذا یا یکی از مواد اولیه را جست‌وجو کنید.</p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearch('');
                          setCategory('همه');
                          taste.setContext({
                            ...taste.context,
                            occasion: 'both',
                          });
                        }}
                      >
                        نمایش همهٔ منو
                      </Button>
                    </div>
                  ) : (
                    <div className="food-grid">
                      {filtered.map((m) => (
                        <article
                          className={
                            'food-card ' +
                            (state.unavailable.includes(m.id)
                              ? 'unavailable'
                              : '')
                          }
                          key={m.id}
                        >
                          <button
                            className="card-visual"
                            onClick={() => openDetail(m)}
                            aria-label={`جزئیات ${m.name}`}
                          >
                            <Plate item={m} />
                            {state.unavailable.includes(m.id) && (
                              <span className="sold-out">امروز ناموجود</span>
                            )}
                          </button>
                          <div className="card-copy">
                            <span className="dish-en">{m.en}</span>
                            <button
                              className="dish-title"
                              onClick={() => openDetail(m)}
                            >
                              {m.name}
                            </button>
                            <p>{m.description}</p>
                            <div className="card-bottom">
                              <span className="price">
                                {money(m.price)} <small>تومان</small>
                              </span>
                              <button
                                className="add-button"
                                disabled={state.unavailable.includes(m.id)}
                                onClick={() => openDetail(m)}
                                aria-label={`افزودن ${m.name}`}
                              >
                                <Plus size={19} />
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </section>
            <section className="companion-banner">
              <div className="spark-emblem">
                <Sparkles size={24} />
              </div>
              <div>
                <h3>بین چند انتخاب مردد هستید؟</h3>
                <p>از طعم دلخواهتان بگویید؛ با هم منو را مرور می‌کنیم.</p>
              </div>
              <Button onClick={() => setAssistantOpen(true)}>
                گفت‌وگو با راهنمای مویا <ArrowLeft size={16} />
              </Button>
            </section>
            <footer className="guest-footer">
              <div className="wordmark">
                MOYA<span>CUISINE & CULTURE</span>
              </div>
              <p>با حضور شما، مهمان‌نوازی معنا می‌گیرد.</p>
              <div>
                <a href={menuSource} target="_blank" rel="noreferrer">
                  منبع: منوی رسمی مویا <ArrowUpLeft size={12} />
                </a>
                <span>
                  منوی غذا و نوشیدنی مویا · موجودی روز با رستوران هماهنگ می‌شود
                </span>
              </div>
            </footer>
          </main>
          <div className="guest-dock">
            <button onClick={() => setAssistantOpen(true)}>
              <Sparkles size={20} />
              <span>راهنمای من</span>
            </button>
            <button onClick={() => setOrdersOpen(true)}>
              <Clock3 size={20} />
              <span>
                سفارش‌های میز{' '}
                {visit?.items.length ? `(${label(visit.items.length)})` : ''}
              </span>
            </button>
            <button className="dock-cart" onClick={() => setCartOpen(true)}>
              <ShoppingBag size={18} />
              <span>
                انتخاب من {draftCount > 0 && `· ${label(draftCount)}`}
              </span>
              {draftTotal > 0 && (
                <b>
                  {money(draftTotal)} <small>تومان</small>
                </b>
              )}
            </button>
          </div>
        </>
      ) : (
        <div className="staff-shell">
          <aside className="staff-sidebar">
            <div className="wordmark">
              MOYA<span>SERVICE, CONNECTED.</span>
            </div>
            <div className="sidebar-caption">میز کار</div>
            {roles
              .filter((r) => r.id !== 'guest')
              .map((r) => (
                <button
                  key={r.id}
                  className={role === r.id ? 'selected' : ''}
                  onClick={() => {
                    setRole(r.id);
                    setStaffTab('tables');
                  }}
                >
                  <r.icon size={19} />
                  {r.title}
                  {r.id === 'captain' && itemCount > 0 && (
                    <b>{label(itemCount)}</b>
                  )}
                </button>
              ))}
            <div className="sidebar-bottom">
              <button onClick={() => setRole('guest')}>
                <Utensils size={17} />
                نمای مهمان <ArrowUpLeft size={16} />
              </button>
              <div className="staff-identity">
                <span>م</span>
                <p>
                  فضای ارائهٔ مویا<small>دسترسی مالک · تغییر نقش نمایشی</small>
                </p>
              </div>
            </div>
          </aside>
          <main className="staff-main">
            <header className="staff-header">
              <div>
                <span className="eyebrow">
                  {roles.find((r) => r.id === role)?.en}
                </span>
                <h1>
                  {role === 'captain'
                    ? 'میزبانی، با خیال آسوده.'
                    : role === 'kitchen'
                      ? 'هر سفارش، در زمان درست.'
                      : role === 'cashier'
                        ? 'حساب‌ها، روشن و دقیق.'
                        : 'نبض امروز مویا'}
                </h1>
              </div>
              <div className="live-indicator">
                <i className={connected ? '' : 'offline'} />
                {connected ? 'متصل به سالن' : 'ارتباط قطع است'}
                <button onClick={refresh} aria-label="تازه‌سازی">
                  <RefreshCw size={15} />
                </button>
              </div>
            </header>
            <div className="metrics">
              <div>
                <span>میزهای فعال</span>
                <b>
                  {label(active.length)}
                  <small>از ۱۲ میز</small>
                </b>
              </div>
              <div>
                <span>
                  {role === 'kitchen'
                    ? 'در حال آماده‌سازی'
                    : 'منتظر تأیید کاپیتان'}
                </span>
                <b>
                  {label(
                    role === 'kitchen'
                      ? active
                          .flatMap((v) => v.items)
                          .filter((i) => i.status === 'preparing').length
                      : itemCount,
                  )}
                  <small>قلم سفارش</small>
                </b>
              </div>
              <div>
                <span>درخواست‌های باز</span>
                <b>
                  {label(requestCount)}
                  <small>نیازمند رسیدگی</small>
                </b>
              </div>
              <div>
                <span>
                  {role === 'cashier' ? 'ماندهٔ حساب‌های باز' : 'آمادهٔ سرو'}
                </span>
                <b>
                  {role === 'cashier'
                    ? money(active.reduce((n, v) => n + due(v), 0))
                    : label(
                        active
                          .flatMap((v) => v.items)
                          .filter((i) => i.status === 'ready').length,
                      )}
                  <small>{role === 'cashier' ? 'تومان' : 'قلم سفارش'}</small>
                </b>
              </div>
            </div>
            <Tabs
              value={staffTab}
              onValueChange={(v) => {
                setStaffTab(String(v));
                if (v === 'taste') void taste.refresh();
              }}
              className="staff-tabs"
            >
              <TabsList variant="line">
                <TabsTrigger value="tables">
                  {role === 'kitchen' ? 'صف آماده‌سازی' : 'میزها و سفارش‌ها'}
                </TabsTrigger>
                <TabsTrigger value="requests">
                  درخواست‌ها{' '}
                  {requestCount > 0 && (
                    <span className="counter">{label(requestCount)}</span>
                  )}
                </TabsTrigger>
                {(role === 'manager' || role === 'kitchen') && (
                  <TabsTrigger value="menu">موجودی منو</TabsTrigger>
                )}
                <TabsTrigger value="history">سوابق میزبانی</TabsTrigger>
                {role === 'manager' && (
                  <TabsTrigger value="taste">دانش و پیشنهاد</TabsTrigger>
                )}
              </TabsList>
            </Tabs>
            {staffTab === 'taste' && role === 'manager' ? (
              <TasteManagement model={taste} />
            ) : staffTab === 'requests' ? (
              <div className="request-grid">
                {active.flatMap((v) =>
                  v.requests
                    .filter((r) => r.state !== 'resolved')
                    .map((r) => (
                      <article className="request-card" key={r.id}>
                        <div className="row-between">
                          <span className="badge amber">
                            {r.kind === 'change'
                              ? 'اصلاح سفارش'
                              : r.kind === 'bill'
                                ? 'درخواست صورتحساب'
                                : 'همراهی کاپیتان'}
                          </span>
                          <small>
                            میز {label(v.table)} · {elapsed(r.createdAt)} دقیقه
                          </small>
                        </div>
                        <h3>{r.text}</h3>
                        {r.itemId && (
                          <p>{v.items.find((i) => i.id === r.itemId)?.name}</p>
                        )}
                        <div className="row-between">
                          <span className="subtle">
                            {r.owner || 'هنوز پذیرفته نشده'}
                          </span>
                          {(role === 'captain' || role === 'manager') && (
                            <Button
                              size="sm"
                              disabled={
                                busy ||
                                Boolean(r.proposal && !r.kitchenDecision)
                              }
                              onClick={() => {
                                switchTable(v.table);
                                if (r.state === 'open')
                                  void command({
                                    type: 'claim',
                                    visitId: v.id,
                                    requestId: r.id,
                                  });
                                else changeRequest(r);
                              }}
                            >
                              {r.state === 'open'
                                ? 'من رسیدگی می‌کنم'
                                : r.proposal && !r.kitchenDecision
                                  ? 'منتظر آشپزخانه'
                                  : 'ثبت نتیجه'}
                              <ChevronLeft size={15} />
                            </Button>
                          )}
                          {role === 'kitchen' &&
                            r.proposal &&
                            !r.kitchenDecision && (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  switchTable(v.table);
                                  setDecisionRequest(r);
                                  setDecisionOutcome('');
                                }}
                              >
                                بررسی امکان تغییر
                              </Button>
                            )}
                        </div>
                        {r.proposal && (
                          <p className="order-note">
                            {r.proposal.cancel
                              ? 'درخواست لغو: '
                              : 'اصلاح مورد تأیید مهمان: '}
                            {r.proposal.note}
                          </p>
                        )}
                        {r.kitchenDecision && (
                          <p className="order-note">{r.outcome}</p>
                        )}
                      </article>
                    )),
                )}
                {requestCount === 0 && (
                  <Empty
                    icon={CheckCheck}
                    title="همه‌چیز تحت رسیدگی است."
                    text="درخواست تازهٔ مهمان، اینجا به تیم سالن می‌رسد."
                  />
                )}
              </div>
            ) : staffTab === 'menu' ? (
              <div className="availability-list">
                <div className="section-heading">
                  <h3>موجودی زندهٔ منو</h3>
                  <span className="subtle">
                    تغییر، هم‌زمان در منوی مهمان اعمال می‌شود.
                  </span>
                </div>
                {menu.map((m) => (
                  <div key={m.id}>
                    <span>
                      <b>{m.name}</b>
                      <small>{m.category}</small>
                    </span>
                    <span>{money(m.price)} تومان</span>
                    <Button
                      variant={
                        state.unavailable.includes(m.id)
                          ? 'outline'
                          : 'secondary'
                      }
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        command({
                          type: 'availability',
                          menuId: m.id,
                          available: state.unavailable.includes(m.id),
                        })
                      }
                    >
                      {state.unavailable.includes(m.id)
                        ? 'ناموجود · فعال‌سازی'
                        : 'موجود · غیرفعال‌سازی'}
                    </Button>
                  </div>
                ))}
              </div>
            ) : staffTab === 'history' ? (
              <div className="history-list">
                <h3>میزبانی‌های پایان‌یافته</h3>
                {state.visits
                  .filter((v) => v.phase === 'departed')
                  .map((v) => (
                    <button
                      className="history-row full"
                      key={v.id}
                      onClick={() => setArchiveId(v.id)}
                    >
                      <span>
                        میز {label(v.table)}
                        <small>
                          {new Date(v.createdAt).toLocaleDateString('fa-IR')} ·{' '}
                          {time(v.createdAt)}
                        </small>
                      </span>
                      <span>
                        {label(
                          v.items.filter((i) => i.status !== 'cancelled')
                            .length,
                        )}{' '}
                        قلم
                      </span>
                      <b>{money(total(v))} تومان</b>
                      <span className="badge green">تسویه و پایان میزبانی</span>
                    </button>
                  ))}
                {!state.visits.some((v) => v.phase === 'departed') && (
                  <Empty
                    icon={Receipt}
                    title="هنوز میزبانی پایان نیافته است."
                    text="پس از تسویه و خروج مهمان، سابقهٔ حساب در این بخش می‌ماند."
                  />
                )}
              </div>
            ) : role === 'kitchen' ? (
              <div className="kitchen-grid">
                {active
                  .filter((v) =>
                    v.items.some((i) =>
                      ['preparing', 'ready'].includes(i.status),
                    ),
                  )
                  .map((v) => (
                    <article className="kitchen-ticket" key={v.id}>
                      <header>
                        <b>میز {label(v.table)}</b>
                        <span>{label(v.guests)} مهمان</span>
                        <small>{time(v.createdAt)}</small>
                      </header>
                      {v.items
                        .filter((i) =>
                          ['preparing', 'ready'].includes(i.status),
                        )
                        .map((i) => (
                          <div className="kitchen-item" key={i.id}>
                            <div className="row-between">
                              <h3>
                                <b>{label(i.quantity)} × </b>
                                {i.name}
                              </h3>
                              <span
                                className={
                                  'badge ' +
                                  (i.status === 'ready' ? 'green' : 'amber')
                                }
                              >
                                {i.status === 'ready'
                                  ? 'آماده'
                                  : 'در حال آماده‌سازی'}
                              </span>
                            </div>
                            {i.note && <p className="order-note">{i.note}</p>}
                            <small>
                              دور {label(i.round)} · {elapsed(i.updatedAt)}{' '}
                              دقیقه
                            </small>
                            {v.requests.some(
                              (r) =>
                                r.itemId === i.id && r.state !== 'resolved',
                            ) ? (
                              <p className="order-note">
                                درخواست اصلاح باز است؛ با کاپیتان هماهنگ کنید.
                              </p>
                            ) : (
                              i.status === 'preparing' && (
                                <Button
                                  className="full"
                                  disabled={busy}
                                  onClick={() =>
                                    command(
                                      {
                                        type: 'advance',
                                        visitId: v.id,
                                        itemId: i.id,
                                        status: 'ready',
                                      },
                                      'آماده بودن غذا به کاپیتان اعلام شد.',
                                    )
                                  }
                                >
                                  آمادهٔ تحویل به سالن <Check size={16} />
                                </Button>
                              )
                            )}
                          </div>
                        ))}
                    </article>
                  ))}
                {!active.some((v) =>
                  v.items.some((i) =>
                    ['preparing', 'ready'].includes(i.status),
                  ),
                ) && (
                  <Empty
                    icon={ChefHat}
                    title="آشپزخانه آمادهٔ دریافت سفارش است."
                    text="بعد از تأیید و ارسال کاپیتان، سفارش با توضیحات مهمان اینجا ظاهر می‌شود."
                  />
                )}
              </div>
            ) : (
              <div className="floor-layout">
                <section className="floor-panel">
                  <div className="section-heading">
                    <h3>نمای سالن</h3>
                    <span className="subtle">۱۲ میز</span>
                  </div>
                  <div className="table-legend">
                    <span>
                      <i className="green-dot" />
                      آزاد
                    </span>
                    <span>
                      <i className="amber-dot" />
                      در حال میزبانی
                    </span>
                    <span>
                      <i className="gray-dot" />
                      آماده‌سازی
                    </span>
                  </div>
                  <div className="table-grid">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((t) => {
                      const v = active.find((v) => v.table === t),
                        dirty = state.dirtyTables.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => switchTable(t)}
                          className={
                            'table-tile ' +
                            (table === t ? 'chosen ' : '') +
                            (v ? 'occupied' : dirty ? 'dirty' : 'free')
                          }
                        >
                          <span className="chair top-chair" />
                          <span className="chair bottom-chair" />
                          <span>میز</span>
                          <strong>{label(t)}</strong>
                          <small>
                            {v
                              ? `${label(v.guests)} مهمان`
                              : dirty
                                ? 'آماده‌سازی'
                                : 'آزاد'}
                          </small>
                          {v?.requests.some((r) => r.state !== 'resolved') && (
                            <b className="table-alert">
                              <Bell size={12} />
                            </b>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="floor-footnote">
                    <CircleHelp size={16} />
                    وضعیت پرداخت، خروج مهمان و آماده‌سازی میز جداگانه ثبت می‌شوند.
                  </div>
                </section>
                <section className="visit-panel">
                  <div className="visit-heading">
                    <div>
                      <span className="eyebrow">
                        TABLE {String(table).padStart(2, '0')}
                      </span>
                      <h2>میز {label(table)}</h2>
                    </div>
                    {visit && (
                      <span className="badge green">
                        {label(visit.guests)} مهمان · {elapsed(visit.createdAt)}{' '}
                        دقیقه
                      </span>
                    )}
                  </div>
                  {!visit ? (
                    <div className="new-visit">
                      <Users size={36} />
                      <h3>
                        {state.dirtyTables.includes(table)
                          ? 'آماده برای میزبانی بعدی؟'
                          : 'آغاز یک میزبانی تازه'}
                      </h3>
                      <p>
                        {state.dirtyTables.includes(table)
                          ? 'پس از آماده‌سازی میز، آزاد شدن آن را تأیید کنید.'
                          : 'با شروع میزبانی، یک حساب مستقل برای مهمانان این میز ایجاد می‌شود.'}
                      </p>
                      {['captain', 'manager'].includes(role) &&
                        (state.dirtyTables.includes(table) ? (
                          <Button
                            disabled={busy}
                            onClick={() => command({ type: 'clean', table })}
                          >
                            میز آماده است <Check size={16} />
                          </Button>
                        ) : (
                          <>
                            <label className="field">
                              تعداد مهمان
                              <input
                                type="number"
                                min={1}
                                max={20}
                                value={guests}
                                onChange={(e) =>
                                  setGuests(Number(e.target.value))
                                }
                              />
                            </label>
                            <Button
                              disabled={busy}
                              onClick={() =>
                                command(
                                  { type: 'open', table, guests },
                                  'میزبانی شروع شد؛ منوی مهمان آمادهٔ ثبت سفارش است.',
                                )
                              }
                            >
                              شروع میزبانی <Plus size={16} />
                            </Button>
                          </>
                        ))}
                    </div>
                  ) : (
                    <>
                      <div className="visit-toolbar">
                        {role !== 'cashier' && (
                          <button onClick={() => setStaffOrderOpen(true)}>
                            افزودن سفارش <Plus size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setRole('guest');
                            setCartOpen(false);
                          }}
                        >
                          منوی این میز <ArrowUpLeft size={14} />
                        </button>
                        <button onClick={() => setHistoryOpen(true)}>
                          سابقهٔ عملیات <Clock3 size={14} />
                        </button>
                        {role !== 'cashier' && (
                          <button onClick={() => setMoveOpen(true)}>
                            انتقال میز
                          </button>
                        )}
                      </div>
                      {visit.items.length === 0 ? (
                        <Empty
                          icon={Utensils}
                          title="مهمان در حال انتخاب است."
                          text="سفارش مهمان یا کاپیتان در حساب همین میز ثبت خواهد شد."
                        />
                      ) : (
                        <div className="order-list">
                          {visit.items.map((i) => (
                            <div
                              className={
                                'order-line ' +
                                (i.status === 'cancelled' ? 'cancelled' : '')
                              }
                              key={i.id}
                            >
                              <div className="row-between">
                                <h4>
                                  {label(i.quantity)} × {i.name}
                                </h4>
                                <span>{money(i.price * i.quantity)}</span>
                              </div>
                              <div className="row-between">
                                <span
                                  className={
                                    'badge ' +
                                    (i.status === 'served' ? 'green' : 'amber')
                                  }
                                >
                                  {statusLabels[i.status]}
                                </span>
                                <small>دور {label(i.round)}</small>
                              </div>
                              {i.note && <p className="order-note">{i.note}</p>}
                              {role !== 'cashier' && (
                                <div className="order-actions">
                                  {(
                                    ['pending', 'held', 'ready'] as string[]
                                  ).includes(i.status) && (
                                    <Button
                                      size="sm"
                                      disabled={busy}
                                      onClick={() =>
                                        command({
                                          type: 'advance',
                                          itemId: i.id,
                                          status:
                                            i.status === 'pending'
                                              ? 'held'
                                              : i.status === 'held'
                                                ? 'preparing'
                                                : 'served',
                                        })
                                      }
                                    >
                                      {i.status === 'pending'
                                        ? 'تأیید سفارش'
                                        : i.status === 'held'
                                          ? 'ارسال برای آماده‌سازی'
                                          : 'ثبت سرو'}
                                      <Check size={14} />
                                    </Button>
                                  )}
                                  {!['cancelled', 'served'].includes(
                                    i.status,
                                  ) && (
                                    <button
                                      className="text-button"
                                      onClick={() => openService(i)}
                                    >
                                      اصلاح / توضیح
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="bill-summary">
                        <div>
                          <span>جمع سفارش</span>
                          <b>
                            {money(total(visit))} <small>تومان</small>
                          </b>
                        </div>
                        <div>
                          <span>پرداخت ثبت‌شده</span>
                          <span>{money(paid(visit))} تومان</span>
                        </div>
                        <div className="bill-total">
                          <span>ماندهٔ حساب</span>
                          <b>
                            {money(due(visit))} <small>تومان</small>
                          </b>
                        </div>
                        <p>مالیات و حق سرویس در این ارائه اعمال نشده‌اند.</p>
                        {(role === 'cashier' || role === 'manager') && (
                          <Button
                            className="full"
                            disabled={busy || due(visit) === 0}
                            onClick={() => {
                              setAmount(String(due(visit)));
                              setReference('');
                              setPayOpen(true);
                            }}
                          >
                            ثبت دریافت وجه <CreditCard size={17} />
                          </Button>
                        )}
                        {(role === 'captain' || role === 'manager') && (
                          <Button
                            className="full"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              command(
                                { type: 'depart' },
                                'میزبانی پایان یافت؛ میز در انتظار آماده‌سازی است.',
                              )
                            }
                          >
                            ثبت خروج مهمان
                          </Button>
                        )}
                        <button
                          className="receipt-link"
                          onClick={() => {
                            setOrdersOpen(true);
                          }}
                        >
                          مشاهدهٔ صورتحساب <Receipt size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}
            <footer className="staff-footer">
              <span>
                CAPTAIN ORDER <b>×</b> MOYA
              </span>
              <p>محیط ارائه · پرداخت‌ها ثبت داخلی هستند و وجهی جابه‌جا نمی‌شود.</p>
            </footer>
          </main>
        </div>
      )}
      {!connected && loaded && (
        <div className="connection-banner">
          <RefreshCw size={14} />
          اتصال به اطلاعات زنده برقرار نیست؛ ثبت سفارش را پس از اتصال انجام دهید.
          <button onClick={refresh}>تلاش دوباره</button>
        </div>
      )}
      {notice && (
        <output className="toast">
          <Check size={17} />
          {notice}
        </output>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <CircleHelp size={18} />
          <span>{error}</span>
          <button aria-label="بستن پیام" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <Dialog
        open={!!detail}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
      >
        <DialogContent className="product-dialog">
          {detail && (
            <>
              <div className="detail-visual">
                <Plate item={detail} />
              </div>
              <div className="detail-body">
                <span className="eyebrow">{detail.en}</span>
                <DialogTitle>{detail.name}</DialogTitle>
                <DialogDescription>{detail.description}</DialogDescription>
                <div className="knowledge-note">
                  <CircleHelp size={17} />
                  <p>
                    مواد اولیه بر اساس منوی مویاست. برای حساسیت غذایی، کالری
                    دقیق یا تغییر روش پخت، کاپیتان با آشپزخانه هماهنگ می‌کند.
                  </p>
                </div>
                <label className="field">
                  ترجیح شما برای این غذا <small>اختیاری</small>
                  <textarea
                    maxLength={500}
                    value={itemNote}
                    onChange={(e) => setItemNote(e.target.value)}
                    placeholder="مثلاً سس جدا سرو شود؛ پس از تأیید کاپیتان"
                  />
                </label>
                <div className="detail-actions">
                  <div className="stepper">
                    <button
                      disabled={quantity <= 1}
                      onClick={() => setQuantity((q) => q - 1)}
                      aria-label="کم کردن تعداد"
                    >
                      <Minus size={16} />
                    </button>
                    <span>{label(quantity)}</span>
                    <button
                      disabled={quantity >= 20}
                      onClick={() => setQuantity((q) => q + 1)}
                      aria-label="زیاد کردن تعداد"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <Button
                    disabled={state.unavailable.includes(detail.id)}
                    onClick={() => add(detail, quantity, itemNote)}
                  >
                    افزودن به انتخاب من <b>{money(detail.price * quantity)}</b>
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={staffOrderOpen} onOpenChange={setStaffOrderOpen}>
        <DialogContent className="wide-dialog">
          <DialogTitle>ثبت سفارش توسط کاپیتان</DialogTitle>
          <DialogDescription>
            میز {label(table)} · انتخاب‌ها با همین نقش در سابقه ثبت می‌شوند.
          </DialogDescription>
          <div className="staff-menu-pick">
            {menu.map((m) => (
              <div key={m.id}>
                <span>
                  <b>{m.name}</b>
                  <small>{money(m.price)} تومان</small>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || state.unavailable.includes(m.id)}
                  onClick={() => add(m)}
                >
                  <Plus size={14} />
                  {label(
                    draft
                      .filter((d) => d.menuId === m.id)
                      .reduce((n, d) => n + d.quantity, 0),
                  )}
                </Button>
              </div>
            ))}
          </div>
          <Button
            disabled={!draft.length || busy}
            onClick={() => {
              setStaffOrderOpen(false);
              setCartOpen(true);
            }}
          >
            بررسی {label(draftCount)} انتخاب · {money(draftTotal)} تومان
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="wide-dialog">
          <DialogTitle>انتخاب شما</DialogTitle>
          <DialogDescription>
            میز {label(table)} · سفارش پس از بررسی کاپیتان برای آشپزخانه ارسال
            می‌شود.
          </DialogDescription>
          {draft.length === 0 ? (
            <Empty
              icon={ShoppingBag}
              title="هنوز انتخابی نکرده‌اید."
              text="منو را مرور کنید و طعم دلخواهتان را به اینجا بیاورید."
            />
          ) : (
            <>
              <div className="cart-lines">
                {draft.map((d, index) => {
                  const m = menu.find((m) => m.id === d.menuId)!;
                  return (
                    <div className="cart-line" key={index}>
                      <div>
                        <h4>{m.name}</h4>
                        <p>{d.note || m.category}</p>
                        <b>
                          {money(m.price * d.quantity)} <small>تومان</small>
                        </b>
                      </div>
                      <div className="stepper">
                        <button
                          disabled={busy}
                          aria-label={`کم کردن ${m.name}`}
                          onClick={() =>
                            setDraft((ds) =>
                              ds.flatMap((x, i) =>
                                i === index
                                  ? x.quantity > 1
                                    ? [{ ...x, quantity: x.quantity - 1 }]
                                    : []
                                  : [x],
                              ),
                            )
                          }
                        >
                          <Minus size={14} />
                        </button>
                        <span>{label(d.quantity)}</span>
                        <button
                          disabled={busy || d.quantity >= 20}
                          aria-label={`زیاد کردن ${m.name}`}
                          onClick={() =>
                            setDraft((ds) =>
                              ds.map((x, i) =>
                                i === index
                                  ? { ...x, quantity: x.quantity + 1 }
                                  : x,
                              ),
                            )
                          }
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="bill-total row-between">
                <span>جمع انتخاب شما</span>
                <b>
                  {money(draftTotal)} <small>تومان</small>
                </b>
              </div>
              {!visit && (
                <div className="knowledge-note">
                  کاپیتان باید ابتدا میزبانی این میز را آغاز کند.
                  <button
                    onClick={() => {
                      setCartOpen(false);
                      setPresentOpen(true);
                    }}
                  >
                    رفتن به میز کار کاپیتان
                  </button>
                </div>
              )}
              <Button
                className="full"
                disabled={busy || !connected || !visit}
                onClick={async () => {
                  if (
                    await command(
                      { type: 'order', lines: draft },
                      'سفارش شما برای بررسی کاپیتان ثبت شد.',
                    )
                  ) {
                    setDraft([]);
                    setCartOpen(false);
                    setOrdersOpen(true);
                  }
                }}
              >
                تأیید و ثبت سفارش <ArrowLeft size={17} />
              </Button>
              <p className="fineprint">
                ثبت سفارش به معنای پرداخت نیست؛ حساب میز تا پایان میزبانی باز
                می‌ماند.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={ordersOpen} onOpenChange={setOrdersOpen}>
        <DialogContent className="wide-dialog">
          <DialogTitle>سفارش‌ها و حساب میز {label(table)}</DialogTitle>
          <DialogDescription>
            آخرین وضعیت سفارش‌های این نوبت میزبانی
          </DialogDescription>
          {!visit || !visit.items.length ? (
            <Empty
              icon={Receipt}
              title="سفارشی ثبت نشده است."
              text="پس از ثبت انتخابتان، وضعیت آماده‌سازی را اینجا می‌بینید."
            />
          ) : (
            <>
              <div className="order-list">
                {visit.items.map((i) => (
                  <div className="order-line" key={i.id}>
                    <div className="row-between">
                      <h4>
                        {label(i.quantity)} × {i.name}
                      </h4>
                      <span>{money(i.quantity * i.price)}</span>
                    </div>
                    <div className="row-between">
                      <span
                        className={
                          'badge ' + (i.status === 'served' ? 'green' : 'amber')
                        }
                      >
                        {statusLabels[i.status]}
                      </span>
                      {i.status !== 'cancelled' && (
                        <button
                          className="text-button"
                          onClick={() => openService(i)}
                        >
                          درخواست اصلاح
                        </button>
                      )}
                    </div>
                    {i.note && <p className="order-note">{i.note}</p>}
                  </div>
                ))}
              </div>
              <TasteFeedback model={taste} items={visit.items} />
              <div className="bill-summary">
                <div>
                  <span>جمع سفارش</span>
                  <b>{money(total(visit))} تومان</b>
                </div>
                <div>
                  <span>پرداخت ثبت‌شده</span>
                  <span>{money(paid(visit))} تومان</span>
                </div>
                <div className="bill-total">
                  <span>مانده</span>
                  <b>{money(due(visit))} تومان</b>
                </div>
                <p>مالیات و حق سرویس در این ارائه اعمال نشده‌اند.</p>
              </div>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  command(
                    {
                      type: 'request',
                      kind: 'bill',
                      text: 'لطفاً صورتحساب میز را آماده کنید.',
                    },
                    'درخواست صورتحساب به کاپیتان رسید.',
                  )
                }
              >
                درخواست صورتحساب <Receipt size={17} />
              </Button>
              {visit.payments.map((p) => (
                <p className="payment-receipt" key={p.id}>
                  رسید {p.id.slice(0, 8)} · {money(p.amount)} تومان ·{' '}
                  {p.method === 'card' ? 'کارت' : 'نقدی'} · {time(p.at)}
                </p>
              ))}
            </>
          )}
          {visit && visit.requests.length > 0 && (
            <div className="request-timeline">
              <h4>پیگیری درخواست‌ها</h4>
              {visit.requests.map((r) => (
                <div key={r.id}>
                  <span
                    className={
                      'tiny-dot ' + (r.state === 'resolved' ? 'done' : '')
                    }
                  />
                  <p>
                    {r.text}
                    <small>
                      {r.state === 'open'
                        ? 'به کاپیتان اعلام شد'
                        : r.state === 'claimed'
                          ? `در حال رسیدگی · ${r.owner}`
                          : r.outcome}
                    </small>
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={serviceOpen} onOpenChange={setServiceOpen}>
        <DialogContent>
          <DialogTitle>
            {changeItem
              ? 'اصلاح سفارش با هماهنگی کاپیتان'
              : 'کاپیتان در کنار شماست'}
          </DialogTitle>
          <DialogDescription>
            {changeItem
              ? 'درخواست شما ثبت می‌شود؛ اجرای غذا تا هماهنگی با کاپیتان تغییر نمی‌کند.'
              : 'توضیح بیشتر، راهنمایی در انتخاب یا هر آنچه برای میزبانی بهتر نیاز دارید.'}
          </DialogDescription>
          <label className="field">
            درخواست شما
            <textarea
              maxLength={500}
              value={serviceText}
              onChange={(e) => setServiceText(e.target.value)}
              placeholder="چطور می‌توانیم همراهتان باشیم؟"
            />
          </label>
          {!visit && (
            <p className="fineprint">
              در این محیط ارائه، ابتدا کاپیتان میزبانی میز را آغاز می‌کند.
            </p>
          )}
          <Button
            disabled={busy || !visit || !serviceText.trim()}
            onClick={async () => {
              if (
                await command(
                  {
                    type: 'request',
                    kind: changeItem ? 'change' : 'help',
                    text: serviceText,
                    itemId: changeItem || undefined,
                  },
                  'درخواست شما به کاپیتان اعلام شد.',
                )
              )
                setServiceOpen(false);
            }}
          >
            ارسال درخواست <Bell size={16} />
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!activeRequest}
        onOpenChange={(o) => {
          if (!o) setActiveRequest(null);
        }}
      >
        <DialogContent className="wide-dialog">
          <DialogTitle>ثبت نتیجهٔ رسیدگی</DialogTitle>
          <DialogDescription>{activeRequest?.text}</DialogDescription>
          <label className="field">
            نتیجهٔ هماهنگی با مهمان و تیم
            <textarea
              value={outcome}
              maxLength={500}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder="آنچه توافق و انجام شد را دقیق ثبت کنید."
            />
          </label>
          {activeRequest?.kind === 'change' && (
            <>
              <label className="field">
                توضیح جدید یا پیشنهاد اصلاح غذا
                <textarea
                  maxLength={500}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                مهمان این تغییر را تأیید کرده است.
              </label>
              <div className="action-row">
                <Button
                  variant="outline"
                  disabled={busy || !consent || !outcome.trim()}
                  onClick={async () => {
                    if (
                      await command({
                        type: ['preparing', 'ready'].includes(
                          visit?.items.find(
                            (i) => i.id === activeRequest.itemId,
                          )?.status || '',
                        )
                          ? 'propose-edit'
                          : 'edit',
                        requestId: activeRequest.id,
                        guestConfirmed: true,
                        note: editNote,
                        outcome,
                      })
                    )
                      setActiveRequest(null);
                  }}
                >
                  {['preparing', 'ready'].includes(
                    visit?.items.find((i) => i.id === activeRequest.itemId)
                      ?.status || '',
                  )
                    ? 'ارسال اصلاح به آشپزخانه'
                    : 'ثبت توضیح جدید'}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !consent || !outcome.trim()}
                  onClick={async () => {
                    if (
                      await command({
                        type: ['preparing', 'ready'].includes(
                          visit?.items.find(
                            (i) => i.id === activeRequest.itemId,
                          )?.status || '',
                        )
                          ? 'propose-edit'
                          : 'edit',
                        requestId: activeRequest.id,
                        guestConfirmed: true,
                        cancel: true,
                        note: editNote || outcome,
                        outcome,
                      })
                    )
                      setActiveRequest(null);
                  }}
                >
                  {['preparing', 'ready'].includes(
                    visit?.items.find((i) => i.id === activeRequest.itemId)
                      ?.status || '',
                  )
                    ? 'درخواست لغو از آشپزخانه'
                    : 'لغو این قلم'}
                </Button>
              </div>
              <p className="fineprint">
                پس از شروع آماده‌سازی، پیشنهاد شما برای تأیید آشپزخانه ارسال
                می‌شود. تا زمان تصمیم آشپزخانه، نسخهٔ جاری غذا حفظ می‌شود.
              </p>
            </>
          )}
          <Button
            disabled={busy || !outcome.trim()}
            onClick={async () => {
              if (
                await command({
                  type: 'resolve',
                  requestId: activeRequest?.id,
                  outcome,
                })
              )
                setActiveRequest(null);
            }}
          >
            ثبت نتیجه و بستن درخواست <Check size={16} />
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!decisionRequest}
        onOpenChange={(o) => {
          if (!o) setDecisionRequest(null);
        }}
      >
        <DialogContent>
          <DialogTitle>تصمیم آشپزخانه دربارهٔ اصلاح</DialogTitle>
          <DialogDescription>
            {decisionRequest?.proposal?.cancel
              ? 'درخواست لغو غذا'
              : 'درخواست تغییر توضیحات غذا'}{' '}
            · {decisionRequest?.proposal?.note}
          </DialogDescription>
          <label className="field">
            پاسخ آشپزخانه
            <textarea
              maxLength={500}
              value={decisionOutcome}
              onChange={(e) => setDecisionOutcome(e.target.value)}
              placeholder="امکان اجرا یا دلیل عدم امکان تغییر"
            />
          </label>
          <Button
            disabled={busy || !decisionOutcome.trim()}
            onClick={async () => {
              if (
                await command({
                  type: 'kitchen-decision',
                  requestId: decisionRequest?.id,
                  approved: true,
                  outcome: decisionOutcome,
                })
              )
                setDecisionRequest(null);
            }}
          >
            پذیرش و اعمال تغییر مورد توافق <Check size={16} />
          </Button>
          <Button
            variant="outline"
            disabled={busy || !decisionOutcome.trim()}
            onClick={async () => {
              if (
                await command({
                  type: 'kitchen-decision',
                  requestId: decisionRequest?.id,
                  approved: false,
                  outcome: decisionOutcome,
                })
              )
                setDecisionRequest(null);
            }}
          >
            امکان تغییر وجود ندارد
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogTitle>ثبت دریافت وجه</DialogTitle>
          <DialogDescription>
            میز {label(table)} · ثبت داخلی پرداخت در محیط ارائه؛ به بانک متصل
            نیست.
          </DialogDescription>
          <label className="field">
            مبلغ به تومان
            <input
              type="number"
              min={1}
              max={visit ? due(visit) : 0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <Tabs
            value={method}
            onValueChange={(v) => setMethod(v as 'cash' | 'card')}
          >
            <TabsList>
              <TabsTrigger value="card">کارت بانکی</TabsTrigger>
              <TabsTrigger value="cash">نقدی</TabsTrigger>
            </TabsList>
          </Tabs>
          {method === 'card' && (
            <label className="field">
              شماره پیگیری رسید
              <input
                maxLength={80}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="شماره پیگیری، بدون اطلاعات کارت"
              />
            </label>
          )}
          <Button
            disabled={
              busy ||
              !Number(amount) ||
              (method === 'card' && !reference.trim())
            }
            onClick={async () => {
              if (
                await command(
                  {
                    type: 'payment',
                    amount: Number(amount),
                    method,
                    reference,
                  },
                  'پرداخت در حساب میز ثبت شد.',
                )
              )
                setPayOpen(false);
            }}
          >
            تأیید ثبت دریافت <Check size={16} />
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogTitle>انتقال میز با حفظ حساب</DialogTitle>
          <DialogDescription>
            سفارش‌ها و درخواست‌ها متعلق به همین میزبانی باقی می‌مانند.
          </DialogDescription>
          <label className="field">
            شمارهٔ میز مقصد
            <input
              type="number"
              min={1}
              max={12}
              value={destination}
              onChange={(e) => setDestination(Number(e.target.value))}
            />
          </label>
          <Button
            disabled={busy}
            onClick={async () => {
              if (await command({ type: 'move', table: destination })) {
                switchTable(destination);
                setMoveOpen(false);
              }
            }}
          >
            انتقال به میز {label(destination)}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="wide-dialog">
          <DialogTitle>سابقهٔ عملیات میز {label(table)}</DialogTitle>
          <DialogDescription>
            رویدادهای همین نوبت میزبانی، به ترتیب زمان
          </DialogDescription>
          <div className="event-list">
            {visit?.events
              .slice()
              .reverse()
              .map((e, i) => (
                <div key={i}>
                  <time>{time(e.at)}</time>
                  <p>
                    {e.text}
                    <small>{roleName(e.actor)}</small>
                  </p>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      <VisitArchive
        visit={state.visits.find((v) => v.id === archiveId)}
        onClose={() => setArchiveId('')}
      />
      <Dialog open={presentOpen} onOpenChange={setPresentOpen}>
        <DialogContent className="wide-dialog">
          <DialogTitle>فضای ارائهٔ کاپیتان سفارش</DialogTitle>
          <DialogDescription>
            نقش‌ها را تغییر دهید و مسیر یک سفارش را از میز مهمان تا آشپزخانه و
            صندوق دنبال کنید. داده‌ها در فضای خصوصی شما ذخیره می‌شوند.
          </DialogDescription>
          <div className="role-picker">
            {roles.map((r) => (
              <button
                key={r.id}
                className={role === r.id ? 'active' : ''}
                onClick={() => {
                  setRole(r.id);
                  setStaffTab('tables');
                  setPresentOpen(false);
                }}
              >
                <r.icon size={23} />
                <b>{r.title}</b>
                <small>{r.en}</small>
              </button>
            ))}
          </div>
          <label className="field">
            میز مورد نمایش
            <input
              type="number"
              min={1}
              max={12}
              value={table}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 1 && n <= 12) switchTable(n);
              }}
            />
          </label>
          <p className="fineprint">
            شروع ارائه: در نمای کاپیتان، یک میز را انتخاب و «شروع میزبانی» را
            بزنید. سپس در نمای مهمان سفارش بدهید.
          </p>
          <a
            className="text-button"
            href={`/?view=${role}&table=${table}`}
            target="_blank"
            rel="noreferrer"
          >
            باز کردن این نقش در نمای مستقل <ArrowUpLeft size={15} />
          </a>
        </DialogContent>
      </Dialog>
      <MenuAssistant
        key={(visit?.id || table) + ':' + JSON.stringify(taste.context)}
        tasteContext={taste.context}
        open={assistantOpen}
        setOpen={setAssistantOpen}
        unavailable={state.unavailable}
        draft={draft}
        busy={busy}
        quickAdd={(m) => {
          if (!state.unavailable.includes(m.id)) add(m);
        }}
        openCart={() => {
          setAssistantOpen(false);
          setCartOpen(true);
        }}
        add={(m) => {
          openDetail(m);
          setAssistantOpen(false);
        }}
        requestCaptain={() => {
          setAssistantOpen(false);
          openService();
        }}
      />
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Users;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-state">
      <Icon size={34} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
type Message = GuidePresentation & {
  role: 'user' | 'assistant';
  text: string;
  items?: string[];
  mode?: 'ai' | 'menu' | 'fallback';
};
function MenuAssistant({
  tasteContext,
  open,
  setOpen,
  unavailable,
  add,
  requestCaptain,
  draft,
  busy,
  quickAdd,
  openCart,
}: {
  tasteContext: TasteContext;
  open: boolean;
  setOpen: (v: boolean) => void;
  unavailable: string[];
  add: (m: MenuItem) => void;
  requestCaptain: () => void;
  draft: Draft[];
  busy: boolean;
  quickAdd: (m: MenuItem) => void;
  openCart: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text:
        tasteContext.occasion === 'cafe'
          ? 'به کافهٔ مویا خوش آمدید. قهوه، چای یا دسر؟ می‌توانم گزینه‌های منو و قیمتشان را مقایسه کنم.'
          : 'به مویا خوش آمدید. می‌توانم در انتخاب غذا یا منوی کافه کمک کنم. انتخاب امروزتان را بگویید.',
    },
  ]);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [thinking, setThinking] = useState(false);
  const [configured, setConfigured] = useState(false);
  const latest = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (open)
      void fetch('/api/guide')
        .then((r) => r.json())
        .then((d) =>
          setConfigured(Boolean((d as { configured: boolean }).configured)),
        )
        .catch(() => {});
  }, [open]);
  useEffect(() => {
    latest.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  }, [messages, thinking]);
  async function send(text: string) {
    if (!text.trim() || sending.current) return;
    sending.current = true;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setThinking(true);
    try {
      const r = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          tasteContext,
          history: messages
            .slice(-8)
            .map((m) => ({ role: m.role, text: m.text.slice(0, 1500) })),
        }),
      });
      const data = (await r.json()) as Omit<Message, 'role'>;
      if (!r.ok) throw new Error();
      setMessages((m) => [...m, { ...data, role: 'assistant' }]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: 'ارتباط راهنما برقرار نشد. می‌توانید منو را مرور کنید یا از کاپیتان کمک بگیرید.',
        },
      ]);
    } finally {
      setThinking(false);
      sending.current = false;
    }
  }
  function voice() {
    type SpeechResult = {
      results: { [key: number]: { [key: number]: { transcript: string } } };
    };
    type Recognition = {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      start: () => void;
      onresult: ((e: SpeechResult) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
    };
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const API = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!API) {
      setVoiceError(
        'این مرورگر ورودی صوتی ندارد؛ می‌توانید پیام خود را بنویسید.',
      );
      return;
    }
    const r = new API();
    r.lang = 'fa-IR';
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) => {
      setInput(e.results[0][0].transcript);
      setListening(false);
    };
    r.onerror = () => {
      setListening(false);
      setVoiceError('دسترسی به میکروفون یا سرویس گفتار برقرار نشد.');
    };
    r.onend = () => setListening(false);
    try {
      setVoiceError('');
      r.start();
      setListening(true);
    } catch {
      setListening(false);
      setVoiceError('ورودی صوتی در دسترس نیست.');
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="assistant-dialog">
        <div className="assistant-heading">
          <span className="spark-emblem">
            <Sparkles size={22} />
          </span>
          <div>
            <DialogTitle>همراه انتخاب شما</DialogTitle>
            <DialogDescription>
              راهنمای مویا · بر اساس اطلاعات منو
            </DialogDescription>
          </div>
        </div>
        <div
          className="chat-messages"
          role="log"
          aria-label="گفت‌وگو با راهنمای مویا"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={thinking}
        >
          {messages.map((m, i) => (
            <div
              ref={i === messages.length - 1 ? latest : undefined}
              key={i}
              className={'chat-message ' + m.role}
            >
              {m.role === 'assistant' && (
                <span className="chat-speaker">
                  <Sparkles size={14} /> راهنمای مویا
                </span>
              )}
              <p>{m.lead || m.text}</p>
              {m.mode === 'fallback' && (
                <small className="chat-mode-note">
                  پاسخ فعلی از راهنمای داخلی منوست.
                </small>
              )}
              <div className="chat-card-grid">
                {m.items?.map((id) => {
                  const item = menu.find((m) => m.id === id);
                  if (!item) return null;
                  const count = draft
                    .filter((d) => d.menuId === id)
                    .reduce((n, d) => n + d.quantity, 0);
                  const blocked = unavailable.includes(id);
                  return (
                    <article className="chat-menu-card" key={id}>
                      <button
                        type="button"
                        className="chat-card-image"
                        aria-label={`مشاهدهٔ ${item.name}`}
                        onClick={() => add(item)}
                      >
                        <Plate item={item} />
                        {item.image ? (
                          <span className="chat-photo-label">
                            عکس منوی مویا
                          </span>
                        ) : (
                          <span className="chat-photo-label">
                            عکس این آیتم هنوز ثبت نشده
                          </span>
                        )}
                      </button>
                      <div className="chat-card-body">
                        <span className="chat-category">{item.category}</span>
                        <h3>{item.name}</h3>
                        <p>{item.description}</p>
                        <strong className="chat-card-price">
                          {money(item.price)} <small>تومان</small>
                        </strong>
                        <div className="chat-card-actions">
                          <button
                            type="button"
                            className="chat-card-add"
                            disabled={blocked || busy || count >= 20}
                            onClick={() => quickAdd(item)}
                            aria-label={`افزودن ${item.name} به انتخاب‌ها`}
                          >
                            {count > 0 ? (
                              <Check size={16} />
                            ) : (
                              <Plus size={16} />
                            )}
                            {blocked
                              ? 'فعلاً ناموجود'
                              : count >= 20
                                ? 'سقف تعداد انتخاب'
                                : count > 0
                                  ? `${label(count)} در انتخاب‌ها · یکی دیگر`
                                  : 'به انتخابم اضافه کن'}
                          </button>
                          <button
                            type="button"
                            className="chat-card-detail"
                            onClick={() => add(item)}
                          >
                            جزئیات و توضیح سفارش <ArrowUpLeft size={14} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {m.followUp && (
                <div className="chat-follow-up">
                  <p>{m.followUp.text}</p>
                  <div>
                    {m.followUp.choices.map((choice) => (
                      <button
                        type="button"
                        key={choice}
                        disabled={thinking || i !== messages.length - 1}
                        onClick={() => send(choice)}
                      >
                        {choice}
                        <ArrowLeft size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {i === messages.length - 1 && (m.items?.length || 0) > 1 && (
                <button
                  className="chat-compare"
                  type="button"
                  disabled={thinking}
                  onClick={() =>
                    send(
                      'این گزینه‌ها را از نظر توضیحات منو و قیمت با هم مقایسه کن',
                    )
                  }
                >
                  <SlidersHorizontal size={15} /> کمکم کن بین این‌ها انتخاب کنم
                </button>
              )}
            </div>
          ))}
          {thinking && (
            <output className="thinking">
              <span className="thinking-dots" aria-hidden="true">
                •••
              </span>{' '}
              دارم انتخاب‌های منو را برایتان بررسی می‌کنم…
            </output>
          )}
        </div>
        {draft.length > 0 && (
          <button type="button" className="chat-basket" onClick={openCart}>
            <ShoppingBag size={18} />
            <span>
              {label(draft.reduce((n, d) => n + d.quantity, 0))} انتخاب شما{' '}
              <small>برای ثبت نهایی، بررسی کنید</small>
            </span>
            <ArrowLeft size={19} />
          </button>
        )}
        <div className="quick-prompts">
          {(messages.length === 1
            ? [
                ...(tasteContext.occasion === 'cafe'
                  ? ['قهوه پیشنهاد بده', 'دسر پیشنهاد بده']
                  : ['غذای دریایی می‌خواهم', 'مرغ پیشنهاد بده']),
                'تا یک میلیون تومان',
                'حساسیت غذایی دارم',
              ]
            : ['انتخاب دیگری می‌خواهم', 'منوی کافه را می‌خواهم']
          ).map((t) => (
            <button disabled={thinking} key={t} onClick={() => send(t)}>
              {t}
            </button>
          ))}
        </div>
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <button
            type="button"
            aria-label="ورودی صوتی"
            className={listening ? 'listening' : ''}
            disabled={listening}
            onClick={voice}
          >
            <Mic size={20} />
          </button>
          <input
            maxLength={500}
            aria-label="پیام شما به راهنمای مویا"
            placeholder={listening ? 'گوش می‌دهم…' : 'از سلیقه‌تان بگویید…'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={thinking || !input.trim()}
            aria-label="ارسال پیام"
          >
            <ArrowLeft size={20} />
          </button>
        </form>
        {voiceError && <p className="fineprint">{voiceError}</p>}
        <div className="assistant-footer">
          <span>
            {configured
              ? 'راهنمای هوشمند · بر اساس منوی مویا'
              : 'پاسخ‌های مبتنی بر منو؛ اتصال مدل زبانی هنوز فعال نیست.'}
          </span>
          <button onClick={requestCaptain}>
            همراهی کاپیتان <Bell size={13} />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
