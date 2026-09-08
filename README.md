# Jarvis

[![ci](https://github.com/MAmmaadTehseen/jarvis/actions/workflows/ci.yml/badge.svg)](https://github.com/MAmmaadTehseen/jarvis/actions/workflows/ci.yml)

A self-hosted accountability bot that runs my learning journey in public.

I have five things I want to do at once: learn AWS properly, learn DevOps properly, freelance, build practice projects, build real ones. I have 5 to 8 hours a week and I derail easily, because nothing forces a choice each day and nothing notices when I skip.

Jarvis notices. It's a Telegram bot that:

- tells me every morning what today's one slot is (Mon Jarvis · Tue AWS · Wed Jarvis · Thu DevOps · Fri Freelance · Sat Content · Sun Review)
- asks me every evening whether I did it, and says so when I've missed two days in a row
- turns my logs into a weekly scorecard with streaks, which I post on LinkedIn every Saturday
- drafts my daily "what I learned" post from what I actually logged

And it is itself the project: every piece of AWS and DevOps I learn gets applied to Jarvis first. Fargate and Terraform, GitHub Actions with OIDC, CloudWatch alarms that message me through Jarvis, and finally a migration to Lambda so the whole thing costs $0 a month.

The journey is in [`journal/`](journal/), one file per week.

## Status

Week 0. Runs locally against DynamoDB Local. Next: a new AWS account and a Dockerfile that CI builds.

## Run it

You need Node 20+, Docker, and a bot token from [@BotFather](https://t.me/BotFather).

```bash
cp .env.example .env        # paste BOT_TOKEN
docker compose up -d        # DynamoDB Local on :8001
npm install
npm run dev                 # polling mode, creates the table and seeds goals
```

Send `/start` to your bot. It replies with your chat id; put it in `.env` as `OWNER_CHAT_ID` and restart. Then `/today`.

```bash
npm test                    # vitest: date math, scoring, streaks, formatting
npm run typecheck
docker compose --profile full up --build   # the bot in a container, same DB
```

## Commands

| Command | What it does |
| --- | --- |
| `/today` | Today's slot, task, and minutes logged so far |
| `/log 60 note` | Record time on today's goal (`/log 30 aws note` to log against another goal) |
| `/learned one line` | The line that becomes today's post |
| `/done [n]` · `/skip [n] reason` | Task status. `n` is the number from `/week` |
| `/week` · `/add [goal] task` | This week's tasks. On Sunday `/add` targets next week |
| `/score` | Scorecard: minutes vs target per goal, tasks, streaks |
| `/review` | Sunday: 3 questions, then the weekly post draft |
| `/post` · `/post week` | LinkedIn drafts from real data |
| `/park idea` · `/parked` | Ideas wait until Sunday. That's the rule |

Scheduled: 09:00 morning nudge, 21:00 evening check, Sunday 19:00 review. Locally via node-cron; on AWS, EventBridge Scheduler POSTs to `/cron/<job>` with an `x-cron-secret` header.

## How it's built

- **Node 20 + TypeScript**, [grammy](https://grammy.dev) for Telegram, [Fastify](https://fastify.dev) for `/healthz`, `/cron/:job` and the webhook
- **DynamoDB, single table.** One partition per week holds that week's tasks, logs, learned lines and review, so `/score` is one query. Layout is documented at the top of [`src/db/repo.ts`](src/db/repo.ts). DynamoDB Local in Docker for dev.
- **No date library.** Five functions in [`src/domain/time.ts`](src/domain/time.ts) do everything the bot needs, in the owner's timezone.
- **Pure domain logic** in `src/domain/` (rotation, scoring, streaks, formatting) with unit tests; I/O lives in `src/db`, `src/bot.ts`, `src/jobs.ts`.
- `RUN_MODE=polling` for dev, `RUN_MODE=webhook` in production behind `https://jarvis.ammaad.online`.

### Production URL: jarvis.ammaad.online

`ammaad.online` is on Namecheap DNS. Two options, in order of preference:

1. **Move DNS to Cloudflare (free).** Then locally, `cloudflared tunnel` can expose the dev bot at `jarvis.ammaad.online` for webhook testing, and in production a proxied DNS record in front of the Fargate service (later the Lambda function URL) gives free TLS. This is the Week 1 DevOps task.
2. Keep Namecheap DNS and add a CNAME `jarvis` → the ALB / function URL once it exists. No local tunnel with a custom hostname on this path.

## Roadmap

| Weeks | AWS | DevOps | Jarvis |
| --- | --- | --- | --- |
| 1–2 | New account, MFA, budget alarm, 5 onboarding tasks | Dockerfile, CI | All commands, local nudges, text posts |
| 3–4 | ECR, ECS Fargate, DynamoDB, EventBridge Scheduler, IAM task role | Terraform + remote state, deploy via GitHub Actions OIDC | Webhook mode, scorecard PNG |
| 5–6 | CloudWatch alarms → SNS → Telegram | dev/prod environments | Claude Haiku post drafts, hard-capped |
| 7–8 | Migrate to Lambda, tear down Fargate: $0/month | Terraform modules, destroy proven | Architecture write-up |

## License

MIT
