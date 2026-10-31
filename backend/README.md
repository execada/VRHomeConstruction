# VR Home Construction — Backend

REST API 3D/VR-редактора интерьеров: пользователи, проекты (документ сцены), папки и шаблоны.
Go 1.26 + Gin + MongoDB, слои `handlers → services → repositories`.

## Структура

| Пакет | Назначение |
|---|---|
| `cmd/server` | точка входа: конфигурация, подключение к MongoDB, сборка зависимостей, graceful shutdown |
| `internal/config` | переменные окружения и проверка конфигурации («закрыта по умолчанию») |
| `internal/server` | роутер: middleware безопасности, лимиты, маршруты, `/api/health` |
| `internal/middleware` | JWT, CORS, защитные заголовки, лимит тела, лимиты запросов, таймаут запроса |
| `internal/handlers` | HTTP: разбор запросов, коды ответов, тексты ошибок для клиента |
| `internal/services` | бизнес-логика и валидация (интерфейсы хранилищ объявлены здесь же) |
| `internal/repositories` | MongoDB: все записи — с фильтром по владельцу |
| `internal/database` | подключение и индексы |
| `internal/email` | отправка кодов: SMTP, Resend или только лог (разработка) |
| `internal/auth` | выпуск и проверка JWT (HS256, с обязательным сроком действия) |

## Запуск

```bash
cp .env.example .env && chmod 600 .env
docker compose up -d --build        # MongoDB + backend на 127.0.0.1:8080
```

Без Docker (нужны Go 1.26 и MongoDB): `MONGO_URI=mongodb://127.0.0.1:27017 go run ./cmd/server`.
Переменные окружения описаны в [.env.example](.env.example) и в корневом README.

## Проверки

```bash
go vet ./...
go test -race ./...     # интеграционные тесты репозиториев — на MongoDB (MONGO_TEST_URI,
                        # по умолчанию localhost:27017, временная база удаляется; без MongoDB пропускаются)
govulncheck ./...
```

## API

Префикс `/api`. Тела запросов и ответов — JSON. Защищённые маршруты требуют
`Authorization: Bearer <token>`. Ошибки — `{"error": "<короткий текст>"}`; внутренние детали
не раскрываются (500 → `internal server error`, подробности — в логе сервера).

### Служебные

| Метод | Путь | Ответ |
|---|---|---|
| GET | `/health` | `{"status":"ok"}`; 503, если MongoDB недоступна |

### Авторизация

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| POST | `/auth/login` | `email`, `password` | `{user, token}` |
| POST | `/auth/send-code` | `email`, `purpose: "register"`, `name`, `password` | `{message, token}` — токен заявки |
| POST | `/auth/verify-code` | `email`, `code`, `purpose: "register"`, `token` | `{user, token}` |
| GET | `/auth/me` | — | `user` |
| PATCH | `/auth/me` | `name` | `user` |
| POST | `/auth/email/send-code` | `newEmail`, `password` (текущий) | `{message}` |
| POST | `/auth/email/verify` | `newEmail`, `code` | `{user}` |

Регистрация в два шага: код уходит на почту, подтверждение принимается только вместе
с токеном заявки из ответа первого шага. Код живёт 10 минут, повторная отправка — не чаще
раза в 30 секунд, не более 5 попыток ввода (атомарно). После 10 неудачных входов на адрес
за 15 минут вход блокируется (`429 too many login attempts, try again later`).

### Проекты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/projects?page=&limit=&status=` | список без `roomData`: `{data, total, page, limit, pages}` |
| GET | `/projects/:id` | проект со сценой |
| POST | `/projects` | `name`, необязательно `status` (`draft`/`active`/`archived`), `template`, `description`, `tags`, `roomData` |
| PUT | `/projects/:id` | сохранение сцены: `name`, `status`, `roomData`, необязательно `template`, `thumbnail`, `playerPosition`, `playerRotation` |
| PATCH | `/projects/:id` | метаданные: `name`, `description`, `tags`, `favorite`, `thumbnail`, `status` |
| POST | `/projects/:id/duplicate` | копия проекта |
| DELETE | `/projects/:id` | удаление (проект убирается и из папок) |

Номер проекта выдаёт сервер. Ограничения: до 500 проектов на пользователя, сцена — не больше
лимита тела запроса (4 МБ), превью — только `data:image/(jpeg|png|webp);base64`, поза камеры —
три конечных числа. Чужой или несуществующий проект — 404.

### Папки и шаблоны

| Метод | Путь | Описание |
|---|---|---|
| GET | `/folders` | дерево папок пользователя |
| POST | `/folders` | `name`, `description`, `parentId` |
| PUT | `/folders/:id` | `name`, `description`, `parentId`, `projectIds`, `layoutIds`, `childFolderIds` |
| DELETE | `/folders/:id` | удаление папки |
| GET | `/layouts` | шаблоны пользователя без `roomData` |
| GET | `/layouts/:id` | шаблон со сценой |
| POST / PUT | `/layouts`, `/layouts/:id` | `name`, `description`, `roomData`, `thumbnail` |
| DELETE | `/layouts/:id` | удаление шаблона |

Родитель папки — своя существующая папка, циклы запрещены; списки содержимого — до 500 id.

## Лимиты и защита

| Что | Значение |
|---|---|
| Вход | 20 запросов/мин на IP |
| Коды подтверждения | 10 запросов/мин на IP |
| Изменяющие запросы | 120/мин на пользователя |
| Тело запроса | 4 МБ |
| Время обработки запроса | 15 с (запросы к MongoDB прерываются) |

IP клиента берётся из `X-Forwarded-For` только от прокси из `TRUSTED_PROXIES`. Лимиты и блокировки
хранятся в памяти процесса — при нескольких репликах нужен общий стор (см. TODO.md).
