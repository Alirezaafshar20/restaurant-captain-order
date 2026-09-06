import { menu } from './menu.ts';
export type Role = 'guest' | 'captain' | 'kitchen' | 'cashier' | 'manager';
export type Status =
  | 'pending'
  | 'held'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled';
export const statusLabels: Record<Status, string> = {
  pending: 'منتظر تأیید کاپیتان',
  held: 'تأیید شده · منتظر ارسال',
  preparing: 'در حال آماده‌سازی',
  ready: 'آمادهٔ سرو',
  served: 'سرو شده',
  cancelled: 'لغو شده',
};
export type OrderItem = {
  id: string;
  menuId: string;
  name: string;
  price: number;
  quantity: number;
  note: string;
  status: Status;
  round: number;
  createdAt: string;
  updatedAt: string;
};
export type ServiceRequest = {
  id: string;
  kind: 'help' | 'change' | 'bill';
  text: string;
  itemId?: string;
  state: 'open' | 'claimed' | 'resolved';
  owner?: string;
  outcome?: string;
  createdAt: string;
  proposal?: {
    note: string;
    cancel: boolean;
    guestConfirmed: true;
    at: string;
  };
  kitchenDecision?: 'approved' | 'rejected';
};
export type Visit = {
  id: string;
  table: number;
  guests: number;
  phase: 'open' | 'departed';
  items: OrderItem[];
  requests: ServiceRequest[];
  payments: {
    id: string;
    amount: number;
    method: 'cash' | 'card';
    reference: string;
    at: string;
  }[];
  events: { at: string; actor: Role; text: string }[];
  createdAt: string;
};
export type Workspace = {
  revision: number;
  visits: Visit[];
  unavailable: string[];
  dirtyTables: number[];
  receipts: string[];
};
export type Command = {
  type: string;
  commandId: string;
  role: Role;
  visitId?: string;
  [key: string]: unknown;
};
export const initialState = (): Workspace => ({
  revision: 0,
  visits: [],
  unavailable: [],
  dirtyTables: [],
  receipts: [],
});
export const total = (v: Visit) =>
  v.items
    .filter((i) => i.status !== 'cancelled')
    .reduce((n, i) => n + i.price * i.quantity, 0);
