'use client';
import { useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  ArrowUpLeft,
  ChevronLeft,
  Search,
  X,
  Sparkles,
  SlidersHorizontal,
  Plus,
  Check,
  LayoutGrid,
} from 'lucide-react';
import { menuSections, sectionItems, searchMenu } from '@/lib/menu-navigation';
import { money, label, type MenuItem } from '@/lib/menu';

export function RestaurantMenu({
  sectionId,
  onSection,
  onItem,
  onAssistant,
  onTaste,
  unavailable,
  quantities,
  renderPhoto,
}: {
  sectionId: string | null;
  onSection: (id: string | null) => void;
  onItem: (item: MenuItem) => void;
  onAssistant: () => void;
  onTaste: () => void;
  unavailable: string[];
  quantities: Record<string, number>;
  renderPhoto: (item: MenuItem) => ReactNode;
}) {
  const [groupId, setGroupId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const section = menuSections.find((s) => s.id === sectionId);
  const group = section?.groups.find((g) => g.id === groupId);
  const searching = query.trim().length > 0;
  const allInSection = section ? sectionItems(section) : [];
  const showItems =
    searching ||
    (!!section &&
      (groupId === 'all' || !!group || section.groups.length === 1));
  const items = searching
    ? searchMenu(query)
    : group
      ? allInSection.filter((item) => group.itemIds.includes(item.id))
      : allInSection;
  const title = searching
    ? 'نتیجهٔ جست‌وجو'
    : sectionId === 'hookah'
      ? 'هوکابار'
      : group?.title || section?.title || 'منوی مویا';
  const moveToHeading = () => {
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  };
  const choose = (id: string | null) => {
    setGroupId(null);
    setQuery('');
    setSearchOpen(false);
    onSection(id);
    moveToHeading();
  };
  const selectGroup = (id: string) => {
    setGroupId(id);
    moveToHeading();
  };
  const back = () => {
    if (searching) {
      setQuery('');
      setSearchOpen(false);
    } else if (groupId) setGroupId(null);
    else choose(null);
    moveToHeading();
  };
  return (
    <section
      className="restaurant-menu"
      id="menu"
      aria-label="منوی رستوران مویا"
    >
      <div className="menu-book-toolbar">
        <button className="menu-taste-link" onClick={onTaste}>
          <SlidersHorizontal size={17} /> سلیقهٔ من
        </button>
        <button className="menu-guide-link" onClick={onAssistant}>
          <Sparkles size={17} /> کمک برای انتخاب <ArrowUpLeft size={16} />
        </button>
      </div>
      <div className="menu-book-heading">
        <div>
          <span className="menu-book-kicker" lang="en">
            {section?.en || 'MOYA CUISINE'}
          </span>
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          {!sectionId && !searching && <p>از کدوم بخش شروع کنیم؟</p>}
        </div>
        <div className="menu-heading-buttons">
          {(sectionId || searching) && (
            <button
              className="menu-square-button"
              onClick={back}
              aria-label={
                groupId ? 'بازگشت به زیرگروه‌ها' : 'بازگشت به بخش‌های منو'
              }
            >
              <ArrowRight size={21} />
            </button>
          )}
          <button
            className="menu-square-button"
            onClick={() => {
              setSearchOpen(!searchOpen);
              setQuery('');
            }}
            aria-label={searchOpen ? 'بستن جست‌وجو' : 'جست‌وجو در تمام منو'}
            aria-expanded={searchOpen}
          >
            <Search size={21} />
          </button>
        </div>
      </div>
      {searchOpen && (
        <div className="menu-book-search">
          <Search size={19} />
          <input
            aria-label="جست‌وجو در تمام غذاها و نوشیدنی‌ها"
            placeholder="نام غذا، نوشیدنی یا مواد اولیه…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button aria-label="پاک کردن جست‌وجو" onClick={() => setQuery('')}>
              <X size={19} />
            </button>
          )}
          <span>تمام منو</span>
        </div>
      )}
      {sectionId && !searching && (
        <nav className="menu-section-rail" aria-label="تغییر بخش منو">
          <button onClick={() => choose(null)}>
            <LayoutGrid size={16} /> بخش‌ها
          </button>
          {menuSections.map((s) => (
            <button
              key={s.id}
              aria-current={s.id === sectionId ? 'page' : undefined}
              onClick={() => choose(s.id)}
            >
              {s.title}
            </button>
          ))}
        </nav>
      )}
      {!sectionId && !searching && (
        <div className="menu-chapters">
          {[...menuSections.slice(0, 3), null, ...menuSections.slice(3)].map(
            (s, index) =>
              s ? (
                <button
                  className={'menu-chapter chapter-' + s.id}
                  key={s.id}
                  onClick={() => choose(s.id)}
                >
                  <span className="chapter-number" aria-hidden="true">
                    {label(index + 1).padStart(2, '۰')}
                  </span>
                  <img
                    className="chapter-icon"
                    src={s.image}
                    alt=""
                    width={104}
                    height={104}
                  />
                  <span className="chapter-title">{s.title}</span>
                  <span className="chapter-meta">
                    {label(sectionItems(s).length)} انتخاب{' '}
                    <ChevronLeft size={17} />
                  </span>
                </button>
              ) : (
                <button
                  className="menu-chapter chapter-information"
                  key="hookah"
                  onClick={() => choose('hookah')}
                >
                  <span className="chapter-number" aria-hidden="true">
                    ۰۴
                  </span>
                  <span className="chapter-information-mark" aria-hidden="true">
                    —
                  </span>
                  <span className="chapter-title">هوکابار</span>
                  <span className="chapter-meta">خارج از سفارش آنلاین</span>
                </button>
              ),
          )}
        </div>
      )}
      {sectionId === 'hookah' && !searching && (
        <div className="menu-neutral-note">
          <p>این بخش در منوی سفارش آنلاین ارائه نمی‌شود.</p>
          <button onClick={() => choose(null)}>
            بازگشت به بخش‌های منو <ArrowRight size={17} />
          </button>
        </div>
      )}
      {section && !searching && !showItems && (
        <>
          <div className="menu-category-heading">
            <p>کدوم انتخاب رو دوست دارید؟</p>
            <button onClick={() => selectGroup('all')}>
              همهٔ {section.title} <ChevronLeft size={17} />
            </button>
          </div>
          <div className="menu-category-grid">
            {section.groups.map((g) => (
              <button
                className="menu-category-tile"
                key={g.id}
                onClick={() => selectGroup(g.id)}
              >
                <img src={g.image} alt="" width={88} height={88} />
                <span>{g.title}</span>
                <small>{label(g.itemIds.length)} انتخاب</small>
              </button>
            ))}
          </div>
        </>
      )}
      {showItems && (
        <>
          <div className="menu-results-heading" aria-live="polite">
            <span>
              {label(items.length)} انتخاب {searching && 'در تمام منو'}
            </span>
            <span>قیمت‌ها به تومان</span>
          </div>
          {section && section.groups.length > 1 && !searching && (
            <nav className="menu-group-rail" aria-label="زیرگروه‌های منو">
              <button
                aria-pressed={groupId === 'all'}
                onClick={() => selectGroup('all')}
              >
                همه
              </button>
              {section.groups.map((g) => (
                <button
                  key={g.id}
                  aria-pressed={g.id === groupId}
                  onClick={() => selectGroup(g.id)}
                >
                  <img src={g.image} alt="" width={28} height={28} />
                  {g.title}
                </button>
              ))}
            </nav>
          )}
          {items.length === 0 ? (
            <div className="menu-neutral-note">
              <p>انتخابی با این نام پیدا نشد.</p>
              <button onClick={() => setQuery('')}>
                پاک کردن جست‌وجو <X size={17} />
              </button>
            </div>
          ) : (
            <div className="restaurant-dishes">
              {items.map((item) => {
                const soldOut = unavailable.includes(item.id);
                return (
                  <article className="restaurant-dish" key={item.id}>
                    <button
                      className="restaurant-dish-image"
                      onClick={() => onItem(item)}
                      aria-label={`عکس و جزئیات ${item.name}`}
                    >
                      {renderPhoto(item)}
                      {soldOut ? (
                        <span className="menu-photo-badge">امروز ناموجود</span>
                      ) : (
                        quantities[item.id] > 0 && (
                          <span className="menu-photo-badge">
                            <Check size={15} /> {label(quantities[item.id])} در
                            انتخاب شما
                          </span>
                        )
                      )}
                    </button>
                    <div className="restaurant-dish-copy">
                      {item.en && (
                        <span
                          className="restaurant-dish-en"
                          dir="ltr"
                          lang="en"
                        >
                          {item.en}
                        </span>
                      )}
                      <h2>
                        <button onClick={() => onItem(item)}>
                          {item.name}
                        </button>
                      </h2>
                      <p>{item.description}</p>
                      <div className="restaurant-dish-bottom">
                        <span className="restaurant-price">
                          {money(item.price)} <small>تومان</small>
                        </span>
                        <button
                          className="menu-add-item"
                          disabled={soldOut}
                          onClick={() => onItem(item)}
                          aria-label={`انتخاب ${item.name}`}
                        >
                          <Plus size={18} /> {soldOut ? 'ناموجود' : 'انتخاب'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      <div className="menu-book-end">
        <span /> <span lang="en">MOYA · CUISINE & CULTURE</span> <span />
      </div>
    </section>
  );
}
