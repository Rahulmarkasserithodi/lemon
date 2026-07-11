import json, glob
import lemon.config as c

ps = [json.loads(open(p).read()) for p in glob.glob(str(c.PROCESSED / "products" / "*.json"))]
keywords = ["laptop", "chromebook", "pavilion", "nitro", "thinkpad", "ideapad", "aspire", "omen", "envy", "macbook", "notebook"]
laptops = [p for p in ps if any(k in (p.get("title") or "").lower() for k in keywords)]
other = [p for p in ps if p not in laptops]

print(f"Total products: {len(ps)}")
print(f"Laptops: {len(laptops)}, Appliances: {len(other)}")
print()
for p in sorted(laptops, key=lambda x: x.get("median_months") or 0, reverse=True):
    pub = "PUB" if p.get("published") else "   "
    med = p.get("median_months")
    cpy = p.get("cost_per_year")
    print(f"  {pub} {p['parent_asin']}  {med}mo  ${cpy}  {p.get('title','')[:55]}")
