import navigation from '../data/menu-navigation.json' with { type: 'json' };
import { menu, type MenuItem } from './menu.ts';

export const menuSections = navigation.sections;
export type MenuSection = (typeof menuSections)[number];
export const sectionItems = (section: MenuSection) => {
  const byId = new Map(menu.map((item) => [item.id, item]));
  return section.groups.flatMap((group) =>
    group.itemIds
      .map((id) => byId.get(id))
      .filter((item): item is MenuItem => !!item),
  );
};
export const normalizeMenuSearch = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('ي', 'ی')
    .replaceAll('ك', 'ک')
    .replace(/[\u200c\s]+/g, ' ')
    .trim();
export function searchMenu(value: string) {
  const terms = normalizeMenuSearch(value).split(' ').filter(Boolean);
  return terms.length
    ? menu.filter((item) => {
        const text = normalizeMenuSearch(
          [
            item.name,
            item.en,
            item.description,
            item.category,
            item.sourceCategory,
          ].join(' '),
        );
        return terms.every((term) => text.includes(term));
      })
    : [];
}
