import { menu, money } from './menu.ts';
const normalize = (t: string) =>
  t
    .toLowerCase()
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[‌\s]+/g, ' ')
    .trim();
export function guide(text: string, unavailable: string[] = []) {
  const t = normalize(text);
  const available = menu.filter((m) => !unavailable.includes(m.id));
  if (/بدون|نمی.?خوا|دوست ندار|نه /.test(t))
    return {
      text: 'برای کنار گذاشتن یک ماده یا انتخاب مطابق محدودیت شما، ترکیب سس‌ها و شیوهٔ آماده‌سازی هم مهم است. راهنمای فعلی نبودن آن ماده را تضمین نمی‌کند؛ کاپیتان می‌تواند با آشپزخانه هماهنگ کند.',
      items: [],
    };
  if (/حساسیت|آلرژ|الرژ|گلوتن|باردار|دیابت|بیماری|رژیم پزشکی/.test(t))
    return {
      text: 'برای حساسیت یا محدودیت پزشکی، اطلاعات منو برای تأیید ایمنی غذا کافی نیست. کاپیتان باید مواد اولیه، سس‌ها و احتمال تماس متقاطع را با آشپزخانه بررسی کند. لطفاً از «همراهی کاپیتان» استفاده کنید؛ بدون این تأیید، غذایی را ایمن اعلام نمی‌کنم.',
      items: [],
    };
  if (/کالری|پروتئین|کربوهیدرات|ارزش غذایی/.test(t))
    return {
      text: 'اطلاعات تأییدشدهٔ کالری و ارزش غذایی هنوز از آشپز مویا دریافت نشده است. از روی نام یا عکس غذا عددی تخمین نمی‌زنم. کاپیتان می‌تواند مقدار و ترکیبات را برایتان بررسی کند.',
      items: [],
    };
  const mentions = available.filter(
    (m) => t.includes(normalize(m.name)) || t.includes(m.en.toLowerCase()),
  );
  if (mentions.length)
    return {
      text:
        mentions
          .slice(0, 3)
          .map((m) => `${m.name} · ${money(m.price)} تومان\n${m.description}`)
          .join('\n\n') +
        '\n\nروش پخت یا تغییرات خارج از توضیحات منو، نیاز به تأیید کاپیتان دارد.',
      items: mentions.slice(0, 3).map((m) => m.id),
    };
  if (/وگان|گیاه|بدون گوشت/.test(t))
    return {
      text: 'می‌توانم گزینه‌های دارای سبزیجات را معرفی کنم، اما وگان یا گیاه‌خواری آن‌ها را بدون تأیید آشپزخانه تضمین نمی‌کنم؛ سس‌ها ممکن است مواد حیوانی داشته باشند. حتی «وگن پوتیتو» در منو با سس ماست آمده است. کاپیتان برای انتخاب مطابق محدودیت شما کمک می‌کند.',
      items: [],
    };
  let candidates = available;
  let reason = 'از منوی مویا، این گزینه‌ها را می‌توانید بررسی کنید:';
  if (/دریایی|ماهی|میگو/.test(t)) {
    candidates = available.filter((m) =>
      /ماهی|میگو|سیبس|اسکوید/.test(m.description + ' ' + m.name),
    );
    reason = 'برای انتخاب دریایی، این غذاها در منو وجود دارند:';
  } else if (/مرغ|چیکن/.test(t)) {
    candidates = available.filter(
      (m) =>
        /مرغ|جوجه/.test(m.description + ' ' + m.name) &&
        ['غذای اصلی', 'پاستا', 'کباب'].includes(m.category),
    );
    reason = 'برای طعم مرغ، این انتخاب‌ها روش‌های پخت متفاوتی دارند:';
  } else if (/استیک|گوشت|گوساله/.test(t)) {
    candidates = available.filter(
      (m) =>
        m.category === 'غذای اصلی' &&
        /گوساله|ریب آی|فیله|تام‌هاوک/.test(m.description),
    );
    reason = 'اگر گوشت ترجیح می‌دهید، این گزینه‌های منو را ببینید:';
  } else if (/دسر|شیرین/.test(t)) {
    candidates = available.filter((m) => m.category === 'دسر');
    reason = 'برای پایان میزبانی، این دسرها در منو هستند:';
  } else if (/قهوه|نوشیدنی|چای/.test(t)) {
    candidates = available.filter((m) => m.category === 'نوشیدنی گرم');
    reason = 'از بخش نوشیدنی‌های گرم مویا:';
  } else if (/سالاد|سبک/.test(t)) {
    candidates = available.filter((m) => m.category === 'سالاد');
    reason =
      'می‌توانید سالادهای مویا را بررسی کنید؛ عنوان سالاد به معنای کم‌کالری بودن نیست:';
  } else if (/پاستا/.test(t)) {
    candidates = available.filter((m) => m.category === 'پاستا');
    reason = 'از پاستاهای مویا، این گزینه‌ها را ببینید:';
  } else if (/پیتزا/.test(t)) {
    candidates = available.filter((m) => m.category === 'پیتزا');
    reason = 'برای پیتزا، این ترکیب‌ها در منو موجودند:';
  } else if (/سلام|درود/.test(t))
    return {
      text: 'خوش آمدید. غذای گوشتی، مرغ، دریایی یا پیش‌غذا را ترجیح می‌دهید؟ می‌توانید نام یک غذا را بنویسید تا مواد اولیه و قیمت آن را ببینید.',
      items: [],
    };
  else if (!/تومان|میلیون|هزار|ارزان|اقتصادی|پیشنهاد/.test(t))
    return {
      text: 'اطلاعات من به همین منو محدود است. نام غذا یا ترجیحتان مثل «مرغ»، «دریایی»، «پاستا» یا «تا یک میلیون تومان» را بنویسید. برای پرسش دقیق دربارهٔ روش طبخ، کاپیتان از آشپزخانه پاسخ می‌گیرد.',
      items: [],
    };
  if (/یک میلیون|۱ میلیون|1 میلیون/.test(t)) {
    candidates = candidates.filter((m) => m.price <= 1000000);
    reason = 'از گزینه‌های تا یک میلیون تومان، این موارد در منو هستند:';
  } else if (/دو میلیون|۲ میلیون|2 میلیون/.test(t)) {
    candidates = candidates.filter((m) => m.price <= 2000000);
    reason += ' سقف دو میلیون تومان را در نظر گرفتم.';
  } else if (/ارزان|اقتصادی/.test(t))
    candidates = candidates.toSorted((a, b) => a.price - b.price);
  if (!candidates.length)
    return {
      text: 'در گزینه‌های فعلاً موجود، انتخابی مطابق این درخواست پیدا نکردم. کاپیتان می‌تواند امکان جایگزینی یا تغییر را بررسی کند.',
      items: [],
    };
  return {
    text:
      reason +
      '\n' +
      candidates
        .slice(0, 3)
        .map((m) => `${m.name}: ${m.description}`)
        .join('\n'),
    items: candidates.slice(0, 3).map((m) => m.id),
  };
}
