export const captainTone = `Speak Persian as a warm, attentive, professional host at MOYA, a luxury cafe-restaurant in Tehran. Use fluent conversational Iranian Persian, not bureaucratic or literary wording. Say «می‌تونم»، «می‌خواین»، «براتون»، «دوست دارین»، «ببینیم» instead of «می‌توانم»، «می‌خواهید»، «برایتان»، «می‌پسندید». Keep respectful plural address; no forced slang, flattery, exaggerated enthusiasm or repeated greetings. Be concise, acknowledge the actual preference, and ask at most one useful question. Do not repeat questions already answered. Give guests time to choose; never pressure them to spend more. You are MOYA's AI assistant, not a human employee. Identify yourself honestly when asked; never pretend to have eaten a dish or personally worked in the restaurant.`;

// Only apply to authored conversational prose, never restaurant menu facts.
export function conversational(text: string) {
  return text
    .replaceAll('می‌توانم', 'می‌تونم')
    .replaceAll('می‌توانیم', 'می‌تونیم')
    .replaceAll('می‌توانید', 'می‌تونین')
    .replaceAll('می‌تواند', 'می‌تونه')
    .replaceAll('می‌خواهید', 'می‌خواین')
    .replaceAll('می‌خواهم', 'می‌خوام')
    .replaceAll('می‌پسندید', 'دوست دارین')
    .replaceAll('برایتان', 'براتون')
    .replaceAll('همراهتان', 'همراهتون')
    .replaceAll('ترجیحتان', 'ترجیحتون')
    .replaceAll('قهوه‌تان', 'قهوه‌تون')
    .replaceAll('خوش آمدید', 'خوش اومدین')
    .replaceAll('بگویید', 'بگین')
    .replaceAll('ببینید', 'ببینین')
    .replaceAll('دارید', 'دارین')
    .replaceAll('گفتید', 'گفتین')
    .replaceAll('بیایید', 'بیاین')
    .replaceAll('گذاشته‌ام', 'گذاشتم')
    .replaceAll('تفاوتشان را', 'تفاوت‌هاشون رو')
    .replaceAll('هر کدام را', 'هر کدوم رو')
    .replaceAll('ترجیح می‌دهید', 'ترجیح می‌دین');
}
