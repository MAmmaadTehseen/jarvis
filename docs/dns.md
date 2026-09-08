# jarvis.ammaad.online

Current state (checked 2026-09-07): `ammaad.online` uses Namecheap DNS (`dns1.registrar-servers.com`, `dns2.registrar-servers.com`). A wildcard or catch-all record already resolves `jarvis.ammaad.online` to `198.54.117.242`, which is Namecheap parking, not anything of yours.

Telegram webhooks need HTTPS on port 443 with a valid certificate. There is no AWS endpoint yet, so this is set up in two stages.

## Stage 1, Week 1 (DevOps slot): Cloudflare + tunnel, so the local bot answers on the real hostname

1. Add `ammaad.online` to Cloudflare (free plan). It imports the existing records; check that the apex and `www` records still point at wherever the portfolio is hosted before you switch.
2. At Namecheap, set the domain's nameservers to the two Cloudflare gives you. Propagation is usually under an hour.
3. Install `cloudflared`, then:

```bash
cloudflared tunnel login
cloudflared tunnel create jarvis
cloudflared tunnel route dns jarvis jarvis.ammaad.online
cloudflared tunnel run --url http://localhost:3000 jarvis
```

4. In `.env`: `RUN_MODE=webhook` and `WEBHOOK_URL=https://jarvis.ammaad.online`, then restart. The bot registers the webhook itself on boot.

Why this order: it gives you a real HTTPS hostname before any AWS bill exists, and Cloudflare in front of AWS is what you want in weeks 3 and 4 anyway.

Careful: moving nameservers moves *all* DNS for the domain. Copy every existing record from Namecheap into Cloudflare before flipping, especially anything for the portfolio site and any email records (MX, SPF, DKIM). Losing mail records silently breaks email.

## Stage 2, Weeks 3-4 (AWS slot): point the hostname at the real service

Once the Fargate service is up:

- Give the service a public endpoint (ALB, or the task's public IP behind Cloudflare while you're learning).
- In Cloudflare, replace the tunnel record for `jarvis` with a proxied `CNAME` to the ALB hostname (orange cloud on, so Cloudflare terminates TLS).
- `WEBHOOK_URL` stays the same, so nothing in the bot changes.

After the Week 7 Lambda migration the same record points at the function URL instead. The hostname never changes across all three deployments, which is a nice detail for the write-up.

## Fallback if you'd rather not move nameservers

Keep Namecheap DNS and skip stage 1. Run the bot in polling mode locally (the default, no public hostname needed), and only add a `CNAME jarvis` record at Namecheap in week 3 once the AWS endpoint exists. You lose local webhook testing but nothing else.
