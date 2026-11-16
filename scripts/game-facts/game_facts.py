# -*- coding: utf-8 -*-
"""
معلومات قسم «عن التعريب» في صفحة كل لعبة (src/data/game-facts.json):
عدد النصوص المعرّبة + أبرز المصطلحات، من مشروع كل لعبة.

المصادر (الأحدث يغلب): مجلدات C:\\Claude Work C و C:\\الفحوصات، وأرشيفات D:\\اعمال كلاود (أحدث vN).

  python game_facts.py              يولّد الملف داخل نسخة الموقع هذه (للتجربة)
  python game_facts.py --auto       للمهمة المجدولة: نسخة git منفصلة، يرفع للموقع إن تغيّر شيء

النتائج المستخرجة محفوظة في ذاكرة مؤقتة (المسار + وقت التعديل)، فالتشغيل المتكرر سريع
ولا يُعاد إلا المشروع الجديد أو المعدّل.
"""
import json
import os
import re
import subprocess
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE_ROOT = HERE.parent.parent
DATA = Path(os.environ.get('LOCALAPPDATA', str(HERE))) / 'ta3reebat-facts'
CACHE = DATA / 'cache.json'
LOG = DATA / 'log.txt'
CLONE = DATA / 'site'
ARCHIVE_DIRS = [Path(r'D:\اعمال كلاود')]
PROJECT_DIRS = [Path(r'C:\Claude Work C'), Path(r'C:\الفحوصات')]
UNRAR = r'C:\Program Files\WinRAR\UnRAR.exe'
NOWIN = 0x08000000 if os.name == 'nt' else 0  # بلا نافذة سوداء

LINEFILES = ('texts/strings_ar.json', 'work/verify/strings_ar.json', 'texts/ar_full.json',
             'texts/rdr_texts_ar.json', 'texts/sm2_arabic.json')
WANT = LINEFILES + ('texts/glossary.json',)
# ملفات المشروع فيها جزء من النصوص فقط: لا نكتب عدداً قد يضلل الزائر
DROP_LINES = {'kingdom-come-deliverance-ii', 'rimworld', 'the-last-of-us-part-i'}
# أسماء لا يطابقها الاسم تلقائياً
OVERRIDE = {'the-elder-scrolls-v-skyrim-special-edition': 'skyrimspecial'}
AR = re.compile('[\u0600-\u06FF]')
LAT = re.compile('[A-Za-z]')


def log(msg):
    DATA.mkdir(parents=True, exist_ok=True)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(time.strftime('%Y-%m-%d %H:%M ') + msg + '\n')


def norm(s):
    s = re.sub(r'\bII\b', '2', s).lower().replace('&', 'and')
    s = re.sub(r"[™®©'’:\-–—_.,!?()\[\]/]", ' ', s)
    s = re.sub(r'\b(the|definitive|edition|remastered|enhanced|goty|game of the year)\b', ' ', s)
    return re.sub(r'\s+', '', s)


def split_version(name):
    m = re.search(r'[\s_][vV](\d+)$', name)
    return (name[:m.start()], int(m.group(1))) if m else (name, 1)


def sources():
    """{اسم مطبّع: (مسار, وقت التعديل)} — لكل لعبة أحدث مصدر"""
    best = {}

    def add(base, path):
        k = norm(base)
        if not k:
            return
        mt = path.stat().st_mtime
        if k not in best or mt > best[k][1]:
            best[k] = (str(path), mt)

    for d in ARCHIVE_DIRS:
        if d.is_dir():
            for p in d.iterdir():
                if p.suffix.lower() in ('.zip', '.rar'):
                    add(split_version(p.stem)[0], p)
    for d in PROJECT_DIRS:
        if d.is_dir():
            for p in d.iterdir():
                if p.is_dir() and (p / 'texts').is_dir():
                    add(split_version(p.name)[0], p)
    return best


