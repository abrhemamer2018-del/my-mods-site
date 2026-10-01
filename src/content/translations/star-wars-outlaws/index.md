---
title: Star Wars Outlaws
titleAr: "ستار وورز: أوتلوز"
summary: خُض تجربة أول لعبة عالم مفتوح على الإطلاق في عالم Star Wars™، واستكشف مواقع مميزة ومتنوعة في أرجاء المجرة، تجمع بين الأماكن الشهيرة وتلك الجديدة كلياً. خاطر بكل شيء بشخصية "كاي فيس" (Kay Vess)؛ تلك المحتالة التي تسعى لنيل حريتها وإيجاد الوسيلة لبدء حياة جديدة.
category: mod
platforms:
  - PC
status: complete
releaseDate: 2026-10-01
version: "1.0"
cover: ./cover-muozd9m0.webp
banner: ./banner-muozcass.webp
screenshots:
  - ./shot-muozdipi9wk.webp
  - ./shot-muozdiskor1.webp
  - ./shot-muozdiuysit.webp
  - ./shot-muozdixql0h.webp
downloads:
  - label: تحميل مباشر
    url: https://www.mediafire.com/file/1jdxk98zlwuwi2m/StarWarsOutlaws_Arabic_Mod.zip/file
    size: 7.06 MB
requirements: []
team:
  - name: ibrahim
    role: معرب العاب
changelog:
  - version: "1.0"
    date: 2026-10-01
    notes:
      - الإصدار الأول
---

الطريقة الأولى: التثبيت بأمر (الأسهل)
-------------------------------------
1. فك ضغط هذا الملف في أي مكان.
2. انقر نقراً مزدوجاً على: install.bat
3. وافق على طلب صلاحيات المسؤول (لأن مجلد اللعبة داخل Program Files).
4. يبحث السكربت عن مجلد اللعبة تلقائياً. إذا لم يجده سيطلب منك لصق المسار
   (المجلد الذي يحتوي Outlaws.exe).

أو من PowerShell (كمسؤول) مع تحديد المسار بنفسك:
   powershell -ExecutionPolicy Bypass -File install.ps1 -GamePath "D:\SteamLibrary\steamapps\common\Star Wars Outlaws"


الطريقة الثانية: التثبيت اليدوي
-------------------------------
1. افتح مجلد اللعبة: من Steam انقر بزر الفأرة الأيمن على اللعبة
   ثم: إدارة (Manage) > تصفح الملفات المحلية (Browse local files).
   المسار الافتراضي:
   C:\Program Files (x86)\Steam\steamapps\common\Star Wars Outlaws
2. افتح مجلد files الموجود داخل هذه الحزمة.
3. انسخ كل محتوياته (الملفان version.dll و version.ini والمجلد helix)
   والصقها في مجلد اللعبة بجانب Outlaws.exe.
   - سيُدمج مجلد helix مع المجلد الموجود؛ لن يُستبدل أي ملف أصلي
     لأن ملفات التعريب كلها جديدة.
4. شغّل اللعبة.
