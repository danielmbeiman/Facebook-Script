(function () {
  const INVALID_TITLE_TOKENS = [
    /\btoday\b/i,
    /\bpicks\b/i,
    /\bcategories\b/i,
    /far from your location/i,
    /sponsored/i
  ];

  function text(el) {
    return el?.innerText?.trim() || "";
  }

  function parseMoney(value) {
    if (!value) return null;
    const m = value.replace(/,/g, "").match(/\$\s*(\d+(?:\.\d{1,2})?)/);
    return m ? Number(m[1]) : null;
  }

  function isValidTitle(title) {
    if (!title || title.length < 5) return false;
    return !INVALID_TITLE_TOKENS.some((re) => re.test(title));
  }

  function findPriceNearHeader(h1) {
    const priceRegex = /^\$\s*\d[\d,]*(?:\.\d{2})?$/;

    let node = h1;
    const containers = [];
    for (let i = 0; i < 7 && node; i += 1) {
      containers.push(node);
      node = node.parentElement;
    }

    for (const container of containers) {
      const elements = Array.from(container.querySelectorAll("span,div")).filter((el) => {
        const t = text(el);
        return priceRegex.test(t);
      });

      if (!elements.length) continue;

      const ranked = elements
        .map((el) => {
          const rect = el.getBoundingClientRect();
          const headRect = h1.getBoundingClientRect();
          const dy = Math.abs((rect.top + rect.height / 2) - (headRect.top + headRect.height / 2));
          const dx = Math.abs((rect.left + rect.width / 2) - (headRect.left + headRect.width / 2));
          return { el, distance: dy + dx };
        })
        .sort((a, b) => a.distance - b.distance);

      const money = parseMoney(text(ranked[0].el));
      if (money != null) return money;
    }

    return null;
  }

  function findLabelValue(labelPattern) {
    const all = Array.from(document.querySelectorAll("span,div"));
    for (const el of all) {
      const t = text(el);
      if (!labelPattern.test(t)) continue;
      const parent = el.parentElement;
      if (!parent) continue;

      const siblings = Array.from(parent.querySelectorAll("span,div")).map(text).filter(Boolean);
      const value = siblings.find((s) => s !== t && s.length > 1);
      if (value) return value;
    }
    return "";
  }

  function extractDescription() {
    const labels = Array.from(document.querySelectorAll("span,div")).filter((el) => /^description$/i.test(text(el)));
    for (const label of labels) {
      const parent = label.parentElement;
      if (!parent) continue;
      const bits = Array.from(parent.querySelectorAll("span,div")).map(text).filter(Boolean);
      const merged = bits.filter((x) => !/^description$/i.test(x)).join(" ").trim();
      if (merged.length > 3) return merged;
    }
    return "";
  }

  function extractSellerName() {
    const profileLink = document.querySelector('a[href*="/marketplace/profile/"]');
    return text(profileLink) || "Seller";
  }

  function extractGalleryImages() {
    const images = Array.from(document.querySelectorAll('img[src]'))
      .map((img) => ({
        url: img.currentSrc || img.src || "",
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0
      }))
      .filter((img) => /scontent|fbcdn/i.test(img.url) && img.width >= 200 && img.height >= 200)
      .map((img) => ({ ...img, area: img.width * img.height }));

    const deduped = [];
    const seen = new Set();
    for (const img of images) {
      if (seen.has(img.url)) continue;
      seen.add(img.url);
      deduped.push(img);
    }

    deduped.sort((a, b) => b.area - a.area);
    return deduped;
  }

  function collectListingData() {
    const h1 = document.querySelector("h1");
    if (!h1) {
      return { ok: false, error: "Listing header not found." };
    }

    const title = text(h1);
    if (!isValidTitle(title)) {
      return { ok: false, error: "Title validation failed (not a valid listing title)." };
    }

    const price = findPriceNearHeader(h1);
    if (price == null) {
      return { ok: false, error: "Could not locate listing price near header." };
    }

    const description = extractDescription();
    const condition = findLabelValue(/^condition$/i) || "Unknown";
    const location = findLabelValue(/^location$/i);
    const sellerName = extractSellerName();
    const galleryImages = extractGalleryImages();

    return {
      ok: true,
      data: {
        title,
        price,
        description,
        condition,
        location,
        sellerName,
        galleryImages,
        largestImage: galleryImages[0]?.url || ""
      }
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "EXTRACT_LISTING") {
      sendResponse(collectListingData());
    }
    return true;
  });
})();
