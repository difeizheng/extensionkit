# ExtensionKit vs. the alternatives

An honest comparison, because you'll Google the others anyway.

## The short version

| Your situation | Best pick |
|---|---|
| Building a **browser extension** and want to charge for it | **ExtensionKit** — it's the only kit built around extension licensing (device slots, offline tokens, CWS checklist) |
| Building a full **web SaaS** (landing page, auth, teams, admin) and have $199-599 | ShipFast / MakerKit / Supastarter — bigger scope, bigger price |
| Building a web SaaS and enjoy wiring it yourself | Open SaaS (free) or DIY — good learning, real time cost |
| Need zero code, happy to share revenue | Gumroad/Paddle + no licensing (trust-based delivery) |

## What the paid SaaS boilerplates give you that this doesn't

ShipFast ($199+) and friends bundle a marketing site, SEO boilerplate, auth,
team management, admin dashboards, and a demo app. If you're building a
multi-user web application, that scope justifies their price and you should
buy one — this kit is not trying to be that.

## What this gives you that they don't

- **The extension-specific hard parts.** Browser extensions aren't websites:
  the client runs sandboxed with no server, users go offline for days, and
  Chrome enforces MV3 rules that break naive fetch-when-you-like designs. The
  offline-first token model and the CWS checklist come from building for those
  constraints, not porting web assumptions.
- **Zero dependencies.** A $300 boilerplate with 1,100 npm packages is a
  supply-chain audit you didn't budget for. This is Node built-ins and vanilla
  JS — readable in an afternoon, still booting in years.
- **A price that matches the scope.** $59 for the Pro pack, free core that's
  genuinely complete. Licensing infrastructure shouldn't cost more than your
  first month of sales.

## The "just use Firebase/Supabase" take

You can. Budget a weekend for: webhook signature verification, replay
protection, device-slot bookkeeping, offline grace logic, and an activation UX
— then keep maintaining them. That weekend is the product. If you'd rather
spend it on your actual extension, that's what this is for.

## The honest "do nothing" option

If your extension is free-as-in-hobby, ship it free and drop a donation link.
Licensing adds real surface area (support email, refunds, review friction).
It earns its complexity only when you have something people already ask to
pay for. Test that with a "Pro waitlist" link before writing any of this.