def site_games(site):
    out = {}
    base = site / 'src' / 'content' / 'translations'
    for d in sorted(base.iterdir()):
        md = d / 'index.md'
        if not md.is_file():
            continue
        text = md.read_text(encoding='utf-8')
        t = re.search(r'^title:\s*(.+)$', text, re.M)
        if not t:
            continue
        al = re.search(r'^aliases:\n((?:\s*-.*\n)+)', text, re.M)
        aliases = re.findall(r'^\s*-\s*(.+)$', al.group(1), re.M) if al else []
        out[d.name] = [t.group(1).strip().strip('"\'')] + [a.strip().strip('"\'') for a in aliases]
    return out


def match(slug, names, srcs):
    if slug in OVERRIDE:
        return srcs.get(OVERRIDE[slug])
    for n in names + [slug.replace('-', ' ')]:
        if norm(n) in srcs:
            return srcs[norm(n)]
    k = norm(names[0])
    if len(k) > 4:
        for ak, v in srcs.items():
            if len(ak) > 4 and (ak.startswith(k) or k.startswith(ak)):
                return v
    return None


# ---------- قراءة الملفات من مجلد أو zip أو rar ----------
def _names(src):
    p = Path(src)
    if p.is_dir():
        return [str(f.relative_to(p)).replace('\\', '/') for f in p.rglob('*.json') if len(f.relative_to(p).parts) <= 4]
    if p.suffix.lower() == '.zip':
        return zipfile.ZipFile(p).namelist()
    r = subprocess.run([UNRAR, 'lb', str(p)], capture_output=True, creationflags=NOWIN)
    return [x.replace('\\', '/') for x in r.stdout.decode('utf-8', 'replace').splitlines()]


def _read(src, n):
    p = Path(src)
    if p.is_dir():
        return (p / n).read_bytes()
    if p.suffix.lower() == '.zip':
        return zipfile.ZipFile(p).read(n)
    r = subprocess.run([UNRAR, 'p', '-inul', str(p), n.replace('/', '\\')], capture_output=True, creationflags=NOWIN)
    if r.stdout:
        return r.stdout
    # أسماء فيها ™ تظهر مشوّهة في قائمة rar: نطلب الملف بنهاية مساره
    tail = n.split('/', 1)[1] if '/' in n else n
    r = subprocess.run([UNRAR, 'p', '-inul', str(p), '*\\' + tail.replace('/', '\\')], capture_output=True, creationflags=NOWIN)
    return r.stdout


def _strs(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, dict):
        for v in o.values():
            yield from _strs(v)
    elif isinstance(o, list):
        for v in o:
            yield from _strs(v)


def _count(o):
    items = o.values() if isinstance(o, dict) else o if isinstance(o, list) else []
    return sum(1 for v in items if any(AR.search(x) for x in _strs(v)))


def extract(src):
    r = {}
    try:
        ns = _names(src)
        for w in WANT:
            c = sorted((n for n in ns if n.lower() == w or n.lower().endswith('/' + w)), key=lambda n: n.count('/'))
            if not c:
                continue
            try:
                o = json.loads(_read(src, c[0]).decode('utf-8-sig'))
            except Exception:
                continue
            if w in LINEFILES:
                r.setdefault('lines', _count(o))
            elif isinstance(o, dict):
                r['glossary'] = o
    except Exception as e:
        r['err'] = str(e)[:200]
    return r


def pick_terms(g):
    terms, seen_ar, seen_en, seen_ws = [], set(), set(), []
    for en, ar in g.items():
        if not isinstance(ar, str) or not isinstance(en, str):
            continue
        en, ar = en.strip(), ar.strip()
        if not AR.search(ar) or LAT.search(ar) or not LAT.search(en):
            continue
        if any(c in ar for c in '()[]/{}|=<>%') or any(c in en for c in '{}<>%|[]'):
            continue
        if len(ar) > 28 or len(en) > 32 or len(en) < 4 or (en.isupper() and len(en) <= 4):
            continue
        k = en.lower().rstrip('s')
        if ar in seen_ar or k in seen_en:
            continue
        ws = {w for w in re.findall(r"[a-z0-9']+", en.lower()) if w not in ('mr', 'mrs', 'ms', 'the', 'of', 'sir', 'dr')}
        if any(ws and ws <= t for t in seen_ws):
            continue
        seen_ws.append(set(re.findall(r"[a-z0-9']+", en.lower())))
        seen_ar.add(ar)
        seen_en.add(k)
        terms.append([en, ar])
        if len(terms) >= 10:
            break
    return terms


