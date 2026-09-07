# Week 0 (2026-09-07 to 2026-09-13): setup

## Why

I have five things I want to do in parallel: learn AWS properly, learn DevOps properly, freelance, build practice projects, and build real ones. I have 5 to 8 hours a week. I derail because nothing forces a choice each day and nothing notices when I skip.

So I'm building the thing that notices. Jarvis is a Telegram bot that tells me what today's slot is, asks me in the evening whether I did it, and turns my logs into a weekly scorecard I post publicly. It runs on AWS, deploys itself, and every piece of infrastructure I add to it is something I learn.

## Shipped

- Scaffolded the bot: Node + TypeScript, grammy, Fastify, DynamoDB single-table, node-cron for local nudges
- Commands: /today /log /learned /done /skip /week /add /score /review /post /park /parked /goals
- Docker Compose with DynamoDB Local, multi-stage Dockerfile, GitHub Actions CI
- Public repo

## Slipped

_fill in on Sunday_

## Lesson

_fill in on Sunday_
