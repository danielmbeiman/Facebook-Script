const SIZE_REGEX = /(size|men['’]s size|women['’]s size|youth size)\s*(\d+(?:\.\d+)?)/i;
const CONDITION_MAP = {
  new: "New",
  "brand new": "New",
  "like new": "Like New",
  "used - good": "Used - Good",
  good: "Used - Good",
  "used - fair": "Used - Fair",
  fair: "Used - Fair",
  beat: "Beat"
};

const FILLER_TOKENS = ["retro", "great condition", "excellent condition", "good condition", "clean", "worn once"];
const BRANDS = ["Nike", "Adidas", "Jordan", "New Balance", "Asics", "Puma", "Reebok", "Yeezy"];
const COLLABS = ["Off-White", "Travis Scott", "Union", "Supreme", "A Ma Maniere", "Kith"];

function mapCondition(raw) {
  if (!raw) return "Used - Good";
  const key = raw.trim().toLowerCase();
  for (const [k, v] of Object.entries(CONDITION_MAP)) {
    if (key.includes(k)) return v;
  }
  return "Used - Good";
}

function extractSize(text) {
  const m = text.match(SIZE_REGEX);
  return m ? m[2] : "";
}

function sanitizeText(input) {
  return input
    .replace(/[“”"']/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSneakerTitle(title, description = "") {
  const source = sanitizeText(`${title} ${description}`);
  const lower = source.toLowerCase();
  const size = extractSize(source);

  const brand = BRANDS.find((b) => new RegExp(`\\b${b.toLowerCase()}\\b`, "i").test(lower)) || "";
  const collab = COLLABS.find((c) => new RegExp(c.replace(/[-\s]/g, "[-\\s]?"), "i").test(source)) || "";

  const jordanMatch = source.match(/(?:air\s+)?jordan\s*(\d{1,2})/i);
  const yeezyMatch = source.match(/(?:yeezy\s*)?(350|380|500|700)/i);
  const model = jordanMatch ? `Jordan ${jordanMatch[1]}` : yeezyMatch ? yeezyMatch[1] : "";

  let cleaned = source;
  for (const token of FILLER_TOKENS) {
    cleaned = cleaned.replace(new RegExp(`\\b${token}\\b`, "ig"), " ");
  }
  cleaned = cleaned.replace(/\bmen['’]s size\b|\bwomen['’]s size\b|\byouth size\b|\bsize\b\s*\d+(\.\d+)?/ig, " ");

  const colorwayMatch = cleaned.match(/\b(sail|bred|shadow|mocha|chicago|cement|black|white|red|blue|green)\b/ig);
  const colorway = colorwayMatch ? [...new Set(colorwayMatch.map((s) => s[0].toUpperCase() + s.slice(1).toLowerCase()))].slice(0, 2).join(" ") : "";

  const gs = /\b(gs|grade school|youth)\b/i.test(source) ? "GS" : "";

  const parts = [brand, model, collab, colorway, gs, size ? `size ${size}` : ""].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim() || title;
}

function buildEbayQuery(normalizedTitle, size) {
  const base = sanitizeText(normalizedTitle).replace(/\s+/g, " ").trim();
  const withSize = size && !new RegExp(`\\bsize\\s*${size}\\b`, "i").test(base) ? `${base} size ${size}` : base;
  return withSize;
}

async function fetchEbaySoldComps(query) {
  const params = new URLSearchParams({
    _nkw: query,
    _sacat: "0",
    LH_Sold: "1",
    LH_Complete: "1"
  });
  const url = `https://www.ebay.com/sch/i.html?${params.toString()}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`eBay fetch failed: ${res.status}`);
  const html = await res.text();
  return parseEbaySearchHtml(html);
}

function parseEbaySearchHtml(html) {
  const items = [];
  const blocks = html.split('<li class="s-item').slice(1, 80);
  for (const block of blocks) {
    const title = (block.match(/s-item__title[^>]*>(.*?)<\/h3>/i)?.[1] || "").replace(/<[^>]+>/g, "").trim();
    const priceText = (block.match(/s-item__price[^>]*>(.*?)<\//i)?.[1] || "").replace(/<[^>]+>/g, "").trim();
    const condition = (block.match(/SECONDARY_INFO[^>]*>(.*?)<\//i)?.[1] || "Unknown").replace(/<[^>]+>/g, "").trim();
    const priceMatch = priceText.replace(/,/g, "").match(/\$(\d+(?:\.\d{1,2})?)/);
    const price = priceMatch ? Number(priceMatch[1]) : null;
    if (!title || !price) continue;
    const authenticityGuaranteed = /Authenticity Guarantee/i.test(block);
    const size = extractSize(title);
    items.push({ title, price, condition, authenticityGuaranteed, size });
  }
  return items;
}

function scoreComp(comp, target) {
  let score = 0;
  const t = target.normalizedTitle.toLowerCase();
  const c = comp.title.toLowerCase();

  const targetModel = t.match(/jordan\s*\d{1,2}|\b(350|380|500|700)\b/i)?.[0] || "";
  if (targetModel && c.includes(targetModel.toLowerCase())) score += 40;

  const targetCollab = COLLABS.find((x) => t.includes(x.toLowerCase()));
  if (targetCollab && c.includes(targetCollab.toLowerCase())) score += 20;

  if (target.size && comp.size === target.size) score += 20;

  if (mapCondition(comp.condition) === target.condition) score += 10;

  if (comp.authenticityGuaranteed) score += 10;

  return score;
}

function removeOutliers(values) {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const min = q1 - 1.5 * iqr;
  const max = q3 + 1.5 * iqr;
  return values.filter((v) => v >= min && v <= max);
}

function filterAndRankComps(comps, target) {
  const modelToken = target.normalizedTitle.match(/jordan\s*\d{1,2}|\b(350|380|500|700)\b/i)?.[0];

  let filtered = comps.filter((c) => {
    if (target.size && c.size && c.size !== target.size) return false;
    if (modelToken && !c.title.toLowerCase().includes(modelToken.toLowerCase())) return false;

    const targetIsNew = target.condition === "New";
    const compIsNew = mapCondition(c.condition) === "New";
    if (targetIsNew !== compIsNew) return false;

    return true;
  });

  const inlierPrices = removeOutliers(filtered.map((c) => c.price));
  filtered = filtered.filter((c) => inlierPrices.includes(c.price));

  return filtered
    .map((c) => ({ ...c, score: scoreComp(c, target) }))
    .sort((a, b) => b.score - a.score || b.price - a.price)
    .slice(0, 12);
}

function weightedAverage(comps) {
  if (!comps.length) return null;
  const weighted = comps.reduce((acc, c) => {
    const w = Math.max(1, c.score);
    acc.sum += c.price * w;
    acc.weight += w;
    return acc;
  }, { sum: 0, weight: 0 });
  return weighted.weight ? Number((weighted.sum / weighted.weight).toFixed(2)) : null;
}

function profitTarget(resale) {
  if (resale < 50) return 15;
  if (resale <= 120) return resale < 85 ? 20 : 30;
  return resale < 200 ? 30 : 50;
}

function offerRange(maxBuy, condition) {
  const c = mapCondition(condition);
  if (c === "Beat" || c === "Used - Fair") {
    return { openingOffer: maxBuy * 0.7, finalOffer: maxBuy * 0.75 };
  }
  if (c === "New") {
    return { openingOffer: maxBuy * 0.85, finalOffer: maxBuy * 0.92 };
  }
  return { openingOffer: maxBuy * 0.78, finalOffer: maxBuy * 0.85 };
}

function dealRating(listPrice, maxBuy) {
  if (!listPrice || !maxBuy) return "Unknown";
  const ratio = listPrice / maxBuy;
  if (ratio <= 0.8) return "Excellent";
  if (ratio <= 1.0) return "Good";
  if (ratio <= 1.15) return "Borderline";
  return "Pass";
}

function makeMessages(sellerName, offer, distanceMiles) {
  const x = Math.round(offer);
  const name = sellerName || "there";
  const base = {
    friendly: `Hey ${name}, I’m local and interested. Would you take $${x}?`,
    balanced: `Hey ${name}, I can pick up today. Based on condition, I could do $${x}.`,
    firm: `Hey ${name}, I can come today. My best is $${x}.`
  };

  if (distanceMiles >= 25) {
    base.distance = `Hey, you’re a bit far from me. If you’d take $${x}, I could make the drive.`;
  } else if (distanceMiles >= 10) {
    base.distance = `Would you be open to $${x} if we meet halfway?`;
  } else {
    base.distance = "";
  }

  return base;
}

function analyzeListing(payload) {
  const size = extractSize(`${payload.title} ${payload.description}`);
  const condition = mapCondition(payload.condition);
  const normalizedTitle = normalizeSneakerTitle(payload.title, payload.description);
  const ebayQuery = buildEbayQuery(normalizedTitle, size);

  return fetchEbaySoldComps(ebayQuery).then((rawComps) => {
    const ranked = filterAndRankComps(rawComps, { normalizedTitle, size, condition });
    if (!ranked.length) {
      return {
        ok: false,
        warning: "No valid sold comps found. Use manual override.",
        derived: { normalizedTitle, size, condition, ebayQuery }
      };
    }

    const estimatedResale = weightedAverage(ranked);
    const gasCost = Number((((payload.distanceMiles || 0) * 2) * 0.14).toFixed(2));
    const targetProfit = profitTarget(estimatedResale);
    const netResale = Number((estimatedResale * 0.87).toFixed(2));
    const maxBuy = Number((netResale - gasCost - targetProfit).toFixed(2));
    const offers = offerRange(maxBuy, condition);
    const openingOffer = Number(offers.openingOffer.toFixed(2));
    const finalOffer = Number(offers.finalOffer.toFixed(2));

    return {
      ok: true,
      result: {
        detectedTitle: payload.title,
        normalizedTitle,
        size,
        condition,
        ebayQuery,
        comps: ranked,
        estimatedResale,
        maxBuy,
        openingOffer,
        finalOffer,
        dealRating: dealRating(payload.price, maxBuy),
        messages: makeMessages(payload.sellerName, openingOffer, payload.distanceMiles || 0),
        largestImage: payload.largestImage,
        galleryImages: payload.galleryImages
      }
    };
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ANALYZE_LISTING") return;

  analyzeListing(message.payload)
    .then((data) => sendResponse(data))
    .catch((err) => sendResponse({ ok: false, warning: err.message || "Analysis failed." }));

  return true;
});
