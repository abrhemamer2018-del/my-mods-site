// ------------------------------------------------------------
//  فلتر الكلمات المسيئة في بلاغات الزوار
//  يكتشف التحايل: التشكيل والتطويل، تكرار الحروف، الحروف المفصولة بمسافات أو رموز،
//  الأرقام بدل الحروف اللاتينية، والسوابق/اللواحق العربية (وكس، كسك…).
//  لإضافة كلمة: اكتبها في القائمة المناسبة (بدون تشكيل).
// ------------------------------------------------------------

// كلمات كاملة (تُطابق ككلمة مستقلة فقط حتى لا تُحجب كلمات سليمة مثل "عكس" و"كسر")
const WORDS = [
  // عربي
  'كس', 'كسك', 'كسها', 'كسمك', 'كسامك', 'كسختك', 'كسخت', 'زب', 'زبي', 'زبك', 'طيز', 'طيزك',
  'شرموط', 'شرموطه', 'شراميط', 'قحبه', 'قحاب', 'منيوك', 'منيوكه', 'منيك', 'نيك', 'نايك', 'انيك', 'انيكك',
  'نيج', 'منيوج', 'انيجك', 'متناك', 'متناكه', 'عرص', 'معرص', 'عرصه', 'لوطي', 'عاهر', 'عاهره', 'ممحون',
  'ممحونه', 'زق', 'خره', 'خرا', 'مخنث', 'ديوث', 'زامل',
  // إنجليزي
  'fuck', 'fucking', 'fucker', 'fck', 'fuk', 'shit', 'bitch', 'cunt', 'pussy', 'whore', 'slut',
  'asshole', 'bastard', 'motherfucker', 'nigger', 'nigga', 'faggot', 'retard',
];

// عبارات تُكتشف حتى لو فُصلت حروفها بمسافات أو رموز (تُفحص بعد حذف كل الفواصل)
const PHRASES = ['كسامك', 'كسمك', 'كساختك', 'كسختك', 'يلعنابوك', 'يلعنامك', 'يلعندينك', 'طيزامك', 'fuck', 'motherfuck', 'cunt'];

const PREFIXES = ['وال', 'فال', 'بال', 'ال', 'يا', 'و', 'ف', 'ب', 'ل'];
const SUFFIXES = ['كم', 'هم', 'ها', 'ين', 'ات', 'ك', 'ه', 'ي'];

function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // التشكيل والتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[0@4]/g, (c) => ({ 0: 'o', '@': 'a', 4: 'a' })[c])
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[5$]/g, 's')
    .replace(/(.)\1+/g, '$1'); // تكرار الحروف: كسسسس ← كس
}

const WORD_SET = new Set(WORDS.map(normalize));
const PHRASE_LIST = PHRASES.map(normalize);

function badToken(t) {
  if (!t) return false;
  const cands = new Set([t]);
  for (const p of PREFIXES) if (t.startsWith(p) && t.length - p.length >= 2) cands.add(t.slice(p.length));
  for (const c of [...cands]) {
    for (const s of SUFFIXES) if (c.endsWith(s) && c.length - s.length >= 2) cands.add(c.slice(0, -s.length));
  }
  for (const c of cands) if (WORD_SET.has(c)) return true;
  return false;
}

/** هل النص يحتوي على كلمات مسيئة؟ */
export function isAbusive(...texts) {
  const n = normalize(texts.join(' '));
  const tokens = n.split(/[^\p{L}]+/u).filter(Boolean);
  if (tokens.some(badToken)) return true;
  // حروف مفردة متتالية (ك س ا م ك) تُجمع وتُفحص ككلمة
  let run = '';
  for (const t of [...tokens, '__']) {
    if (t.length === 1) run += t;
    else {
      if (run.length >= 2 && badToken(run)) return true;
      run = '';
    }
  }
  // العبارات بعد حذف كل الفواصل
  const compact = tokens.join('');
  return PHRASE_LIST.some((p) => compact.includes(p));
}
