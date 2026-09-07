import catalog from '../data/menu-catalog.json' with { type: 'json' };
export type MenuItem = {
  id: string;
  name: string;
  en: string;
  category: string;
  price: number;
  description: string;
  image?: string;
  sourceId: string;
  sourceCategory: string;
  sourceSection: string;
  sourceCategoryId: string;
};
export const categories = [
  'همه',
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
export const cafeCategories = ['نوشیدنی گرم', 'نوشیدنی سرد', 'دسر'];
export const isBeverage = (category: string) =>
  ['نوشیدنی گرم', 'نوشیدنی سرد'].includes(category);
export const menu: MenuItem[] = catalog.items;
export const menuSource = catalog.source;
export const menuImportedAt = catalog.importedAt;
export const money = (n: number) => new Intl.NumberFormat('fa-IR').format(n);
export const label = money;
