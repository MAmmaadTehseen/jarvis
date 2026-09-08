# Jarvis

[![ci](https://github.com/MAmmaadTehseen/jarvis/actions/workflows/ci.yml/badge.svg)](https://github.com/MAmmaadTehseen/jarvis/actions/workflows/ci.yml)

A self-hosted accountability bot that runs my learning journey in public.

I have five things I want to do at once: learn AWS properly, learn DevOps properly, freelance, build practice projects, build real ones. I have 5 to 8 hours a week and I derail easily, because nothing forces a choice each day and nothing notices when I skip.

Jarvis notices. It's a Discord bot that:

- tells me every morning what today's one slot is (Mon Jarvis · Tue AWS · Wed Jarvis · Thu DevOps · Fri Freelance · Sat Content · Sun Review)
- asks me every evening whether I did it, and says so when I've missed two days in a row
- turns my logs into a weekly scorecard with streaks, which I post on LinkedIn every Saturday
- drafts my daily "what I learned" post from what I actually logged

And it is itself the project: every piece of AWS and DevOps I learn gets applied to Jarvis first. Fargate and Terraform, GitHub Actions with OIDC, CloudWatch alarms that message me through Jarvis, and finally a migration to Lambda so the whole thing costs $0 a month.

The journey is in [`journal/`](journal/), one file per week.

## Status

Runs on AWS Lambda at $0/month, on the always-free tier. Started out on Telegram;
`api.telegram.org` turned out to be blocked from where I live, so the transport
moved to Discord. `src/domain/` and `src/db/` did not change a line — only the
edges did, which is the first time keeping them separate actually paid off.

## Run it

You need Node 20+, Docker, and a Discord application.

```bash
cp .env.example .env        # fill in the Discord ids and token
docker compose up -d        # DynamoDB Local on :8001
npm install
npm test                    # date math, scoring, streaks, signature verification
npm run typecheck
```

Discord delivers interactions over HTTPS, so driving the local server from
Discord needs a tunnel (`cloudflared tunnel --url http://localhost:3000`) with
that URL set as the app's Interactions Endpoint. Without one, `POST /cron/morning`
still fires a nudge, and the tests cover the rest. Day to day it is easier to
just deploy: the whole cycle is `npm run deploy`.

## Commands

| Command | What it does |
| --- | --- |
| `/today` | Today's slot, task, and minutes logged so far |
| `/log minutes: note: [goal:]` | Record time. Defaults to today's goal |
| `/learned text:` | The one line that becomes today's post |
| `/done [n:]` · `/skip reason: [n:]` | Task status. `n` is the number from `/week` |
| `/week` · `/add task: [goal:]` | This week's tasks. On Sunday `/add` targets next week |
| `/score` | Scorecard: minutes vs target per goal, tasks, streaks |
| `/review` | Opens a form with the three Sunday questions |
| `/post [scope:]` | LinkedIn draft from real data |
| `/park idea:` · `/parked` | Ideas wait until Sunday. That's the rule |

Scheduled: 09:00 morning nudge, 21:00 evening check, Sunday 19:00 scorecard.
EventBridge Scheduler invokes the function directly with `{"job":"morning"}`.

## How it's built

- **Node 22 + TypeScript**, no Discord library: interactions are plain HTTP, and
  signature verification is 30 lines of `node:crypto` in [`src/discord/verify.ts`](src/discord/verify.ts)
- **DynamoDB, single table.** One partition per week holds that week's tasks, logs, learned lines and review, so `/score` is one query. Layout is documented at the top of [`src/db/repo.ts`](src/db/repo.ts). DynamoDB Local in Docker for dev.
- **No date library.** Five functions in [`src/domain/time.ts`](src/domain/time.ts) do everything the bot needs, in the owner's timezone.
- **Pure domain logic** in `src/domain/` (rotation, scoring, streaks, formatting) with unit tests; I/O lives in `src/db`, `src/bot.ts`, `src/jobs.ts`.
- **The three-second rule.** Discord discards any interaction not answered within
  3s, so every handler is one or two DynamoDB round trips and the function has
  512 MB to keep cold starts short.

## Deploy

Everything below is on the AWS always-free tier: Lambda (1M requests/month), DynamoDB
on-demand (25 GB), EventBridge Scheduler (14M invocations/month), CloudWatch Logs
(5 GB/month). None of it expires after the 6-month new-account window, so the running
cost is $0 rather than "free until the credits run out".

There is no server, no load balancer and no NAT gateway, which is where a bill like
this usually comes from. Discord posts interactions straight to a Lambda function
URL, and EventBridge Scheduler invokes the same function for the three daily jobs.

```
Discord ──signed POST──▶ Lambda function URL ──┐
                                               ├──▶ jarvis (Node 22, arm64) ──▶ DynamoDB
EventBridge Scheduler ──{"job":"morning"}──────┘
```

One function serves both: [`src/lambda.ts`](src/lambda.ts) treats an event with a
`job` field as a scheduled run and anything else as an HTTP request.

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars   # Discord ids + token
npm run build:lambda
terraform -chdir=infra init
terraform -chdir=infra apply
npm run register             # publishes the slash commands
```

Then paste the `interactions_url` output into the Developer Portal as the app's
**Interactions Endpoint URL**. Discord immediately posts a signed PING, plus a
few deliberately invalid signatures, and only saves the URL if all of them are
answered correctly.

`terraform -chdir=infra destroy` removes every resource.

### Security notes

- The function URL is `AuthType: NONE`, because Discord can't sign requests with
  SigV4. Every interaction carries an Ed25519 signature over `timestamp + body`,
  verified against the app's public key before the body is even parsed, so the
  public URL isn't an open door.
- Commands from any user id other than `OWNER_USER_ID` are refused.
- The Lambda role can call five DynamoDB actions on one table ARN. Nothing else.
- Terraform state holds the bot token and the webhook secret in plain text.
  `infra/.gitignore` keeps state, tfvars and plan files out of git. Moving state to
  an encrypted S3 backend, and the token to SSM Parameter Store, is week 3-4 work.

### jarvis.ammaad.online

Not wired up, and not needed: the function URL is already HTTPS with a valid
certificate. A custom domain means an API Gateway HTTP API (or CloudFront) plus an
ACM certificate, which is cosmetic for an endpoint only Discord ever calls. A nice
week 5 exercise, not a prerequisite.

## Roadmap

| Weeks | AWS | DevOps | Jarvis |
| --- | --- | --- | --- |
| 0 | Account, MFA, budget alarm | Terraform, Lambda, DynamoDB, EventBridge, IAM | Live on AWS at $0/month |
| 1–2 | CloudWatch Log Insights, cost explorer | GitHub Actions deploy via OIDC | Scorecard image, `/review` writes the journal |
| 3–4 | S3 remote state, SSM Parameter Store for the token | dev/prod workspaces, plan-on-PR | Claude Haiku post drafts, hard-capped |
| 5–6 | CloudWatch alarms → SNS → Discord (Jarvis reports on itself) | Custom domain, API Gateway | Streak logic, spend counter |
| 7–8 | Optional: the same bot on ECS Fargate, to compare | Terraform modules, destroy proven | Architecture write-up |

## License

MIT
