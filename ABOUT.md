## 💡 Inspiration

We kept hitting the same frustration: you buy the cheap kettle, the $180 laptop, the "great value" printer — and it dies in months. So you buy another. Star ratings tell you whether people *liked* a product the week it arrived; they say nothing about whether it survives two years. That gap is quietly enormous: **we don't have a recycling problem so much as a *buying* problem.** We choose on sticker price, products fail young, and the replacement cycle fills landfills.

The theme asked us to *meaningfully reduce consumerism* — to make people buy less and keep things longer. We realized the most powerful lever isn't guilt; it's **information**. If shoppers could see how long a product *actually lasts*, and its true **cost per year of life** instead of its price tag, the durable choice becomes the obvious one. That's Tenure — the *Durability Ledger*.

## 🔍 What it does

Tenure mines time-to-failure signals from millions of Amazon review texts, runs **real survival analysis**, and reframes shopping around durability, closing the whole product lifecycle:

- **Buy to last** — compare two products' survival curves side by side, with a headline **cost-per-year-of-life**. Our favorite demo: a **$440 Acer Aspire** dies *sooner* than a **$345 Lenovo Chromebook** (median 5 vs 6 months), so it costs **\$88/mo to own vs \$57.50**. Sticker price told you the *opposite* of the truth.
- **Repair, don't replace** — every product's *Durability Report* turns its top failure modes into concrete fixes ("swap the SSD," "replace the battery"), tagged DIY / Shop / Pro, with iFixit links.
- **Recycle right** — when it truly dies, a map finds the nearest certified recycling drop-off, so it never hits landfill.

## 🛠️ How we built it

The core is a genuine statistics pipeline, not a wrapper:

1. **Extraction.** We stream the McAuley *Amazon Reviews 2023* corpus and use a Gemini model with structured output to pull survival observations from free text — *"died after 8 months"* becomes a failure event; *"still going strong after 2 years"* becomes a **right-censored** observation. Each result is cached in SQLite, keyed by a review hash, so re-runs are free.

2. **Survival model.** Per product we fit the **Kaplan–Meier** estimator over months owned:

$$\hat{S}(t) = \prod_{t_i \le t}\left(1 - \frac{d_i}{n_i}\right)$$

where $d_i$ failures occur among $n_i$ units still "at risk" at time $t_i$. We shade **95% confidence bands** using Greenwood's variance:

$$\widehat{\operatorname{Var}}\big(\hat{S}(t)\big) = \hat{S}(t)^2 \sum_{t_i \le t} \frac{d_i}{n_i\,(n_i - d_i)}$$

The **median lifespan** is the first $t$ where $\hat{S}(t) \le 0.5$, and the headline metric is simply

$$\text{cost per year of life} = \frac{\text{price}}{\text{median lifespan (years)}}.$$

3. **Product.** A React + Vite + Tailwind + Recharts frontend in an editorial "lab ledger" design system, backed by a FastAPI server for on-demand, cached extraction. Deployed live on **Vercel + Render** — 2.6M+ reviews, appliances *and* laptops, working end to end.

## 🧗 Challenges we ran into

- **Signal in noise.** Self-reported durations are messy and *right-censored* — most reviewers who say "still works" never tell you when it dies. Modeling that correctly (instead of naively averaging) was the whole ballgame; we added honesty thresholds ($\ge 25$ observations, $\ge 10$ events) and report medians as lower bounds when a curve never crosses $0.5$.
- **Scaling to laptops.** Laptops live in Amazon's *Electronics* category — **44M reviews, 22 GB uncompressed.** We couldn't index all of it, so we filter metadata to real laptops, then stream the reviews once, keeping only what we need. Our first filter matched *"laptop"* in the title and swept in webcams, headsets, and briefcases; the fix was realizing real laptops sit in the **`Laptops` category** (plural), while accessories sit under *"Laptop Accessories."*
- **Latency.** Sequential LLM calls made a cold product take ~2 minutes. We rewrote extraction to fan out concurrently and got a **~10× speedup**.
- **Shipping it.** A 1.1 GB review index is awkward to deploy, so we built a slim, catalog-only database (**337 MB**) and a bootstrap that auto-refreshes when the source changes. The recycle map hit CORS limits calling OpenStreetMap from the browser, which we solved with a backend proxy.

## 📚 What we learned & accomplishments

We're proudest that Tenure is **real analysis, not vibes** — actual Kaplan–Meier curves with confidence intervals over millions of reviews, in a polished, deployed product. Along the way we learned survival statistics end to end, how to make LLM extraction economical at scale through caching, and how to stream tens of gigabytes without drowning in it. Most of all, we found a framing we believe in: **durability *is* sustainability**, and the greenest product is the one you never have to replace.

## 🚀 What's next

Quantifying avoided impact (kg of e-waste and CO₂ saved by choosing the durable option), more categories, and a browser extension that shows a product's *cost per year of life* right on the Amazon page — durability, exactly where the buying decision happens.
