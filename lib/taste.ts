import { menu, categories } from './menu.ts';

export const policyVersion = 'moya-taste-1';
export const flavorLabels = {
  mild: 'ملایم',
  spicy: 'تند',
  sweet: 'شیرین',
  sour: 'ترش',
  bitter: 'تلخ',
};
export type Flavor = keyof typeof flavorLabels;
export type Occasion = 'cafe' | 'dining' | 'both' | null;
export type Preferences = {
  categories: string[];
  flavors: Flavor[];
  avoidIds: string[];
  maxPrice: number | null;
};
export const emptyPreferences = (): Preferences => ({
  categories: [],
  flavors: [],
  avoidIds: [],
  maxPrice: null,
});
export type TasteContext = {
  occasion: Occasion;
  preferences: Preferences;
  mine: boolean;
  source: 'requested' | 'proactive';
  quick: boolean;
  suppressed: boolean;
};
export const emptyContext = (): TasteContext => ({
  occasion: null,
  preferences: emptyPreferences(),
  mine: true,
  source: 'requested',
  quick: false,
  suppressed: false,
});
export type Profile = {
  displayName: string;
  preferences: Preferences;
  revision: number;
  consentAt: string;
};
export type Knowledge = {
  itemId: string;
  revision: number;
  status: 'draft' | 'verified';
  flavors: Flavor[];
  preparationMinutes: number | null;
  businessPriority: number;
  pairings: string[];
  source: string;
  verifiedBy: string;
  verifiedAt: string | null;
  notes: string;
};
export type Feedback = {
  orderItemId: string;
  menuId: string;
  rating: 'like' | 'dislike' | 'service';
  at: string;
};
export type Candidate = {
  itemId: string;
  explicitScore: number;
  score: number;
  reasons: string[];
  evidence: string;
  businessPriority: number;
};
export type Decision = {
  id: string;
  policy: string;
  action: 'ask-occasion' | 'ask-preference' | 'recommend' | 'wait' | 'handoff';
  message: string;
  ranked: Candidate[];
  excluded: { itemId: string; reason: string }[];
  selected: string[];
  events: Record<string, string>;
  context: TasteContext;
  createdAt: string;
};
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const ids = menu.map((m) => m.id);
function list(value: unknown, allowed: string[], max = 46): string[] {
  check(
    Array.isArray(value) &&
      value.length <= max &&
      value.every((v) => typeof v === 'string' && allowed.includes(v)),
    'انتخاب‌های سلیقه معتبر نیست.',
  );
  return [...new Set(value)];
}
export function parsePreferences(value: unknown): Preferences {
  check(value && typeof value === 'object', 'سلیقه معتبر نیست.');
  const v = value as Preferences;
  check(
    v.maxPrice === null ||
      (Number.isInteger(v.maxPrice) &&
        v.maxPrice >= 1000 &&
        v.maxPrice <= 100000000),
    'سقف مبلغ معتبر نیست.',
  );
  return {
    categories: list(
      v.categories,
      categories.filter((c) => c !== 'همه'),
    ),
    flavors: list(v.flavors, Object.keys(flavorLabels), 5) as Flavor[],
    avoidIds: list(v.avoidIds, ids),
    maxPrice: v.maxPrice,
  };
}
export function parseContext(value: unknown): TasteContext {
  check(value && typeof value === 'object', 'اطلاعات مراجعه معتبر نیست.');
  const v = value as TasteContext;
  check(
    [null, 'cafe', 'dining', 'both'].includes(v.occasion) &&
      ['requested', 'proactive'].includes(v.source),
    'نوع مراجعه معتبر نیست.',
  );
  check(
    typeof v.mine === 'boolean' &&
      typeof v.quick === 'boolean' &&
      typeof v.suppressed === 'boolean',
    'اطلاعات مراجعه معتبر نیست.',
  );
  return {
    occasion: v.occasion,
    preferences: parsePreferences(v.preferences),
    mine: v.mine,
    source: v.source,
    quick: v.quick,
    suppressed: v.suppressed,
  };
}
export function inOccasion(category: string, occasion: Occasion) {
  if (occasion === 'cafe') return ['نوشیدنی گرم', 'دسر'].includes(category);
  if (occasion === 'dining') return category !== 'نوشیدنی گرم';
  return true;
}
export function parseKnowledge(value: unknown, now: string): Knowledge {
  const v = value as Knowledge;
  check(
    v && ids.includes(v.itemId) && ['draft', 'verified'].includes(v.status),
    'شناسنامه معتبر نیست.',
  );
  check(
    Number.isInteger(v.revision) && v.revision >= 0,
    'نسخهٔ شناسنامه معتبر نیست.',
  );
  for (const [s, max] of [
    [v.source, 300],
    [v.verifiedBy, 100],
    [v.notes, 1000],
  ] as const)
    check(typeof s === 'string' && s.length <= max, 'متن شناسنامه معتبر نیست.');
  check(
    v.status !== 'verified' || (v.source.trim() && v.verifiedBy.trim()),
    'برای تأیید، منبع و نام تأییدکننده لازم است.',
  );
  check(
    v.preparationMinutes === null ||
      (Number.isInteger(v.preparationMinutes) &&
        v.preparationMinutes > 0 &&
        v.preparationMinutes <= 240),
    'زمان آماده‌سازی معتبر نیست.',
  );
  check(
    Number.isInteger(v.businessPriority) &&
      v.businessPriority >= 0 &&
      v.businessPriority <= 2,
    'اولویت تجاری معتبر نیست.',
  );
  return {
    itemId: v.itemId,
    revision: v.revision,
    status: v.status,
    flavors: list(v.flavors, Object.keys(flavorLabels), 5) as Flavor[],
    preparationMinutes: v.preparationMinutes,
    businessPriority: v.businessPriority,
    pairings: list(v.pairings, ids).filter((id) => id !== v.itemId),
    source: v.source.trim(),
    verifiedBy: v.verifiedBy.trim(),
    verifiedAt: v.status === 'verified' ? now : null,
    notes: v.notes.trim(),
  };
}
export function recommend(
  context: TasteContext,
  unavailable: string[],
  knowledge: Knowledge[],
  feedback: Feedback[],
  cartIds: string[],
  id: string,
  now: string,
): Decision {
  const d: Decision = {
    id,
    policy: policyVersion,
    action: 'recommend',
    message: '',
    ranked: [],
    excluded: [],
    selected: [],
    events: {},
    context,
    createdAt: now,
  };
  if (!context.occasion)
    return {
      ...d,
      action: 'ask-occasion',
      message: 'امروز برای کافه آمده‌اید، غذا یا هر دو؟',
    };
  if (context.source === 'proactive' && (context.suppressed || context.quick))
    return {
      ...d,
      action: 'wait',
      message:
        'پیشنهاد تازه نمایش داده نمی‌شود؛ هر زمان بخواهید راهنمایی در دسترس است.',
    };
  const p = context.preferences;
  for (const item of menu) {
    const exclude = (reason: string) =>
      d.excluded.push({ itemId: item.id, reason });
    if (unavailable.includes(item.id)) {
      exclude('در حال حاضر موجود نیست');
      continue;
    }
    if (!inOccasion(item.category, context.occasion)) {
      exclude('خارج از نوع مراجعهٔ انتخاب‌شده');
      continue;
    }
    if (p.avoidIds.includes(item.id)) {
      exclude('خودتان از پیشنهادها کنار گذاشته‌اید');
      continue;
    }
    if (p.maxPrice !== null && item.price > p.maxPrice) {
      exclude('بالاتر از سقف مبلغ همین انتخاب');
      continue;
    }
    const k = knowledge.find(
      (k) => k.itemId === item.id && k.status === 'verified',
    );
    const reasons: string[] = [];
    let score = 0;
    let explicitScore = 0;
    if (p.categories.includes(item.category)) {
      score += 40;
      explicitScore += 40;
      reasons.push('از بخش مورد علاقهٔ شما');
    }
    if (k) {
      const matches = p.flavors.filter((f) => k.flavors.includes(f));
      if (matches.length) {
        score += Math.min(30, matches.length * 15);
        explicitScore += Math.min(30, matches.length * 15);
        reasons.push(
          'طعم تأییدشدهٔ ' + matches.map((f) => flavorLabels[f]).join(' و '),
        );
      }
      if (cartIds.some((id) => k.pairings.includes(id))) {
        score += 10;
        reasons.push('مکمل انتخاب فعلی با تأیید رستوران');
      }
      if (context.quick && k.preparationMinutes !== null) {
        score += Math.max(0, 15 - k.preparationMinutes / 2);
        reasons.push(
          'زمان معمول اعلام‌شدهٔ آشپزخانه: ' +
            k.preparationMinutes +
            ' دقیقه؛ زمان تحویل قطعی نیست',
        );
      }
    }
    const personal = context.mine
      ? feedback.filter((f) => f.menuId === item.id && f.rating !== 'service')
      : [];
    const balance = personal.reduce((sum, f) => {
      const ageDays = Math.max(
        0,
        (Date.parse(now) - Date.parse(f.at)) / 86400000,
      );
      const weight = Number.isFinite(ageDays) ? Math.pow(0.5, ageDays / 90) : 0;
      return sum + (f.rating === 'like' ? weight : -weight);
    }, 0);
    if (balance) {
      score += Math.max(-20, Math.min(20, balance * 10));
      reasons.push(
        balance > 0
          ? 'بر اساس بازخورد مثبت خودتان'
          : 'با درنظرگرفتن بازخورد منفی خودتان',
      );
    }
    if (!reasons.length)
      reasons.push(
        'گزینه‌ای از منوی ' +
          (context.occasion === 'cafe' ? 'کافه' : 'مویا') +
          ' در محدودهٔ انتخاب شما',
      );
    d.ranked.push({
      itemId: item.id,
      explicitScore,
      score: Math.round(score * 10) / 10,
      reasons,
      evidence: k
        ? 'ویژگی‌های تأییدشدهٔ رستوران'
        : 'دسته و قیمت منو؛ جزئیات طعم هنوز تأیید نشده',
      businessPriority: k?.businessPriority || 0,
    });
  }
  // Business priority breaks ties only; it cannot outrank a better customer fit.
  d.ranked.sort(
    (a, b) =>
      b.explicitScore - a.explicitScore ||
      b.score - a.score ||
      b.businessPriority - a.businessPriority ||
      a.itemId.localeCompare(b.itemId),
  );
  if (!d.ranked.length)
    return {
      ...d,
      action: 'handoff',
      message:
        'در گزینه‌های موجود، موردی مطابق انتخاب شما پیدا نشد؛ کاپیتان می‌تواند کمک کند.',
    };
  d.selected = d.ranked.slice(0, 3).map((c) => c.itemId);
  d.message =
    p.flavors.length &&
    !knowledge.some(
      (k) =>
        k.status === 'verified' && k.flavors.some((f) => p.flavors.includes(f)),
    )
      ? 'سلیقهٔ طعمی شما مشخص است؛ تا تأیید سرآشپز، انتخاب‌های زیر بر اساس بخش منو، مبلغ و بازخورد خودتان هستند.'
      : 'این گزینه‌ها با انتخاب فعلی شما سازگارترند.';
  return d;
}
export function portableProfile(profile: Profile) {
  return {
    format: 'captain-order-taste',
    version: 1,
    portable: { flavors: profile.preferences.flavors },
    restaurants: {
      moya: {
        categories: profile.preferences.categories,
        avoidIds: profile.preferences.avoidIds,
        maxPriceToman: profile.preferences.maxPrice,
      },
    },
    sharing: 'user-controlled-export',
  };
}
