# Setup: from nothing to a live bot

Every step, in order. Roughly 45 minutes, most of it waiting on AWS signup.

You need: Node 20+, Docker Desktop, git, the AWS CLI, and Terraform. All five are
already installed on the machine this was built on.

Values you collect along the way go into **`.env` only**. `npm run tfvars`
copies them into Terraform for you.

---

## Part 1 — Discord application (5 min)

### 1.1 Create the app

Go to **https://discord.com/developers/applications** and sign in.

1. Click **New Application** (top right)
2. Name it `Jarvis`, tick the terms box, click **Create**

You land on **General Information**. Two values here:

| On the page | Goes in `.env` as |
| --- | --- |
| **Application ID** (click Copy) | `DISCORD_APP_ID` |
| **Public Key** (click Copy) | `DISCORD_PUBLIC_KEY` |

The public key is 64 hex characters. It's how the Lambda proves an incoming
request really came from Discord, so it's not secret — it's a *verification* key.

### 1.2 Create the bot user

In the left sidebar click **Bot**.

1. Click **Reset Token** → **Yes, do it!**
2. Click **Copy**

That's `DISCORD_BOT_TOKEN`. **It's shown exactly once.** If you navigate away
before copying, hit Reset Token again — the old one dies, which is fine now but
would break a running deployment later.

While you're on this page, scroll down to **Privileged Gateway Intents** and
leave all three **off**. Jarvis uses slash commands, which need no intents. Every
intent you don't enable is a permission you don't have to justify later.

---

## Part 2 — A server for it to live in (5 min)

### 2.1 Create the server

In the Discord app (not the browser portal):

1. Click **+** at the bottom of the server list on the left
2. **Create My Own** → **For me and my friends**
3. Name it `Jarvis`, click **Create**

Make one channel called **`#journey`**. This is where the morning and evening
nudges land, and it doubles as a visible log of the whole eight weeks.

### 2.2 Invite the bot

Back in the Developer Portal, left sidebar → **OAuth2**.

Scroll to **OAuth2 URL Generator**:

- Under **Scopes**, tick **`bot`** and **`applications.commands`**
- A **Bot Permissions** box appears below. Tick **Send Messages**

Copy the **Generated URL** at the very bottom, paste it into a new browser tab,
choose your `Jarvis` server, click **Continue** → **Authorize**.

> Some accounts see an **Installation** tab instead, with an **Install Link**.
> Either route works; you're after the same result — the bot appears in your
> server's member list.

### 2.3 Copy the two IDs

In Discord: **User Settings** (cog, bottom left) → **Advanced** → turn
**Developer Mode ON**. This adds "Copy ID" to right-click menus.

| Right-click on | Then click | Goes in `.env` as |
| --- | --- | --- |
| the `#journey` channel | Copy Channel ID | `DISCORD_CHANNEL_ID` |
| your own name in the member list | Copy User ID | `OWNER_USER_ID` |

`OWNER_USER_ID` is the lock: commands from any other user are refused.

---

## Part 3 — Fill in `.env` (2 min)

Open `.env` in the project root. The top five lines are the ones you just
collected:

```bash
DISCORD_APP_ID=1234567890123456789
DISCORD_PUBLIC_KEY=0123456789abcdef...   # 64 hex chars
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_CHANNEL_ID=1234567890123456789
OWNER_USER_ID=1234567890123456789
```

Leave everything below alone — the timezone, start date and table name are
already right.

Check it:

```bash
npm run tfvars
```

This validates every value and writes `infra/terraform.tfvars`. If something is
missing it tells you exactly which line. **Both files are gitignored**; the bot
token must never reach the repo.

---

## Part 4 — AWS account (15 min, mostly waiting)

Skip to Part 5 if you already have an account you want to use.

### 4.1 Sign up

**https://portal.aws.amazon.com/billing/signup**

- You need a card. The **Free plan** cannot produce a charge, but AWS verifies
  the card with a small temporary hold that reverses itself.
- Choose the **Free plan** when offered. It gives $100 in credits, plus $100 more
  for completing five onboarding tasks, over six months.
- Verification (email, phone, card) usually takes a few minutes.

Nothing Jarvis uses actually spends those credits: Lambda, DynamoDB, EventBridge
Scheduler and CloudWatch all sit inside the **always-free** tier, which has no
expiry. The credits are for the learning experiments in weeks 1–2.

### 4.2 Lock the root account

Sign in as root, then go to **https://console.aws.amazon.com/iam/**.

1. Top right, click your account name → **Security credentials**
2. Under **Multi-factor authentication (MFA)** → **Assign MFA device**
3. Name it `phone`, choose **Authenticator app**, scan the QR with Google
   Authenticator or Authy, enter two consecutive codes

Do this now. The root user can delete everything and cannot be recovered by
support if it's compromised.

### 4.3 Set a budget alarm

**https://console.aws.amazon.com/billing/home#/budgets** → **Create budget**

