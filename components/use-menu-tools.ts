'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { menu } from '@/lib/menu';
type Line = { menuId: string; quantity: number; note: string };
type Actions = {
  unavailable: string[];
  role: string;
  draft: Line[];
  setSelection: (lines: Line[]) => void;
};
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => unknown;
};
export function useMenuTools(actions: Actions) {
  const live = useRef(actions);
  useLayoutEffect(() => {
    live.current = actions;
  });
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Tool) => {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional browser capability; the visible controls stay available. */
      }
    };
    register({
      name: 'search_moya_menu',
      title: 'Search MOYA menu',
      description:
        'Read official menu items, prices in toman and current availability. Does not assert allergens or calories.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', maxLength: 100 } },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute(input) {
        const v = input as { query?: unknown };
        if (typeof v.query !== 'string' || v.query.length > 100)
          throw new Error('query must be a string up to 100 characters');
        const q = v.query.toLowerCase();
        return menu
          .filter((m) =>
            (m.name + ' ' + m.en + ' ' + m.description)
              .toLowerCase()
              .includes(q),
          )
          .slice(0, 12)
          .map((m) => ({
            id: m.id,
            name: m.name,
            priceToman: m.price,
            description: m.description,
            available: !live.current.unavailable.includes(m.id),
          }));
      },
    });
    register({
      name: 'read_moya_selection',
      title: 'Read current selection',
      description:
        'Read the guest’s unsubmitted selection. These items are not yet ordered.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute() {
        return live.current.draft;
      },
    });
    register({
      name: 'set_moya_selection',
      title: 'Set guest selection',
      description:
        'Replace the visible unsubmitted guest selection with validated menu items. An empty list clears this draft. Opens review; does not place an order or take payment.',
      inputSchema: {
        type: 'object',
        properties: {
          lines: {
            type: 'array',
            maxItems: 30,
            items: {
              type: 'object',
              properties: {
                menuId: { type: 'string' },
                quantity: { type: 'integer', minimum: 1, maximum: 20 },
                note: { type: 'string', maxLength: 500 },
              },
              required: ['menuId', 'quantity'],
              additionalProperties: false,
            },
          },
        },
        required: ['lines'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute(input) {
        if (live.current.role !== 'guest')
          throw new Error('Open the guest view first');
        const v = input as { lines?: Line[] };
        if (!Array.isArray(v.lines) || v.lines.length > 30)
          throw new Error('Invalid selection');
        const lines = v.lines.map((l) => {
          if (
            !l ||
            !menu.some((m) => m.id === l.menuId) ||
            live.current.unavailable.includes(l.menuId) ||
            !Number.isInteger(l.quantity) ||
            l.quantity < 1 ||
            l.quantity > 20 ||
            (l.note !== undefined &&
              (typeof l.note !== 'string' || l.note.length > 500))
          )
            throw new Error('Invalid or unavailable item');
          return { menuId: l.menuId, quantity: l.quantity, note: l.note || '' };
        });
        flushSync(() => live.current.setSelection(lines));
        return { status: 'staged', lines, requiresGuestConfirmation: true };
      },
    });
    return () => lifecycle.abort();
  }, []);
}