def build(site):
    srcs = sources()
    games = site_games(site)
    cache = json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.exists() else {}
    todo = {}
    for slug, names in games.items():
        m = match(slug, names, srcs)
        if m:
            todo[slug] = m
    need = {s: m for s, m in todo.items() if cache.get(m[0], {}).get('mtime') != m[1]}
    with ThreadPoolExecutor(max(1, (os.cpu_count() or 4) * 3 // 4)) as ex:
        for (slug, m), res in zip(need.items(), ex.map(lambda m: extract(m[0]), need.values())):
            cache[m[0]] = {'mtime': m[1], **res}
    DATA.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding='utf-8')
    out = {}
    for slug, m in sorted(todo.items()):
        x, e = cache.get(m[0], {}), {}
        n = x.get('lines')
        if n and n >= 200 and slug not in DROP_LINES:
            e['lines'] = n
        terms = pick_terms(x.get('glossary') or {})
        if len(terms) >= 4:
            e['terms'] = terms
        if e:
            out[slug] = e
    missing = sorted(set(games) - set(todo))
    return out, missing, len(need)


def write(site, out):
    f = site / 'src' / 'data' / 'game-facts.json'
    new = json.dumps(out, ensure_ascii=False, indent=1) + '\n'
    old = f.read_text(encoding='utf-8') if f.exists() else ''
    if json.loads(old or '{}') == out:
        return []
    before = json.loads(old or '{}')
    f.write_text(new, encoding='utf-8')
    return [s for s in out if out[s] != before.get(s)] + [s for s in before if s not in out]


def git(*a, cwd=CLONE, check=True):
    r = subprocess.run(['git', *a], cwd=cwd, capture_output=True, text=True, encoding='utf-8', creationflags=NOWIN)
    if check and r.returncode:
        raise RuntimeError(f"git {' '.join(a)}: {r.stderr.strip()[:300]}")
    return r.stdout.strip()


def auto():
    DATA.mkdir(parents=True, exist_ok=True)
    # حساب GitHub نفسه الذي في نسخة الموقع، وإلا يفتح Windows نافذة «Select an account»
    cred = 'credential.https://github.com.username'
    user = git('config', cred, cwd=SITE_ROOT, check=False)
    if not (CLONE / '.git').exists():
        url = git('remote', 'get-url', 'origin', cwd=SITE_ROOT)
        git(*(['-c', f'{cred}={user}'] if user else []), 'clone', '--depth', '50', url, str(CLONE), cwd=DATA)
    for k in ('user.name', 'user.email', cred):
        v = git('config', k, cwd=SITE_ROOT, check=False)
        if v:
            git('config', k, v)
    git('fetch', '-q', 'origin', 'main')
    git('reset', '-q', '--hard', 'origin/main')
    out, missing, redone = build(CLONE)
    changed = write(CLONE, out)
    if not changed:
        return
    git('add', 'src/data/game-facts.json')
    git('commit', '-q', '-m', 'معلومات «عن التعريب»: ' + '، '.join(changed[:8]) + ('…' if len(changed) > 8 else ''))
    for _ in range(3):
        if subprocess.run(['git', 'push', '-q', 'origin', 'HEAD:main'], cwd=CLONE, creationflags=NOWIN).returncode == 0:
            log(f'رُفع: {", ".join(changed)} (أُعيد استخراج {redone})')
            return
        git('pull', '-q', '--rebase', 'origin', 'main')
    log('فشل الرفع بعد 3 محاولات')


if __name__ == '__main__':
    if '--auto' in sys.argv:
        try:
            auto()
        except Exception as e:
            log('خطأ: ' + str(e))
    else:
        out, missing, redone = build(SITE_ROOT)
        changed = write(SITE_ROOT, out)
        print(f'{len(out)} لعبة بمعلومات، أُعيد استخراج {redone}، تغيّر: {changed}')
        print('بلا مشروع:', missing)
