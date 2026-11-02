# VR Home Construction

**Проектируй. Визуализируй. Живи.**

![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![three.js](https://img.shields.io/badge/three.js-WebXR-000000?logo=threedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white)

VR Home Construction — мой веб-конструктор интерьера. В браузере можно собрать комнату с нуля
или из шаблона, расставить мебель, подобрать отделку и свет, а потом надеть шлем
(Meta Quest 3/3+ или PC VR) и пройтись по комнате в виртуальной реальности. Ничего не нужно
устанавливать: всё работает в браузере, проекты сохраняются на сервере автоматически.

Я писал фронтенд на React + three.js, бэкенд на Go с MongoDB. Ниже рассказываю, как
устроен проект, как связаны его части и как его запустить.

## Содержание

- [Что умеет](#что-умеет)
- [Как всё устроено](#как-всё-устроено)
  - [Общая схема](#общая-схема)
  - [Фронтенд](#фронтенд)
  - [Редактор](#редактор)
  - [Жизненный цикл проекта](#жизненный-цикл-проекта)
  - [Бэкенд](#бэкенд)
  - [Регистрация и вход](#регистрация-и-вход)
  - [Данные](#данные)
  - [Продакшен](#продакшен)
- [Структура проекта](#структура-проекта)
- [Запуск](#запуск)
- [Продакшен-деплой](#продакшен-деплой)
- [Деплой на сервер с Caddy](#деплой-на-сервер-с-caddy)
- [Переменные окружения](#переменные-окружения)
- [Безопасность](#безопасность)
- [Тесты и качество](#тесты-и-качество)
- [Управление](#управление)

## Что умеет

**Главная («Мои проекты»).** Вкладки «Все / Избранное / Папки», поиск по названию, описанию
и тегам, плитка или список, превью проектов (снимок сцены), избранное, теги, дублирование,
папки (один проект может лежать в нескольких), импорт и экспорт проекта файлом, светлая
и тёмная темы. На телефоне навигация переезжает вниз экрана.

**Старт проекта.** Пустая комната или один из пяти шаблонов: гостиная, спальня,
кухня-столовая, кабинет, студия с перегородкой. Любую комнату можно сохранить как свой шаблон.

**Редактор 3D и 2D.**
- Мебель встаёт на пол, прижимается к стенам и разворачивается к комнате; не проваливается
  в пол и стены и не пересекается с другой мебелью. Есть сетка 10 см, поворот кольцом,
  дублирование, блокировка и тонирование.
- Стены (толщина, высота, отделка, удаление), перегородки и проёмы — окна и двери.
- 2D-план и развёртки стен с тем же редактированием, синхронно с 3D.
- PBR-текстуры стен, пола и потолка, светильники, солнце за окнами (время суток и сторона
  света), HDRI-пейзаж за окном.
- Камера: облёт, от первого лица (ходьба, бег, прыжок), план сверху, фиксированные виды.
- Пресеты графики, отмена и повтор, автосохранение и работа без сети.

**VR (WebXR).** Quest Browser на Meta Quest 3/3+ и PC VR (Chrome/Edge + Quest Link,
Air Link или SteamVR через OpenXR): телепорт и плавное движение, захват мебели лучом,
поворот стиком, вибрация, меню на запястье, отслеживание рук, фовеация.

## Как всё устроено

### Общая схема

Браузер скачивает приложение и ассеты у nginx, а данные получает у Go API через `/api`.
В продакшене всё стоит в Docker Compose; наружу открыт только nginx.

```mermaid
flowchart LR
    user(["Пользователь<br/>браузер или VR-шлем"])

    subgraph browser["Браузер"]
        spa["React-приложение<br/>Redux + саги"]
        scene["3D-сцена<br/>three.js + React Three Fiber"]
        xr["WebXR<br/>Quest 3/3+, PC VR"]
        local[("localStorage<br/>токен и копии проектов")]
    end

    subgraph server["Сервер"]
        nginx["nginx<br/>статика, прокси /api, CSP"]
        api["Go API<br/>Gin"]
        db[("MongoDB")]
    end

    mail["Почта<br/>SMTP или Resend"]

    user --> spa
    spa --> scene --> xr
    spa <--> local
    spa -->|"JSON + JWT"| nginx
    scene -->|"модели, текстуры, HDRI"| nginx
    nginx -->|"/api"| api
    api --> db
    api -->|"коды подтверждения"| mail
```

### Фронтенд

Фронтенд я разложил по Feature-Sliced Design: каждый слой может использовать только слои
ниже себя. Так фичи не зависят друг от друга по кругу, а страницы собираются из готовых блоков.

```mermaid
flowchart TB
    app["app<br/>роутер, Redux-стор, API-клиент, тема"]
    pages["pages<br/>Мои проекты, Шаблоны, Редактор, 404"]
    widgets["widgets<br/>оболочка, доски проектов и папок,<br/>3D-вьюпорт, 2D-план, инспектор"]
    features["features<br/>editor-3d, furniture, vr, camera,<br/>project-session, user, folders и другие"]
    shared["shared<br/>UI-кит, утилиты, геометрия"]

    app --> pages --> widgets --> features --> shared
```

Состояние живёт в Redux Toolkit, а всё, что ходит в сеть или в localStorage, делают саги
(typed-redux-saga). Ответы сервера проверяются Zod-схемами ещё до того, как попадут в стор,
а ошибки переводятся в понятный русский текст.

```mermaid
flowchart LR
    ui["Компонент"] -->|"dispatch(action)"| store["Redux-стор<br/>слайсы фич"]
    store -->|"useSelector"| ui
    store -->|"действие"| saga["Саги"]
    saga -->|"call"| client["API-клиент<br/>fetch, JWT, таймаут 20 с"]
    client <-->|"HTTP"| backend["Go API"]
    client -->|"проверка Zod"| saga
    saga -->|"put(action)"| store
```

Редактор подгружается отдельным чанком: на главной не грузится three.js, поэтому она
открывается быстро.

### Редактор

Главная идея редактора — одно состояние и одни команды на все режимы. 3D-сцена, 2D-план,
VR и инспектор свойств меняют комнату через одни и те же команды сцены, а те проверяют
ограничения: предметы не пересекаются, проёмы не накладываются, всё остаётся внутри комнаты.
Поэтому режимы всегда синхронны.

```mermaid
flowchart LR
    subgraph views["Режимы"]
        direction TB
        v3d["3D-сцена"]
        v2d["2D-план и развёртки"]
        vr["VR: лучи и меню"]
        inspector["Инспектор свойств"]
    end

    commands["Команды сцены<br/>привязки, коллизии,<br/>ограничения"]

    subgraph state["Redux"]
        direction TB
        editor["editor<br/>комната, стены, проёмы,<br/>перегородки"]
        furniture["furniture<br/>мебель"]
        environment["environment<br/>свет, солнце, небо"]
    end

    history["history<br/>отмена и повтор"]
    doc["Документ сцены v2<br/>проверка Zod"]
    session["project-session<br/>автосохранение"]

    views -->|"команда"| commands -->|"действие"| state
    state -.->|"перерисовка"| views
    state --> history
    state --> doc --> session
```

То, что меняется каждый кадр (перетаскивание, «призрак» новой модели, поворот), хранится
вне Redux, в лёгком сторе взаимодействия, — иначе каждое движение мыши перерисовывало бы
всё приложение. Перетаскивание склеивается в один шаг истории: Ctrl+Z отменяет его целиком.

### Жизненный цикл проекта

Проект сохраняется сам. Каждая правка сначала через 0,4 с пишется локальной копией
в localStorage, а через 1,5 с тишины уходит на сервер. Если сеть пропала, работа
продолжается, а при следующем открытии более свежая локальная копия восстанавливается
и досохраняется.

```mermaid
sequenceDiagram
    autonumber
    participant U as Пользователь
    participant E as Редактор
    participant S as Сага сессии
    participant L as localStorage
    participant A as Go API

    U->>E: открывает проект
    E->>S: openRequested
    S->>A: GET /api/projects/:id
    A-->>S: проект и документ сцены
    S->>L: есть ли более свежая локальная копия?
    S->>E: разбор, миграция v1 → v2, загрузка сцены

    loop каждая правка
        U->>E: двигает мебель, меняет стену, свет
        E->>S: действие правки сцены
        S->>L: через 0,4 с — локальная копия
        S->>A: через 1,5 с — PUT /api/projects/:id
        alt сохранено
            A-->>S: обновлённый проект
            S->>L: копия отмечена как синхронизированная
        else нет сети или сбой сервера
            S->>A: повтор через 1 с и через 3 с
            S-->>U: изменения сохранены на устройстве
        end
    end
```

Вместе со сценой сохраняются поза камеры и превью проекта (снимок сцены не чаще раза
в минуту) — его видно на карточке на главной.

### Бэкенд

Бэкенд — Go + Gin, слои `handlers → services → repositories`. Интерфейсы хранилищ объявлены
в сервисах, поэтому бизнес-логика тестируется на фейках, а репозитории — на настоящей MongoDB.

```mermaid
flowchart LR
    request(["HTTP-запрос"]) --> middleware

    subgraph middleware["Middleware"]
        direction TB
        m1["Логи и recovery"] --> m2["Защитные заголовки, CORS"]
        m2 --> m3["Лимит тела 4 МБ, таймаут 15 с"]
        m3 --> m4["Лимиты запросов по IP и пользователю"]
        m4 --> m5["Проверка JWT"]
    end

    middleware --> handlers["handlers<br/>разбор JSON, коды ответов"]
    handlers --> services["services<br/>правила и валидация"]
    services --> repositories["repositories<br/>запросы с фильтром по владельцу"]
    repositories --> db[("MongoDB")]
    services --> queue["Очередь писем"] --> mail["SMTP или Resend"]
```

Каждая запись в базу идёт с фильтром `{_id, userId}`: чужой проект нельзя ни прочитать,
ни изменить, ни удалить, а на попытку сервер отвечает 404, не раскрывая, что проект существует.

### Регистрация и вход

Вход — по почте и паролю. Регистрация подтверждается кодом из письма, а чтобы кто-то другой
не мог перехватить незавершённую регистрацию, код принимается только вместе с токеном заявки,
который получил тот, кто её начал.

```mermaid
sequenceDiagram
    autonumber
    participant B as Браузер
    participant A as Go API
    participant DB as MongoDB
    participant M as Почта

    B->>A: POST /api/auth/send-code (почта, имя, пароль)
    A->>DB: хэш кода, хэш пароля, хэш токена заявки
    A-)M: письмо с кодом (в фоне)
    A-->>B: сообщение и токен заявки
    B->>A: POST /api/auth/verify-code (код и токен заявки)
    A->>DB: атомарно списать попытку (не больше 5)
    alt код и токен верны
        A->>DB: создать пользователя, удалить код
        A-->>B: пользователь и JWT на 7 дней
    else неверно или попытки кончились
        A-->>B: 401 или 429
    end
    B->>A: POST /api/auth/login
    Note over A: 10 неудачных входов за 15 минут блокируют адрес
    A-->>B: пользователь и JWT
```

### Данные

```mermaid
erDiagram
    USERS ||--o{ PROJECTS : "владеет"
    USERS ||--o{ FOLDERS : "владеет"
    USERS ||--o{ LAYOUTS : "владеет"
    USERS ||--o| COUNTERS : "нумерация проектов"
    FOLDERS ||--o{ FOLDERS : "вложенные папки"
    FOLDERS }o--o{ PROJECTS : "projectIds"
    FOLDERS }o--o{ LAYOUTS : "layoutIds"

    USERS {
        string id PK
        string email UK
        string name
        string passwordHash "bcrypt"
    }
    PROJECTS {
        string id PK
        string userId FK
        int number "номер проекта у пользователя"
        string name
        string status "draft, active, archived"
        bool favorite
        string thumbnail "превью, data URL"
        object roomData "документ сцены v2"
        array playerPosition "поза камеры"
    }
    FOLDERS {
        string id PK
        string userId FK
        string parentId FK
        array projectIds
        array layoutIds
    }
    LAYOUTS {
        string id PK
        string userId FK
        string name
        object roomData "документ сцены v2"
    }
    VERIFICATION_CODES {
        string email "вместе с purpose уникален"
        string purpose "register, change_email"
        string codeHash "bcrypt"
        string tokenHash "SHA-256 токена заявки"
        int attempts "не больше 5"
        date expiresAt "TTL-индекс, 10 минут"
    }
    COUNTERS {
        string id PK "project_number и userId"
        int seq
    }
```

Сама комната хранится в `roomData` как документ сцены. Формат принадлежит фронтенду,
у него есть версия и Zod-схема; старые проекты формата v1 мигрируют при открытии,
а повреждённые элементы отбрасываются, не ломая весь проект.

```mermaid
flowchart LR
    doc["roomData<br/>schemaVersion 2"]
    doc --> room["Комната"]
    doc --> lighting["Свет и окружение"]
    doc --> objects["Объекты"]
    room --> dimensions["dimensions<br/>ширина, глубина, высота"]
    room --> walls["wallThickness, removedWalls"]
    room --> finishes["finishes<br/>отделка стен, пола, потолка"]
    lighting --> light["light<br/>светильники"]
    lighting --> environment["environment<br/>солнце, небо, HDRI"]
    objects --> openings["openings<br/>окна и двери"]
    objects --> partitions["partitions<br/>перегородки с проёмами"]
    objects --> furniture["furniture<br/>модель, позиция, поворот, цвет"]
```

### Продакшен

```mermaid
flowchart LR
    internet(["Интернет"]) -->|"порт 80"| frontend

    subgraph network["Внутренняя сеть compose 172.28.0.0/24"]
        frontend["frontend<br/>nginx: SPA, CSP, кеш,<br/>лимит на /api/auth"]
        backend["backend<br/>Go, без root, read-only"]
        mongodb[("mongodb<br/>с паролем, volume")]
    end

    frontend -->|"/api"| backend --> mongodb
    backend -.->|"SMTP или HTTPS"| mail["Почтовый сервис"]
```

## Структура проекта

```text
.
├── src/                          фронтенд (React 19, TypeScript strict)
│   ├── app/                      точка сборки приложения
│   │   ├── api/                  HTTP-клиент, Zod-схемы ответов, тексты ошибок
│   │   ├── router/               маршруты; редактор грузится лениво
│   │   ├── store/                Redux-стор и корневая сага
│   │   ├── providers/            тема и общие провайдеры
│   │   └── styles/               дизайн-токены (светлая и тёмная темы)
│   ├── pages/                    страницы
│   │   ├── my-projects/          «Мои проекты»: проекты, избранное, папки
│   │   ├── templates/            встроенные и свои шаблоны
│   │   ├── project-editor/       редактор: панель, сцена, инспектор
│   │   └── not-found/            404
│   ├── widgets/                  крупные блоки интерфейса
│   │   ├── app-shell/            боковая панель, шапка, уведомления
│   │   ├── project-board/        сетка и список проектов, диалоги
│   │   ├── folder-board/         папки
│   │   ├── template-picker/      выбор стартового шаблона
│   │   ├── scene-viewport/       3D-вьюпорт и оверлеи
│   │   ├── plan-editor-2d/       2D-план и развёртки стен (SVG)
│   │   ├── editor-topbar/        шапка редактора: режимы, камера, VR, сохранение
│   │   ├── editor-panel/         каталог мебели, отделка, комната, свет, вид
│   │   ├── editor-inspector/     свойства выделенного объекта
│   │   └── settings-drawer/      профиль и тема
│   ├── features/                 бизнес-фичи
│   │   ├── editor-3d/            комната, стены, проёмы, перегородки, команды сцены,
│   │   │                         документ сцены v2 (схема, миграция, разбор)
│   │   ├── furniture/            каталог и расстановка мебели, процедурные модели
│   │   ├── vr/                   WebXR: перемещение, захват мебели, меню на запястье
│   │   ├── camera/               облёт, от первого лица, план сверху, фиксированные виды
│   │   ├── textures/             PBR-отделка и процедурные материалы
│   │   ├── environment/          свет, солнце, небо и HDRI
│   │   ├── graphics/             пресеты качества рендера
│   │   ├── history/              отмена и повтор
│   │   ├── selection/            выделение объектов
│   │   ├── project-session/      открытие, автосохранение, локальная копия, превью
│   │   ├── assets/               манифест ассетов (HDRI, текстуры, модели)
│   │   ├── templates/            встроенные шаблоны комнат
│   │   ├── user/                 вход, регистрация, профиль, смена почты
│   │   ├── create-project/       список проектов
│   │   ├── project-actions/      избранное, дублирование, удаление
│   │   ├── folders/              папки (оптимистично, с откатом при ошибке)
│   │   └── …                     поиск, уведомления, тема, модальные окна
│   └── shared/                   UI-кит, утилиты, математика, хранилище
├── backend/                      Go API
│   ├── cmd/server/               запуск, сборка зависимостей, graceful shutdown
│   └── internal/
│       ├── config/               переменные окружения и проверка конфигурации
│       ├── server/               роутер и цепочка middleware
│       ├── middleware/           JWT, CORS, заголовки, лимиты, таймауты
│       ├── handlers/             HTTP-слой
│       ├── services/             бизнес-логика и валидация
│       ├── repositories/         MongoDB (с интеграционными тестами)
│       ├── database/             подключение и индексы
│       ├── email/                SMTP, Resend, маскирование адресов в логах
│       ├── auth/                 выпуск и проверка JWT
│       └── models/               структуры запросов и документов
├── public/
│   ├── assets/                   CC0-ассеты: 5 HDRI, 16 PBR-текстур, 18 моделей,
│   │                             manifest.json и LICENSES.md
│   └── models/                   дополнительные модели мебели
├── e2e/                          сценарии Playwright
├── deploy/                       nginx.conf, заголовки безопасности (CSP), шаблон prod.env
├── scripts/                      генерация списка моделей
├── docker-compose.prod.yml       продакшен-стек
├── Dockerfile                    образ фронтенда: сборка → nginx
└── run.sh / stop.sh              запуск всего проекта одной командой / остановка
```

Подробное описание API бэкенда — в [backend/README.md](backend/README.md), E2E — в
[e2e/README.md](e2e/README.md), история изменений — в [REPORT.md](REPORT.md),
планы — в [TODO.md](TODO.md).

## Запуск

Нужны Docker, Node.js 20.19+ (я работаю на 24) и npm. Для публичной ссылки — ngrok 3.x
с настроенным authtoken.

```bash
cp backend/.env.example backend/.env && chmod 600 backend/.env
./run.sh
```

Скрипт поднимает MongoDB и бэкенд в Docker, ставит зависимости фронтенда, запускает
dev-сервер на `http://localhost:3000` и печатает публичную ссылку ngrok (её можно открыть
и в шлеме). Закрыть ссылку паролем: `NGROK_BASIC_AUTH='user:пароль' ./run.sh`.
Остановка — `Ctrl+C`, полностью вместе с Docker — `./stop.sh`.

Без ngrok:

```bash
cd backend && docker compose up -d --build   # MongoDB и API на 127.0.0.1
cd .. && npm install && npm run dev          # http://localhost:3000
```

Пока почта не настроена, код подтверждения регистрации печатается в логах бэкенда:

```bash
docker logs vr-backend 2>&1 | grep '\[CODE\]' | tail -1
```

| Сервис | Адрес |
|---|---|
| Приложение | http://localhost:3000 |
| API | http://localhost:8080/api |
| Mongo Express | `docker compose -f docker-compose.yml -f docker-compose.tools.yml up -d mongo-express` в `backend/` → http://localhost:8081/mongo-express/ |

## Продакшен-деплой

```bash
cp deploy/prod.env.example deploy/prod.env   # пароль MongoDB: openssl rand -hex 24
cp backend/.env.example backend/.env         # JWT_SECRET (openssl rand -hex 48), почта, ALLOWED_ORIGINS
chmod 600 deploy/prod.env backend/.env

docker compose --env-file deploy/prod.env -f docker-compose.prod.yml up -d --build
curl http://localhost/api/health             # {"status":"ok"}
```

Бэкенд в продакшене не стартует без надёжного `JWT_SECRET`, без настоящей почты и с CORS `*`.
Если перед nginx стоит балансировщик или CDN, его адреса нужно добавить в `TRUSTED_PROXIES`,
а при работе по HTTPS — включить HSTS в [deploy/security-headers.conf](deploy/security-headers.conf).

## Деплой на сервер с Caddy

Если на сервере уже работает Caddy (как у меня), nginx не нужен: Caddy раздаёт фронтенд
как статику, выпускает HTTPS-сертификат и проксирует `/api` на бэкенд, а бэкенд и MongoDB
работают в Docker. Всё собирается на машине разработчика — серверу не нужны Node и Go,
и он почти не тратит место на диске.

```bash
SERVER=root@45.12.255.39 DOMAIN=vrhome.45.12.255.39.nip.io ./deploy/server/deploy.sh
```

```mermaid
flowchart LR
    internet(["Интернет"]) -->|"443, HTTPS"| caddy["Caddy<br/>сертификат, CSP, статика"]
    caddy -->|"/api"| backend["vrhome-backend<br/>127.0.0.1:8085"]
    caddy -->|"файлы"| web[("/opt/vrhome/web")]
    backend --> mongo[("vrhome-mongo<br/>без внешнего порта")]
    backend -.->|"HTTPS API"| brevo["Brevo"]
```

Скрипт собирает фронтенд и бэкенд (linux/amd64), загружает их в `/opt/vrhome`, при первом
запуске создаёт на сервере секреты (пароль MongoDB, `JWT_SECRET`) и подключает сайт в Caddy
отдельным файлом. Повторный запуск обновляет версию без потери данных.
`nip.io` превращает IP в имя (`vrhome.45.12.255.39.nip.io` → `45.12.255.39`), поэтому
HTTPS работает без своего домена; свой домен — это просто другое значение `DOMAIN`.

**Почта.** Многие хостинги закрывают исходящий SMTP. Тогда коды отправляются через HTTPS API
Brevo: в `/opt/vrhome/backend.env` нужны `BREVO_API_KEY` и `BREVO_FROM`, после чего
`ALLOW_LOG_ONLY_MAIL=true` удаляется и бэкенд перезапускается
(`cd /opt/vrhome && docker compose up -d`).

## Переменные окружения

Шаблон — [backend/.env.example](backend/.env.example). Сам `.env` в репозиторий не попадает.

| Переменная | Назначение |
|---|---|
| `APP_ENV` | `development` / `dev` / `local` — разработка, любое другое значение — продакшен |
| `PORT` | порт API, по умолчанию `8080` |
| `MONGO_URI` | строка подключения к MongoDB |
| `JWT_SECRET` | секрет подписи сессий, не короче 32 байт; в разработке без него создаётся временный |
| `ALLOWED_ORIGINS` | origin-ы для CORS через запятую (в разработке пусто — `*`) |
| `TRUSTED_PROXIES` | прокси, которым можно верить в `X-Forwarded-For` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | отправка кодов по SMTP |
| `SMTP_LOG_ONLY` | не отправлять письма, печатать код в лог (только разработка) |
| `BREVO_API_KEY`, `BREVO_FROM` | отправка кодов через Brevo (HTTPS, работает при закрытом SMTP) |
| `RESEND_API_KEY`, `RESEND_FROM` | отправка кодов через Resend |
| `ALLOW_LOG_ONLY_MAIL` | `true` — запустить production без почты, коды в лог (временно) |
| `MONGO_EXPRESS_USER`, `MONGO_EXPRESS_PASSWORD` | вход в mongo-express (только локально) |

## Безопасность

- Пароли и коды — bcrypt; токен заявки на регистрацию хранится как SHA-256; JWT — только
  HS256 с обязательным сроком действия.
- Попытки ввода кода списываются атомарно (не больше 5 даже при параллельных запросах),
  повторная отправка — не чаще раза в 30 секунд, вход блокируется после 10 неудач за 15 минут.
- Смена почты требует текущий пароль.
- Все записи в базу — с фильтром по владельцу; квоты и валидация входных данных на сервере
  (размеры сцены, пути моделей, превью, поза камеры, вложенность папок без циклов).
- Лимиты запросов по IP и по пользователю; `X-Forwarded-For` принимается только от
  доверенного прокси.
- В логах нет кодов и полных адресов почты, клиент не видит внутренних ошибок.
- nginx отдаёт строгую CSP (всё только со своего origin), `Permissions-Policy` с разрешением
  WebXR; бэкенд в контейнере работает без root на read-only файловой системе.
- Зависимости проверяются `govulncheck` и `npm audit`.

## Тесты и качество

| Проверка | Результат |
|---|---|
| `npm run lint` — ESLint, Stylelint, Knip | 0 ошибок и предупреждений |
| `npm run typecheck` | 0 ошибок |
| `npm run test:coverage` — Vitest | 433 теста, ≈ 97 % строк |
| `npm run test:e2e` — Playwright | 9 сценариев: гость, вход, главная, папки, шаблоны, редактор, автосохранение |
| `go test -race ./...` | все пакеты, ≈ 93 % покрытия, репозитории — на настоящей MongoDB |
| `govulncheck ./...` | 0 уязвимостей в вызываемом коде |

Перед первым запуском E2E: `npx playwright install chromium` и тестовый аккаунт
в `e2e/.env.e2e.local` (см. [e2e/README.md](e2e/README.md)).

| Команда | Что делает |
|---|---|
| `npm run dev` | dev-сервер на `:3000`, `/api` проксируется на `:8080` |
| `npm run build` | проверка типов и прод-сборка в `dist/` |
| `npm run lint` / `npm run typecheck` | линтеры / TypeScript (приложение и E2E) |
| `npm test` / `npm run test:coverage` | тесты Vitest / с покрытием |
| `npm run test:e2e` | E2E-сценарии |
| `npm run generate-models` | пересобрать список моделей из `public/models` |
| `cd backend && go vet ./... && go test -race ./...` | проверки бэкенда |

## Управление

| Действие | Клавиши и мышь |
|---|---|
| Выбрать / переместить предмет | клик / перетаскивание |
| Повернуть выделенное | **R** или кольцо вокруг предмета (Shift — без шага) |
| Удалить / копия / блокировка | **Del** / **Ctrl+D** / **L** |
| Сетка | **G** |
| Отменить / повторить | **Ctrl+Z** / **Ctrl+Shift+Z** |
| Сохранить сейчас | **Ctrl+S** |
| От первого лица | **ЛКМ** + мышь — осмотр, **W A S D** — ходьба, **Shift** — бег, **Space** — прыжок, **C** — присесть |

**В шлеме:** откройте приложение по HTTPS-адресу, доступному со шлема (например, ссылка
из `./run.sh`), войдите, откройте проект и нажмите **VR**. Телепорт — стик вперёд и луч
на пол, мебель — захват курком и поворот стиком, меню — кнопка **Y**.

## Ассеты

HDRI, PBR-текстуры и модели в `public/assets` — CC0 с Poly Haven; авторы и ссылки перечислены
в [public/assets/LICENSES.md](public/assets/LICENSES.md).

---

Автор — [execada](https://github.com/execada).
