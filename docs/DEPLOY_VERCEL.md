# Публікація на Vercel

Цей проєкт налаштований для розгортання на платформі [Vercel](https://vercel.com).

* **Продакшн-домен:** [https://prezentationappsucu.vercel.app](https://prezentationappsucu.vercel.app)
* **Панель керування проєктом:** [https://vercel.com/ruslantodo/prezentation_apps_ucu](https://vercel.com/ruslantodo/prezentation_apps_ucu)

---

## Спосіб 1: Через Vercel CLI (Швидкий ручний деплой)

Проєкт уже зв'язаний із командою `ruslantodo` та проєктом `prezentation_apps_ucu`.

### 1. Авторизація (якщо не залогінені)
```bash
npx vercel login
```
Відкриється посилання з одноразовим кодом для підтвердження входу у браузері.

### 2. Розгортання на продакшн
Для збірки та публікації одразу на основний домен:
```bash
npx vercel --prod
```

### 3. Попередній перегляд (Preview deployment)
Щоб протестувати зміни на тимчасовому preview-посиланні перед релізом у продакшн:
```bash
npx vercel
```

---

## Спосіб 2: Автоматичний деплой через GitHub (Рекомендовано)

Коли репозиторій `appsucu/prezentation_apps_ucu` підключено до проєкту у Vercel:

1. Закомітьте зміни та відправте їх у гілку `main`:
   ```bash
   git add .
   git commit -m "Оновлення презентації"
   git push origin main
   ```
2. Vercel автоматично запустить збірку `npm run build` і оновить продакшн за 20–30 секунд.
3. Коміти в окремі гілки створюють окремі Preview-посилання для тестування.

---

## Конфігураційні файли

* `vercel.json` — конфігурація збірки для Astro (`framework: "astro"`, `buildCommand: "npm run build"`, `outputDirectory: "dist"`).
* `.vercelignore` — виключає зайві та важкі файли (наприклад, вихідні PDF, локальні кеші) із завантаження на сервери Vercel.
* `.env.local` — локальні системні токени (створюються автоматично CLI, не комітяться у git).
