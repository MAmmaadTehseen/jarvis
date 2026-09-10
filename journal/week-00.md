# Week 0 (2026-09-07 to 2026-09-13): setup, and live on AWS

## Why

I have five things I want to do in parallel: learn AWS properly, learn DevOps properly, freelance, build practice projects, and build real ones. I have 5 to 8 hours a week. I derail because nothing forces a choice each day and nothing notices when I skip.

So I'm building the thing that notices. Jarvis tells me what today's slot is, asks me in the evening whether I did it, and turns my logs into a weekly scorecard I post publicly.

The plan was to run it locally for two weeks and deploy in week 3. That was wrong: a bot that only answers while my PC is on can't hold anyone accountable. So week 0 ends with it live.

## Shipped

- The bot: Node 22 + TypeScript, DynamoDB single table. Commands: /today /log /learned /done /skip /week /add /score /review /post /park /parked /goals
- Live on AWS Lambda, provisioned with Terraform: DynamoDB table, function URL, EventBridge Scheduler for the three daily jobs, IAM scoped to five actions on one table
- $0/month. Lambda, DynamoDB, EventBridge and CloudWatch all sit inside the always-free tier, not the 6-month signup credits
- CI on every push: typecheck, tests against DynamoDB Local, build, Docker build

## What I got wrong

Two bugs I caused by moving to Lambda, both of which look fine in review:

1. The Sunday review collected its three answers in an in-memory `Map`. Fine for a long-running process; on Lambda each reply can land in a different container, so the answers disappear between questions. Moved to DynamoDB.
2. Terraform set `RUN_MODE=webhook` on the function, but config validation rejects that without a `WEBHOOK_URL` — and the function URL doesn't exist until after the function, so it can't be one of the function's own env vars. Every cold start would have called `process.exit(1)`. The fix was deleting two lines; finding it was the work.

The second one is why there's now a test that parses the environment block out of `main.tf` and checks it against the config schema. Infrastructure and code drift apart quietly.

## The thing I did not see coming

I built it on Telegram. Then, before writing a single deploy step, a connectivity check: `api.telegram.org` times out from my machine. AWS answers fine. Telegram is blocked here, and I had built an accountability tool I could not reach.

The port to Discord took an afternoon, and here is the part worth writing down: `src/domain/` and `src/db/` did not change by a single line. The rotation, the scoring, the streaks, the date maths, the single-table layout — all of it survived a complete change of transport. Only the edges moved.

I did not separate them because I was being disciplined. I did it because pure functions are easier to unit test. Getting a free architecture win out of a decision made for a different reason is, I suspect, most of what good structure actually is.

Discord turned out better anyway. Slash commands come with typed arguments and autocomplete, and the Sunday review is now one form with three boxes instead of three messages back and forth — which also deleted the DynamoDB state I had just written to keep track of a half-finished review.

## Lesson

Two, and they point the same way.

"Deploy it later" is how a tool for beating procrastination becomes a thing I procrastinate about. Getting it live on day one removed the only excuse that mattered.

And: check that the thing you're building on is reachable before you build on it. One `curl` at the start would have saved the whole Telegram detour. I now run the connectivity check first, on every project.

## Ahead of schedule

Two of Week 1's items landed in Week 0.

**Deploys moved to CI.** Pushing to `main` now ships the function once the tests pass, using OIDC rather than access keys - GitHub trades its own signed job token for temporary AWS credentials. The first attempt failed with a flat `AccessDenied`, and everything I could inspect looked right: provider, audience, repo casing. CloudTrail settled it by recording the subject STS was actually handed:

    repo:MAmmaadTehseen@97141225/jarvis@1360305333:ref:refs/heads/main

GitHub now issues immutable subjects with the numeric account and repo ids embedded, so renaming an account can't hand its trust to whoever grabs the freed-up name. My policy expected the classic `repo:owner/name` form. The lesson isn't about OIDC: it's that `AccessDenied` is diagnosable rather than guessable, and I'd been guessing.

**The scorecard is an image.** Skia is ~29 MB, so it lives in a Lambda layer and is imported lazily. The measured result: the weekly job takes 2.3s and 146 MB, while `/today` is still 311 ms with a 338 ms cold start. The layer costs the interaction path nothing.

Building it also broke `npm ci` for a day. I'd declared the linux/arm64 Skia binary as a devDependency, which npm cannot resolve on Windows; installing it with `--force` left a versionless stub in the lockfile that CI then rejected. The fix was to stop pretending it was a dependency at all - the layer build downloads it with `npm pack`, which has no platform check to fight.

Three failures this week, and all three were found by reading what a machine recorded rather than what I assumed: a `curl` timeout, a CloudTrail entry, an `npm ci` error. That's the actual skill.

## Next

Week 1: the five AWS onboarding tasks for the $200 in credits, `/review` writing the journal automatically, Upwork profile live. Daily posts start week 2.
