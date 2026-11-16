قسم «عن التعريب» في صفحة كل لعبة (عدد النصوص المعرّبة + أبرز المصطلحات) يقرأ من src/data/game-facts.json.
الملف يولّده game_facts.py من مشروع كل لعبة: مجلدات C:\Claude Work C و C:\الفحوصات وأرشيفات D:\اعمال كلاود.

تلقائياً: مهمة Windows المجدولة «Ta3reebat Game Facts» تشغّل كل 30 دقيقة:
    pythonw game_facts.py --auto
تسحب الموقع في نسخة منفصلة (%LOCALAPPDATA%\ta3reebat-facts\site)، وتضيف معلومات أي لعبة جديدة
أو مشروع تعدّل، وترفع للموقع إن تغيّر شيء. السجل: %LOCALAPPDATA%\ta3reebat-facts\log.txt

يدوياً (تجربة داخل هذه النسخة): python game_facts.py
