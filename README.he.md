<div align="center">

<img src="assets/banner.svg" alt="Claude Desktop RTL" width="100%" />

<br/>

[![CI](https://github.com/eliranpv11/claude-desktop-rtl/actions/workflows/ci.yml/badge.svg)](https://github.com/eliranpv11/claude-desktop-rtl/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/eliranpv11/claude-desktop-rtl?sort=semver)](https://github.com/eliranpv11/claude-desktop-rtl/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%C2%B7%20Browser-informational)](#-התקנה)

[English](README.md) · [**עברית**](README.he.md)

</div>

<div dir="rtl">

**תמיכת ימין-לשמאל (עברית · ערבית · פרסית) חלקה ל-Claude Desktop ב-Windows — וגם ל-claude.ai בכל דפדפן — ממנוע אחד טהור ובדוק.**

---

## הבעיה

Claude כותב עברית יפה — ואז מציג אותה **משמאל לימין**. התבליטים בצד הלא נכון, סימני הפיסוק קופצים, טבלאות זורמות הפוך, ו-`3 < 5` נקרא כאילו כתוב `5 > 3`. כל פתרון "נאיבי" פשוט הופך את כל העמוד, ובכך שובר את האנגלית ואת הקוד שלך.

**הכלי הזה מתקן את זה נכון — בלוק אחר בלוק — בלי לגעת בטקסט שלך ובלי שום גישה לרשת.**

</div>

<div dir="rtl">

| בלי הפאץ' | עם הפאץ' |
| --- | --- |
| פסקאות עברית נצמדות לשמאל | כל בלוק עברי נצמד לימין, אנגלית נשארת בשמאל |
| תבליטים ופס-ציטוט בצד הלא נכון | סימנים, הזחה ופס-ציטוט עוברים לצד הנכון |
| `3 < 5` מוצג הפוך כ-`5 > 3` | מתמטיקה והשוואות נשארות קריאות |
| טבלאות בכיוון הפוך | סדר עמודות ויישור לכל עמודה מתוקנים |
| חצים `→` מצביעים לכיוון הלא נכון | מתהפכים **ויזואלית** — התו עצמו לא משתנה |

</div>

<div dir="rtl">

## ✨ למה זה שונה

- 🎯 **כיוון לכל בלוק בנפרד.** כל פסקה, רשימה, טבלה וציטוט קובעים את הכיוון של עצמם, לפי התוכן של עצמם. עברית ואנגלית חיות נכון **באותה הודעה** — בלי היפוך גורף, שזה הבאג שלכל כלי נאיבי יש.
- 🔒 **אפס רשת. אפס טלמטריה.** שום דבר לא יוצא מהמחשב שלך. העתקה ו-Ctrl-F נשארים **זהים בייט-בייט**: לא מוזרקים תווי יוניקוד נסתרים, והחצים והאופרטורים מתהפכים *ויזואלית* בלבד בזמן שהתווים עצמם נשארים במקום.
- 🛡️ **בטוח מעצם התכנון.** הקבצים המקוריים מגובים בהעתקה אטומית ומאומתת **לפני** כל שינוי, וכל כישלון מפעיל **גלגול-אחורה אוטומטי**. פקודה אחת מחזירה הכל.
- 🧪 **ליבה טהורה ובדוקה.** כל האינטליגנציה של הכיווניות יושבת במנוע נטול-DOM עם מאגר בדיקות מקיף, ושכבת ה-CSS/DOM מאומתת בדפדפן אמיתי.
- 🧱 **עמיד לעדכוני Claude.** השכבה מתייחסת ל*תגיות* הטקסט, לא לשמות ה-class של Claude — כך שעיצוב מחדש לא שובר אותה בשקט. ובווינדוס, כש-Claude מתעדכן, ה-watcher **מתקן את הגרסה החדשה מראש — עוד לפני שהיא נכנסת לתוקף** (MSIX מוריד אותה לדיסק ודוחה את ההפעלה עד שאתה מאשר), כך שהעברית חוזרת מעצמה ברגע שאתה מאשר את העדכון: בלי restart, בלי לחיצה, בלי אייקון, ובלי לסגור את Claude שרץ. טריגר-אירוע תופס את ה-staging תוך שנייה-שתיים, אז גם עדכון מהיר מכוסה.
- 🎨 **כל המשטחים — כולל Claude Design.** ה-RTL מגיע לצ'אט, לסרגל הצד ולתפריטים, **וגם לחלון Claude Design הנפרד** (עמוד claude.ai מרוחק שהאפליקציה מטמיעה בלי hook משלה — אז נותנים לחלון הזה preload משלנו). האמנות/קנבס של Design נשארת ללא שינוי — רק הצ'אט מתהפך.

</div>

<div dir="rtl">

## 🚀 התקנה

### 🪟 Windows — אפליקציית Claude Desktop

פתחו **PowerShell** והריצו שורה אחת. כדי שהכל יקרה בחלון אחד סגור, פתחו את PowerShell עם **"הפעל כמנהל"** (Run as administrator) קודם:

</div>

```powershell
irm https://raw.githubusercontent.com/eliranpv11/claude-desktop-rtl/main/install.ps1 | iex
```

<div dir="rtl">

הפקודה מורידה את המאגר הזה, ואז פותחת תפריט — בחרו **1** להתקנה. זהו: Claude נפתח מחדש עם הודעת אישור ירוקה "RTL הופעל".

**דרישות:** Windows 10/11, [Node.js](https://nodejs.org/) ב-`PATH` (משמש ל-`@electron/asar` ו-`@electron/fuses` דרך `npx`), והרשאות מנהל להתקנת חנות Microsoft (MSIX).

**דגלים:** `-Install` · `-Restore` · `-Status` · `-Verify` · `-Preflight` · `-Watch` · `-Unwatch` · `-CleanCerts` · `-Repatch`

> ⚠️ **Windows בלבד** לאפליקציית הדסקטופ. 🍎 **למשתמשי macOS:** נסו את הפאצ'ים של [toboly](https://github.com/toboly/claude-desktop-rtl-patch-mac) או [soguy](https://github.com/soguy/claude-desktop-rtl-mac) *(לא נבדקו כאן; על אחריותכם)*.

### 🌐 דפדפן — claude.ai (כל מערכת הפעלה)

1. התקינו **Tampermonkey** (או Violentmonkey).
2. פתחו את הקובץ [**`claude-rtl.user.js`**](https://github.com/eliranpv11/claude-desktop-rtl/releases/latest) מהגרסה האחרונה והתקינו אותו.
3. רעננו את `claude.ai` — תשובות בעברית/ערבית ייקראו מימין לשמאל מיד, כולל בפאנל ה-Artifacts.

</div>

<div dir="rtl">

## 🧠 איך זה עובד (ב-30 שניות)

הדפדפן שלכם כבר כולל אלגוריתם דו-כיווני (Bidi) שלם של יוניקוד. הכלי הזה לא כותב אותו מחדש — הוא מקבל את **החלטות הכיוון והבידוד** ונותן למנוע התצוגה לסדר מחדש:

- **ה-CSS עושה כ-85%.** הכלל `unicode-bidi: plaintext` על כל בלוק טקסט גורם לכל בלוק לקבוע את כיוון הבסיס שלו מהתו החזק הראשון שלו. אנגלית נשארת LTR, עברית מתהפכת ל-RTL — בלי שאף מיכל מתהפך בכוח.
- **ה-JS עושה רק את מה שה-CSS לא יכול:** מבודד מתמטיקה כך ש-`3 < 5` לא מתהפך, הופך חצים ויזואלית, מעביר עיטור של רשימות וציטוטים לצד הנכון, ומטפל ב-streaming בלי הבהובים — הכל בלי לשנות את הטקסט שלך.
- **בדסקטופ**, אותו מנוע מוזרק לחבילת ה-renderer של Claude; ה-fuse של בדיקת התקינות (ASAR integrity) מכובה כדי שהחבילה המתוקנת תיטען, ובמקום שבו `cowork-svc` שומר על `claude.exe` הבינאריים נחתמים מחדש עם תעודה מקומית. ראו את **[SECURITY.md](SECURITY.md)** למודל האמון המלא.

## 🗂️ ארכיטקטורה

</div>

```
engine/     Pure, DOM-free bidi decision engine (unit-tested, no browser needed)
  ranges    Unicode script classification (astral-safe, 40+ RTL blocks)
  numbers   EN/AN digits, signed-run detection ("-5" vs Hebrew prefix "ל-15")
  detect    first-strong + majority; fallback is ALWAYS null, never forced RTL
  math      LaTeX vs currency ($5.99 stays text, $\frac{}{}$ is math)
  arrows    horizontal arrows needing a visual RTL flip (math/LTR-context aware)
  relations mirrored relations ("3 < 5" isolated so it never reads backwards)
  code      real code vs Hebrew prose mis-fenced as code
dom/        The thin runtime that applies the engine's decisions to Claude's UI
  apply.css declarative core (unicode-bidi:plaintext per leaf block)
  surfaces  single source of truth for Claude's selectors
  apply.js  streaming-settle observer, input guards, tables, structural flip
build/      Bundles engine+DOM+CSS into one self-contained IIFE (dist/payload.js)
windows/    The Windows patcher
  inject.mjs byte-exact injector (spares the main entry, keeps native modules)
  patch.ps1  install / restore / status / verify / watch — MSIX + Squirrel
dev/        Real-browser fixture for verifying the DOM/CSS layer
```

<div dir="rtl">

## ✅ אימות והסרה

</div>

```powershell
.\windows\patch.ps1 -Status     # מודל התקנה · מותקן? · יש גיבוי? · watcher?
.\windows\patch.ps1 -Verify     # בדיקת סימן ההזרקה + התעודה (קריאה בלבד)
.\windows\patch.ps1 -Restore    # מחזיר את הגיבויים המאומתים, מסיר את התעודה המקומית
```

<div dir="rtl">

בקונסול (בדפדפן או ב-devtools של הדסקטופ), `__claudeRtlDiag()` מחזיר את גרסת ה-payload, את הדגל `booted`, וספירות של `processed` ו-`rtlBlocks`.

## ⚖️ מגבלות

- **בלוקי קוד אמיתיים נשארים LTR** מתוך כוונה (RTL הורס סוגריים והזחות). קטע שהוא בעצם *טקסט* עברי שהוקף בטעות ב-``` מזוהה ומוצג RTL.
- **Artifacts בדסקטופ** נטענים ב-iframe חוצה-מקור שה-payload של הדסקטופ עדיין לא יכול להיכנס אליו — סקריפט הדפדפן כן מכסה אותם.
- כיבוי ה-fuse דורש Node (עבור `npx @electron/fuses`) בזמן ההתקנה.

## 🛠️ פיתוח

</div>

```bash
npm test        # בדיקות יחידה של המנוע + ה-build (node:test, בלי דפדפן)
npm run build   # בנייה מחדש של dist/payload.js ו-dist/claude-rtl.user.js
node dev/fixture/serve.js   # fixture לדפדפן אמיתי בכתובת http://localhost:5599/
```

<div dir="rtl">

ראו את **[CONTRIBUTING.md](CONTRIBUTING.md)** לתהליך העבודה, **[CHANGELOG.md](CHANGELOG.md)** להיסטוריית הגרסאות, ו-**[SECURITY.md](SECURITY.md)** למודל האבטחה.

## 📄 רישיון

[MIT](LICENSE) © [eliranpv11](https://github.com/eliranpv11)

</div>