export const paid = (v: Visit) => v.payments.reduce((n, p) => n + p.amount, 0);
export const due = (v: Visit) => total(v) - paid(v);
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function str(value: unknown, max = 500) {
  check(
    typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    'متن درخواست معتبر نیست.',
  );
  return value.trim();
}
function integer(value: unknown, min: number, max: number) {
  check(
    Number.isInteger(value) && Number(value) >= min && Number(value) <= max,
    'مقدار واردشده معتبر نیست.',
  );
  return Number(value);
}
function permit(role: Role, roles: Role[]) {
  check(roles.includes(role), 'این عملیات در این نقش مجاز نیست.');
}
export function execute(
  previous: Workspace,
  command: Command,
  now = new Date().toISOString(),
  uuid = () => crypto.randomUUID(),
): Workspace {
  check(/^[\w-]{16,80}$/.test(command.commandId), 'شناسهٔ درخواست معتبر نیست.');
  check(
    ['guest', 'captain', 'kitchen', 'cashier', 'manager'].includes(
      command.role,
    ),
    'نقش معتبر نیست.',
  );
  if (previous.receipts.includes(command.commandId)) return previous;
  check(
    previous.receipts.length < 20000,
    'ظرفیت این فضای ارائه تکمیل شده است.',
  );
  const s: Workspace = structuredClone(previous);
  const c = command;
  const role = c.role;
  if (c.type === 'open') {
    permit(role, ['captain', 'manager']);
    const table = integer(c.table, 1, 12);
    const guests = integer(c.guests, 1, 20);
    check(
      !s.visits.some((v) => v.table === table && v.phase === 'open') &&
        !s.dirtyTables.includes(table),
      'این میز هنوز آمادهٔ پذیرش نیست.',
    );
    check(s.visits.length < 200, 'ظرفیت فضای ارائه تکمیل شده است.');
    s.visits.push({
      id: uuid(),
      table,
      guests,
      phase: 'open',
      items: [],
      requests: [],
      payments: [],
      events: [{ at: now, actor: role, text: 'شروع میزبانی' }],
      createdAt: now,
    });
  } else if (c.type === 'availability') {
    permit(role, ['kitchen', 'manager']);
    const id = str(c.menuId, 80);
    check(
      menu.some((m) => m.id === id),
      'غذا یافت نشد.',
    );
    check(typeof c.available === 'boolean', 'وضعیت موجودی معتبر نیست.');
    s.unavailable = c.available
      ? s.unavailable.filter((m) => m !== id)
      : [...new Set([...s.unavailable, id])];
  } else if (c.type === 'clean') {
    permit(role, ['captain', 'manager']);
    const table = integer(c.table, 1, 12);
    check(s.dirtyTables.includes(table), 'میز در انتظار آماده‌سازی نیست.');
    s.dirtyTables = s.dirtyTables.filter((t) => t !== table);
  } else {
    const v = s.visits.find((v) => v.id === c.visitId);
    check(v && v.phase === 'open', 'این نوبت میزبانی فعال نیست.');
    let event = '';
    if (c.type === 'order') {
      permit(role, ['guest', 'captain', 'manager']);
      check(due(v) >= 0, 'حساب نیاز به بررسی دارد.');
      check(
        Array.isArray(c.lines) && c.lines.length > 0 && c.lines.length <= 30,
        'انتخاب غذا معتبر نیست.',
      );
      check(
        v.items.length + c.lines.length <= 150,
        'تعداد اقلام این حساب به سقف رسیده است.',
      );
      const round = Math.max(0, ...v.items.map((i) => i.round)) + 1;
      for (const line of c.lines) {
        check(line && typeof line === 'object', 'انتخاب معتبر نیست.');
        const m = menu.find((m) => m.id === line.menuId);
        check(
          m && !s.unavailable.includes(m.id),
          'یکی از غذاها در حال حاضر موجود نیست.',
        );
        const quantity = integer(line.quantity, 1, 20);
        const note = typeof line.note === 'string' ? line.note.trim() : '';
        check(note.length <= 500, 'توضیحات حداکثر ۵۰۰ کاراکتر است.');
        v.items.push({
          id: uuid(),
          menuId: m.id,
          name: m.name,
          price: m.price,
          quantity,
          note,
          status: 'pending',
          round,
          createdAt: now,
          updatedAt: now,
        });
      }
      event = `ثبت دور ${round} سفارش؛ منتظر تأیید کاپیتان`;
    } else if (c.type === 'advance') {
      const item = v.items.find((i) => i.id === c.itemId);
      check(item, 'قلم سفارش یافت نشد.');
      const next = c.status as Status;
      const routes: Partial<Record<Status, { to: Status; roles: Role[] }>> = {
        pending: { to: 'held', roles: ['captain', 'manager'] },
        held: { to: 'preparing', roles: ['captain', 'manager'] },
        preparing: { to: 'ready', roles: ['kitchen', 'manager'] },
        ready: { to: 'served', roles: ['captain', 'manager'] },
      };
      const r = routes[item.status];
      check(r && r.to === next, 'وضعیت سفارش تغییر کرده؛ صفحه را به‌روز کنید.');
      permit(role, r.roles);
      check(
        !v.requests.some(
          (r) =>
            r.itemId === item.id &&
            r.kind === 'change' &&
            r.state !== 'resolved',
        ),
        'ابتدا درخواست اصلاح این غذا را تعیین تکلیف کنید.',
      );
      if (next === 'held' || next === 'preparing')
        check(
          !s.unavailable.includes(item.menuId),
          'این غذا ناموجود شده است. ابتدا با مهمان هماهنگ کنید.',
        );
      item.status = next;
      item.updatedAt = now;
      event = `${item.name}: ${statusLabels[next]}`;
    } else if (c.type === 'request') {
      permit(role, ['guest', 'captain', 'manager']);
      check(
        ['help', 'change', 'bill'].includes(String(c.kind)),
        'نوع درخواست معتبر نیست.',
      );
      const text = str(c.text);
      const itemId = c.itemId ? str(c.itemId, 80) : undefined;
      if (c.kind === 'change')
        check(
          itemId &&
            v.items.some((i) => i.id === itemId && i.status !== 'cancelled'),
          'غذای مورد اصلاح را انتخاب کنید.',
        );
      check(
        v.requests.filter((r) => r.state !== 'resolved').length < 20,
        'درخواست‌های قبلی در حال رسیدگی هستند.',
      );
      v.requests.push({
        id: uuid(),
        kind: c.kind as ServiceRequest['kind'],
        text,
        itemId,
        state: 'open',
        createdAt: now,
      });
      event = `درخواست مهمان: ${text}`;
    } else if (c.type === 'propose-edit') {
      permit(role, ['captain', 'manager']);
      const r = v.requests.find((r) => r.id === c.requestId);
      check(
        r && r.kind === 'change' && r.state === 'claimed' && !r.proposal,
        'درخواست باید پذیرفته شده و منتظر پیشنهاد اصلاح باشد.',
      );
      const i = v.items.find((i) => i.id === r.itemId);
      check(
        i && ['preparing', 'ready'].includes(i.status),
        'این غذا در مرحلهٔ قابل هماهنگی با آشپزخانه نیست.',
      );
      check(
        c.guestConfirmed === true && paid(v) === 0,
        'تأیید مهمان و حساب بدون پرداخت برای این اصلاح لازم است.',
      );
      r.proposal = {
        note: str(c.note),
        cancel: c.cancel === true,
        guestConfirmed: true,
        at: now,
      };
      event = `پیشنهاد اصلاح ${i.name} برای تأیید آشپزخانه؛ نسخهٔ جاری حفظ شد`;
    } else if (c.type === 'kitchen-decision') {
      permit(role, ['kitchen', 'manager']);
      const r = v.requests.find((r) => r.id === c.requestId);
      check(
        r && r.state === 'claimed' && r.proposal && !r.kitchenDecision,
        'پیشنهاد فعالی برای بررسی آشپزخانه وجود ندارد.',
      );
      check(typeof c.approved === 'boolean', 'تصمیم آشپزخانه معتبر نیست.');
      const outcome = str(c.outcome);
      const i = v.items.find((i) => i.id === r.itemId);
      check(
        i && ['preparing', 'ready'].includes(i.status),
        'مرحلهٔ آماده‌سازی تغییر کرده است.',
      );
      if (c.approved) {
        check(paid(v) === 0, 'پس از پرداخت، اصلاح مالی نیازمند برگشت وجه است.');
        if (r.proposal.cancel) i.status = 'cancelled';
        else {
          i.note = r.proposal.note;
          i.status = 'preparing';
        }
        i.updatedAt = now;
      }
      r.kitchenDecision = c.approved ? 'approved' : 'rejected';
      r.outcome =
        (c.approved
          ? 'آشپزخانه تغییر مورد تأیید مهمان را پذیرفت: '
          : 'آشپزخانه امکان تغییر را تأیید نکرد: ') + outcome;
      // Rejections remain owned by the captain until the guest is informed.
      if (c.approved) r.state = 'resolved';
      event = r.outcome;
    } else if (
      c.type === 'claim' ||
      c.type === 'resolve' ||
      c.type === 'edit'
    ) {
      permit(role, ['captain', 'manager']);
      const r = v.requests.find((r) => r.id === c.requestId);
      check(r && r.state !== 'resolved', 'درخواست قبلاً رسیدگی شده است.');
      if (c.type === 'claim') {
        check(r.state === 'open', 'درخواست قبلاً پذیرفته شده است.');
        r.state = 'claimed';
        r.owner = role === 'manager' ? 'مدیر شیفت' : 'کاپیتان سالن';
        event = `پذیرش درخواست: ${r.text}`;
      } else {
        check(r.state === 'claimed', 'ابتدا مسئولیت درخواست را بپذیرید.');
        check(
          !r.proposal || r.kitchenDecision,
          'هنوز منتظر تصمیم آشپزخانه هستیم.',
        );
        const outcome = str(c.outcome);
        if (c.type === 'edit') {
          check(
            r.kind === 'change' && c.guestConfirmed === true,
            'تأیید مهمان برای اصلاح الزامی است.',
          );
          const i = v.items.find((i) => i.id === r.itemId);
          check(i && i.status !== 'cancelled', 'قلم سفارش قابل اصلاح نیست.');
          check(
            !['preparing', 'ready', 'served'].includes(i.status),
            'غذا وارد آماده‌سازی شده است؛ نتیجه را با آشپزخانه هماهنگ و در درخواست ثبت کنید. تغییر مستقیم مجاز نیست.',
          );
          check(
            paid(v) === 0,
            'بعد از ثبت پرداخت، اصلاح مالی نیاز به فرایند برگشت وجه دارد.',
          );
          if (c.cancel === true) i.status = 'cancelled';
          else i.note = str(c.note);
          i.updatedAt = now;
        }
        r.state = 'resolved';
        r.outcome = outcome;
        event = `نتیجهٔ درخواست: ${outcome}`;
      }
    } else if (c.type === 'payment') {
      permit(role, ['cashier', 'manager']);
      check(
        v.items.length > 0 &&
          v.items.every(
            (i) => i.status === 'served' || i.status === 'cancelled',
          ),
        'برای تسویه، وضعیت سرو همهٔ غذاها باید مشخص باشد.',
      );
      check(
        !v.requests.some((r) => r.kind === 'change' && r.state !== 'resolved'),
        'درخواست اصلاح باز وجود دارد.',
      );
      const amount = integer(c.amount, 1, due(v));
      check(
        c.method === 'cash' || c.method === 'card',
        'روش پرداخت معتبر نیست.',
      );
      const reference = c.method === 'card' ? str(c.reference, 80) : 'نقدی';
      v.payments.push({
        id: uuid(),
        amount,
        method: c.method,
        reference,
        at: now,
      });
      event = `ثبت پرداخت ${amount} تومان (${c.method === 'card' ? 'کارت' : 'نقد'})`;
    } else if (c.type === 'depart') {
      permit(role, ['captain', 'manager']);
      check(
        due(v) === 0 &&
          v.items.every((i) => ['served', 'cancelled'].includes(i.status)),
        'حساب یا سرو سفارش هنوز تکمیل نشده است.',
      );
      check(
        v.requests.every((r) => r.state === 'resolved'),
        'درخواست باز مهمان را تعیین تکلیف کنید.',
      );
      v.phase = 'departed';
      s.dirtyTables.push(v.table);
      event = 'پایان میزبانی؛ میز در انتظار آماده‌سازی';
    } else if (c.type === 'move') {
      permit(role, ['captain', 'manager']);
      const table = integer(c.table, 1, 12);
      check(
        !s.visits.some((v) => v.phase === 'open' && v.table === table) &&
          !s.dirtyTables.includes(table),
        'میز مقصد آماده نیست.',
      );
      event = `انتقال از میز ${v.table} به ${table}؛ حساب حفظ شد`;
      s.dirtyTables.push(v.table);
      v.table = table;
    } else throw new Error('عملیات شناخته‌شده نیست.');
    v.events.push({ at: now, actor: role, text: event });
  }
  s.receipts.push(c.commandId);
  s.revision++;
  return s;
}
