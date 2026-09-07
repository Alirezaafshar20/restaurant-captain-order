import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

// Run from the project root. Uses only the official public menu and its image endpoint.
const source =
  'https://moyacuisine.com/menu-home/moya/' + encodeURIComponent('فارسی');
const inputFile = process.argv[2];
const html = inputFile
  ? readFileSync(inputFile, 'utf8')
  : await fetch(source, { signal: AbortSignal.timeout(30000) }).then(
      async (r) => {
        if (!r.ok) throw new Error('Official menu is unavailable');
        return r.text();
      },
    );
const roots = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter((m) => m[1].includes('application/json'))
  .map((m) => JSON.parse(m[2]));
const raw = roots.map((r) => r['menu-data-moya-فارسی']).find(Boolean);
if (!raw?.foods?.length || !raw.categories?.length)
  throw new Error('Unrecognized source schema');
const legacy = JSON.parse(readFileSync('data/menu-legacy-ids.json', 'utf8'));
const sourceCategories = new Map(raw.categories.map((c) => [c.businessId, c]));
const foodCategories = {
  'غذای اصلی': 'غذای اصلی',
  'پیش غذا': 'پیش‌غذا',
  سالاد: 'سالاد',
  پاستا: 'پاستا',
  پیتزاها: 'پیتزا',
  'کباب ها': 'کباب',
};
const categoryOrder = [
  'غذای اصلی',
  'پیش‌غذا',
  'سالاد',
  'پاستا',
  'پیتزا',
  'کباب',
  'نوشیدنی گرم',
  'نوشیدنی سرد',
  'دسر',
  'صبحانه',
];
function categoryOf(c) {
  if (c.sectionTitle.startsWith('بار گرم')) return 'نوشیدنی گرم';
  if (c.sectionTitle.startsWith('بار سرد')) return 'نوشیدنی سرد';
  if (c.sectionTitle.startsWith('دسر')) return 'دسر';
  if (c.sectionTitle.startsWith('صبحانه')) return 'صبحانه';
  if (c.sectionTitle.startsWith('غذا')) return foodCategories[c.title];
  return null; // Only food and beverage sections belong in this ordering catalog.
}
function plain(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
const items = [
  ...new Map(raw.foods.map((f) => [f.businessId, f])).values(),
].flatMap((f) => {
  const c = sourceCategories.get(f.foodCategoryBusinessID);
  if (!c) throw new Error('Missing category for ' + f.id);
  const category = categoryOf(c);
  if (!category || !f.isActive || !f.branchIsActive || !c.isActive) return [];
  const sourceDescription = plain(f.titles[0].foodDescription || '');
  // Tobacco/nicotine products are outside the food ordering catalog.
  if (/تنباکو|نیکوتین|nicotine|tobacco/i.test(f.alias + sourceDescription))
    return [];
  const price = f.prices.find((p) => p.currency === 'تومان')?.amount;
  if (!Number.isSafeInteger(price) || price <= 0)
    throw new Error('Missing price for ' + f.id);
  const title = plain(f.titles[0].foodTitle)
    .split('|')
    .map((s) => s.trim());
  const imageFile = (f.images.find((i) => i.mainImage) || f.images[0])?.image;
  if (imageFile && !/^[a-f0-9]+\.(jpg|jpeg|png|webp)$/i.test(imageFile))
    throw new Error('Invalid image filename');
  const old = legacy[f.businessId];
  return [
    {
      id: old?.id || 'moya-' + f.businessId,
      sourceId: f.businessId,
      name: old?.name || title[0],
      en: old?.en || title[1] || '',
      category,
      sourceCategory: c.title,
      sourceSection: c.sectionTitle,
      sourceCategoryId: c.businessId,
      price,
      description:
        (f.alias.startsWith('مویا واین گلس')
          ? 'تخمیر ۱۲ روزهٔ کرنبری، رویبوش، توت‌فرنگی و آلبالو با پایهٔ کمبوجا و کفیر؛ سرو در گیلاس تک‌نفره.'
          : sourceDescription) ||
        'توضیحات مواد اولیه در منوی منتشرشده درج نشده است.',
      ...(imageFile ? { image: '/menu/' + imageFile } : {}),
      sourceAvailable: Boolean(f.isAvailable),
      priority: f.priority,
    },
  ];
});
for (const { id } of Object.values(legacy)) {
  if (!items.some((m) => m.id === id))
    throw new Error('Existing order reference would be lost: ' + id);
}
items.sort(
  (a, b) =>
    categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) ||
    a.priority - b.priority,
);
const sectionDefinitions = [
  { id: 'food', prefix: 'غذا', title: 'غذاها', en: 'FOOD', cover: 'غذای اصلی' },
  {
    id: 'hot',
    prefix: 'بار گرم',
    title: 'بار گرم',
    en: 'HOT BAR',
    cover: 'Europe',
  },
  {
    id: 'cold',
    prefix: 'بار سرد',
    title: 'بار سرد',
    en: 'COLD BAR',
    cover: 'Europe',
  },
  { id: 'dessert', prefix: 'دسر', title: 'دسر', en: 'DESSERT', cover: 'کیک' },
  {
    id: 'breakfast',
    prefix: 'صبحانه',
    title: 'صبحانه',
    en: 'BREAKFAST',
    cover: 'کلاسیک‌های قاره‌ای Continental Classics',
  },
];
const translations = {
  africa: 'آفریقا',
  europe: 'اروپا',
  america: 'آمریکا',
  japan: 'ژاپن',
  'middle east': 'خاورمیانه',
  'moya signatures': 'صبحانه‌های ویژهٔ مویا',
  'healthy & fit': 'سبک و سالم',
  'asian morning vibes': 'صبحانه‌های آسیایی',
  'american comforts': 'صبحانه‌های آمریکایی',
  'کلاسیک‌های قاره‌ای continental classics': 'کلاسیک‌های قاره‌ای',
};
const sections = sectionDefinitions.map(({ prefix, cover, ...section }) => {
  const groups = raw.categories
    .filter((c) => c.isActive && c.sectionTitle.startsWith(prefix))
    .sort((a, b) => a.priority - b.priority)
    .map((c) => {
      const ids = items
        .filter((m) => m.sourceCategoryId === c.businessId)
        .map((m) => m.id);
      if (!/^[a-f0-9]+\.(jpg|jpeg|png|webp)$/i.test(c.headerImageUrl))
        throw new Error('Invalid category image');
      return {
        id: c.businessId,
        title:
          translations[c.title.toLowerCase()] ||
          foodCategories[c.title] ||
          c.title,
        sourceTitle: c.title,
        image: '/menu/' + c.headerImageUrl,
        itemIds: ids,
      };
    })
    .filter((c) => c.itemIds.length);
  return {
    ...section,
    image: (groups.find((c) => c.sourceTitle === cover) || groups[0]).image,
    groups,
  };
});
const queue = [
  ...new Set(
    [
      ...items.map((m) => m.image),
      ...sections.flatMap((s) => s.groups.map((c) => c.image)),
    ].filter(Boolean),
  ),
].filter((path) => !existsSync('public' + path));
let completed = 0;
const failed = [];
mkdirSync('public/menu', { recursive: true });
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const path = queue.shift();
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await fetch(
            'https://moyacuisine.com/api/images/' + path.split('/').pop(),
            { signal: AbortSignal.timeout(25000) },
          );
          if (!r.ok || !r.headers.get('content-type')?.startsWith('image/'))
            throw new Error('Image unavailable');
          const bytes = Buffer.from(await r.arrayBuffer());
          if (bytes.length < 100 || bytes.length > 12_000_000)
            throw new Error('Invalid image size');
          writeFileSync('public' + path, bytes);
          completed++;
          if (completed % 15 === 0)
            console.log(JSON.stringify({ imagesDownloaded: completed }));
          break;
        } catch {
          if (attempt === 1) failed.push(path);
        }
      }
    }
  }),
);
if (failed.length)
  throw new Error('Retry sync; missing images: ' + failed.join(', '));
const snapshot = { source, importedAt: new Date().toISOString(), items };
writeFileSync(
  'data/menu-catalog.json',
  JSON.stringify(snapshot, null, 2) + '\n',
);
writeFileSync(
  'data/menu-navigation.json',
  JSON.stringify({ source, sections }, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    items: items.length,
    withImage: items.filter((m) => m.image).length,
    categories: Object.fromEntries(
      categoryOrder.map((c) => [
        c,
        items.filter((m) => m.category === c).length,
      ]),
    ),
  }),
);
