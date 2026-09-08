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

Live on AWS Lambda, running at $0/month on the always-free tier. Local development still runs against DynamoDB Local.

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

## Deploy

Everything below is on the AWS always-free tier: Lambda (1M requests/month), DynamoDB
on-demand (25 GB), EventBridge Scheduler (14M invocations/month), CloudWatch Logs
(5 GB/month). None of it expires after the 6-month new-account window, so the running
cost is $0 rather than "free until the credits run out".

There is no server, no load balancer and no NAT gateway, which is where a bill like
this usually comes from. Telegram posts updates straight to a Lambda function URL,
and EventBridge Scheduler invokes the same function for the three daily jobs.

```
Telegram  --POST-->  Lambda function URL  --                                             >-- jarvis (Node 22, arm64) --> DynamoDB
EventBridge Scheduler  --{"job":"morning"}--/
```

One function serves both: [`src/lambda.ts`](src/lambda.ts) treats an event with a
`job` field as a scheduled run and anything else as an HTTP request.

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars   # bot token + chat id
npm run build:lambda
terraform -chdir=infra init
terraform -chdir=infra apply
npm run set-webhook          # points Telegram at the function URL
```

`terraform -chdir=infra destroy` removes every resource.

### Security notes

- The function URL is `AuthType: NONE`, because Telegram can't sign requests with
  SigV4. Terraform generates a 48-character secret that Telegram echoes back in
  `X-Telegram-Bot-Api-Secret-Token` on every update; grammy rejects anything without
  it, so the public URL isn't an open door.
- The Lambda role can call five DynamoDB actions on one table ARN. Nothing else.
- Terraform state holds the bot token and the webhook secret in plain text.
  `infra/.gitignore` keeps state, tfvars and plan files out of git. Moving state to
  an encrypted S3 backend, and the token to SSM Parameter Store, is week 3-4 work.

### jarvis.ammaad.online

Not wired up yet, and not needed: the function URL is already HTTPS with a valid
certificate. A custom domain means an API Gateway HTTP API (or CloudFront) in front
of the function plus an ACM certificate, which is cosmetic for a bot no one types a
URL into. It's a nice week 5 exercise, not a prerequisite.

## Roadmap

| Weeks | AWS | DevOps | Jarvis |
| --- | --- | --- | --- |
| 0 | Account, MFA, budget alarm | Terraform, Lambda, DynamoDB, EventBridge, IAM | Live on AWS at $0/month |
| 1–2 | CloudWatch Log Insights, cost explorer | GitHub Actions deploy via OIDC | Scorecard PNG, `/review` writes the journal |
| 3–4 | S3 remote state, SSM Parameter Store for the token | dev/prod workspaces, plan-on-PR | Claude Haiku post drafts, hard-capped |
| 5–6 | CloudWatch alarms → SNS → Telegram (Jarvis reports on itself) | Custom domain, API Gateway | Streak logic, spend counter |
| 7–8 | Optional: the same bot on ECS Fargate, to compare | Terraform modules, destroy proven | Architecture write-up |

## License

MIT
