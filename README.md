# Smart Electric Bill App

אפליקציית Web בעברית לחישוב חשבון חשמל לדיירים. האפליקציה מאפשרת העלאת PDF של חשבון חשמל, חילוץ מחיר לקוט"ש באגורות ונתוני חיוב נוספים, הזנת קריאות מונה ידנית, ניהול בני משפחה ושמירת היסטוריית חישובים לכל פרופיל ב-localStorage.

## הרצה מקומית

```bash
npm install
npm run dev
```

אפשר גם לפתוח ישירות את `index.html`, אבל הרצה דרך שרת מקומי עדיפה לבדיקות.

## Build

```bash
npm run build
```

הפקודה יוצרת תיקיית `dist` עם קבצי האתר הסטטיים.

## Deploy ל-Vercel

1. מעלים את הפרויקט ל-GitHub.
2. ב-Vercel יוצרים Project חדש מה-repository.
3. Vercel יריץ `npm run build` ויגיש את תיקיית `dist` לפי `vercel.json`.

## קבצים מרכזיים

- `index.html` - נקודת הכניסה לאפליקציה.
- `script.js` - לוגיקת React, חילוץ PDF, חישוב וניהול פרופילים.
- `styles.css` - עיצוב RTL.
- `vendor/` - קבצי PDF.js מקומיים.
