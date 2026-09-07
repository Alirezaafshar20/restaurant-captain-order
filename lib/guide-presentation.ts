import { menu, isBeverage } from './menu.ts';
import { conversational } from './captain-tone.ts';

export const guideQuestions = [
  'none',
  'preference',
  'budget',
  'coffee_style',
  'cafe_choice',
  'occasion',
] as const;
export type GuideQuestion = (typeof guideQuestions)[number];
export type GuidePresentation = {
  lead?: string;
  followUp?: { text: string; choices: string[] };
};

export function guidePresentation(
  ids: string[],
  question: GuideQuestion = 'none',
  intent = 'recommend',
  cafe = false,
): GuidePresentation {
  const selected = ids
    .map((id) => menu.find((m) => m.id === id))
    .filter((m) => m !== undefined);
  const allDrinks =
    selected.length > 0 && selected.every((m) => isBeverage(m.category));
  let lead = selected.length
    ? intent === 'compare'
      ? 'بیاین تفاوت‌هاشون رو از روی منوی مویا ببینیم. توضیح و قیمت هر کدوم رو کنار عکسش گذاشتم.'
      : 'این گزینه‌ها به چیزی که گفتین نزدیکن. عکس و توضیحشون رو ببینین تا با هم راحت‌تر انتخاب کنیم.'
    : 'با هم انتخاب کنیم.';
  if (ids.includes('latte') && ids.includes('cappuccino')) {
    lead =
      'اگه قهوه‌تون رو با شیر بیشتری دوست دارین، لاته رو پیشنهاد می‌کنم. طبق منوی مویا، لاته ۲۲۰ میلی‌لیتر شیر داره و کاپوچینو ۱۸۰ میلی‌لیتر. عکس و مشخصات هر دو رو اینجا می‌بینین.';
  }
  // A coffee conversation must never fall back to a meat-preference question.
  const resolved =
    question === 'preference' && (allDrinks || cafe) ? 'cafe_choice' : question;
  const questions: Record<
    Exclude<GuideQuestion, 'none'>,
    { text: string; choices: string[] }
  > = {
    coffee_style: {
      text: 'قهوه با شیر می‌پسندید یا اسپرسو را بررسی کنیم؟',
      choices: ['قهوه با شیر می‌پسندم', 'اسپرسو را نشان بده'],
    },
    cafe_choice: {
      text: 'امروز بیشتر میل به قهوه دارید، چای یا دسر؟',
      choices: ['قهوه می‌خواهم', 'چای می‌خواهم', 'دسرها را ببینیم'],
    },
    occasion: {
      text: 'برای غذا همراهتان باشم یا انتخابی از منوی کافه؟',
      choices: ['منوی کافه را می‌خواهم', 'برای غذا آمده‌ام'],
    },
    preference: {
      text: 'برای انتخاب غذا، مرغ، گوشت یا غذای دریایی را بیشتر می‌پسندید؟',
      choices: [
        'مرغ را ترجیح می‌دهم',
        'گوشت را ترجیح می‌دهم',
        'غذای دریایی می‌خواهم',
      ],
    },
    budget: {
      text: 'چه محدودهٔ قیمتی برای هر انتخاب در نظر دارید؟',
      choices: [],
    },
  };
  return {
    lead: conversational(lead),
    ...(resolved !== 'none'
      ? {
          followUp: {
            text: conversational(questions[resolved].text),
            choices: questions[resolved].choices,
          },
        }
      : {}),
  };
}