- **Zero spend budget** (a preset — it alerts on the first cent)
- Name it `jarvis-any-spend`, put your email in
- Create

This is also **one of the five onboarding tasks worth $20**, so it pays for
itself immediately.

### 4.4 A user for daily work

Still in IAM → **Users** → **Create user**

1. Name: `ammad`
2. **Do not** tick console access — this user is for the CLI
3. Permissions → **Attach policies directly** → tick **AdministratorAccess**
4. Create user, then open it → **Security credentials** → **Create access key**
5. Use case: **Command Line Interface (CLI)**, tick the confirmation, Create
6. **Copy both the Access key and the Secret access key** — the secret is shown once

> Admin on a personal learning account is a reasonable starting posture. Moving
> to IAM Identity Center with scoped permission sets is a week-1 task, and a good
> post.

### 4.5 Point the CLI at it

```bash
aws configure
```

Answer four prompts:

```
AWS Access Key ID     : (paste)
AWS Secret Access Key : (paste)
Default region name   : ap-south-1
Default output format : json
```

Prove it works:

```bash
aws sts get-caller-identity
```

You want JSON back with your account number and `user/ammad`. If you get
`InvalidClientTokenId`, the keys were pasted wrong — run `aws configure` again.

---

## Part 5 — Deploy (5 min)

```bash
npm run build:lambda
terraform -chdir=infra apply
```

Terraform prints a plan of about **13 resources**: the DynamoDB table, the Lambda
function and its URL, two IAM roles with their policies, a log group, and three
schedules. **Read it before typing `yes`.** Getting into that habit is most of
what separates people who use Terraform from people who understand it.

Type `yes`. It takes about a minute. At the end:

```
interactions_url = "https://abc123....lambda-url.ap-south-1.on.aws/"
log_group        = "/aws/lambda/jarvis"
table_name       = "jarvis"
```

Copy the `interactions_url`.

> **If it fails on the schedules** with "the execution role you provide must
> allow AWS EventBridge Scheduler to assume the role" — run `apply` again. That's
> IAM propagation lag, and the second run succeeds.

---

## Part 6 — Connect Discord to AWS (3 min)

### 6.1 The endpoint

Developer Portal → your app → **General Information** → scroll to
**Interactions Endpoint URL** → paste the `interactions_url` → **Save Changes**.

This is the real test. On save, Discord immediately sends your Lambda a signed
PING **and several deliberately invalid signatures**, and only accepts the URL if
the valid one is answered and the invalid ones are rejected.

So if it saves, you've just proved — in one click — that your Ed25519
verification, IAM role, function URL, DynamoDB access and bundle all work.

If it refuses:

```bash
aws logs tail /aws/lambda/jarvis --follow
```

then hit Save again and watch what arrives.

### 6.2 Publish the commands

```bash
npm run register
```

Prints the app name and the 14 commands. Global commands can take a few minutes
to reach every client.

---

## Part 7 — The milestone

In `#journey`, type `/` — the Jarvis commands appear. Run:

```
/today
```

You should get today's slot, from Lambda. Then:

```
/log minutes:120 note:deployed jarvis to lambda goal:aws
/learned text:<whatever surprised you most today>
/post
```

`/post` hands you a LinkedIn draft built from what you actually logged.

**Now close your laptop and run `/today` from your phone.** That's the milestone —
the bot is not running on your machine any more.

---

## Daily use

| When | What happens |
| --- | --- |
| 09:00 | Jarvis posts today's slot and task in `#journey` |
| 21:00 | Asks whether you did it. Two silent days in a row and it says so |
| Sun 19:00 | Posts the week's scorecard, tells you to run `/review` |

You reply with `/log`, `/learned`, `/done` or `/skip`. On Saturday, `/post scope:week`
gives you the weekly write-up. On Sunday, `/review` opens a form with three
questions and then drafts the post for you.

---

## Changing things later

| Task | Command |
| --- | --- |
| Ship a code change | `git push` — CI tests it, then deploys |
| Ship without CI (emergency) | `npm run deploy` |
| Change a slash command | edit `src/discord/commands.ts`, then `npm run register` |
| Watch the logs | `aws logs tail /aws/lambda/jarvis --follow` |
| Fire a nudge early | `aws lambda invoke --function-name jarvis --payload '{"job":"morning"}' --cli-binary-format raw-in-base64-out /dev/stdout` |
| Change a schedule time | edit `locals.schedules` in `infra/main.tf`, then `npm run deploy` |
| Tear it all down | `terraform -chdir=infra destroy` |

## Costs

$0/month. Lambda's 1M requests, DynamoDB's 25 GB, EventBridge Scheduler's 14M
invocations and CloudWatch's 5 GB are all **always-free**, not the six-month
credits. Jarvis does roughly 100 invocations a month.

The `jarvis-any-spend` budget alarm emails you if that ever stops being true.
