(function () {
  const INVALID_TITLE_TOKENS = [/\btoday\b/i, /\bpicks\b/i, /\bcategories\b/i, /far from your location/i];

  function parseMoney(value) {
    if (!value) return null;
    const m = value.replace(/,/g, "").match(/\$\s*(\d+(?:\.\d{1,2})?)/);
    return m ? Number(m[1]) : null;
  }

  function text(el) {
    return el?.innerText?.trim() || "";
  }

  function findTitleAndPrice() {
    const h1 = document.querySelector("h1");
    if (!h1) return { error: "Listing title not found in header." };

    const title = text(h1);
    if (title.length < 5 || INVALID_TITLE_TOKENS.some((re) => re.test(title))) {
      return { error: "Title validation failed (invalid or non-listing text)." };
    }

    const scope = h1.closest("div")?.parentElement || document.body;
    const candidates = Array.from(scope.querySelectorAll("span,div")).map(text).filter(Boolean);
    const priceText = candidates.find((t) => /^\$\s*\d[\d,]*(?:\.\d{2})?$/.test(t));
    const price = parseMoney(priceText || "");

    if (price == null) {
      return { error: "Could not locate price next to listing header." };
    }

    return { title, price };
  }

  function findLabelValue(labelPattern) {
    const all = Array.from(document.querySelectorAll("span,div"));
    for (const el of all) {
      const t = text(el);
      if (!labelPattern.test(t)) continue;
      const sib = el.parentElement?.querySelector("span:last-child,div:last-child");
      const value = text(sib);
      if (value && value !== t) return value;
    }
    return "";
  }

  function extractDescription() {
    const section = Array.from(document.querySelectorAll("div,span")).find((el) => /description/i.test(text(el)));
    if (!section) return "";
    const parentText = text(section.parentElement);
    return parentText.replace(/\bdescription\b/i, "").trim();
  }

  function extractSellerName() {
    const profileLink = document.querySelector('a[href*="/marketplace/profile/"]');
    return text(profileLink) || "Seller";
  }

  function extractGalleryImages() {
    const images = Array.from(document.querySelectorAll('img[src]'))
      .filter((img) => {
        const src = img.getAttribute("src") || "";
        if (!/scontent|fbcdn/i.test(src)) return false;
        return img.naturalWidth >= 200 && img.naturalHeight >= 200;
      })
      .map((img) => ({
        url: img.src,
        width: img.naturalWidth,
        height: img.naturalHeight,
        area: img.naturalWidth * img.naturalHeight
      }));

    const unique = [];
    const seen = new Set();
    for (const img of images) {
      if (seen.has(img.url)) continue;
      seen.add(img.url);
      unique.push(img);
    }

    unique.sort((a, b) => b.area - a.area);
    return unique;
  }

  function collectListingData() {
    const titlePrice = findTitleAndPrice();
    if (titlePrice.error) {
      return { ok: false, error: titlePrice.error };
    }

    const description = extractDescription();
    const condition = findLabelValue(/^condition$/i) || "Unknown";
    const location = findLabelValue(/^location$/i);
    const sellerName = extractSellerName();
    const galleryImages = extractGalleryImages();

    return {
      ok: true,
      data: {
        title: titlePrice.title,
        price: titlePrice.price,
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
