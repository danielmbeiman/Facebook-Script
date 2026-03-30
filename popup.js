const warningEl = document.getElementById("warning");
const resultsEl = document.getElementById("results");
const analyzeBtn = document.getElementById("analyzeBtn");
const distanceInput = document.getElementById("distanceMiles");
const copyImageUrlBtn = document.getElementById("copyImageUrl");
const openImageLink = document.getElementById("openImage");

let latestImageUrl = "";

function showWarning(msg) {
  warningEl.textContent = msg;
  warningEl.classList.remove("hidden");
}

function clearWarning() {
  warningEl.textContent = "";
  warningEl.classList.add("hidden");
}

function money(v) {
  return typeof v === "number" ? `$${v.toFixed(2)}` : "-";
}

function setText(id, value) {
  document.getElementById(id).textContent = value || "-";
}

function setMessage(id, value) {
  document.getElementById(id).value = value || "";
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function extractListing(tabId) {
  return chrome.tabs.sendMessage(tabId, { type: "EXTRACT_LISTING" });
}

async function analyze(payload) {
  return chrome.runtime.sendMessage({ type: "ANALYZE_LISTING", payload });
}

function fillResults(result) {
  setText("detectedTitle", result.detectedTitle);
  setText("normalizedTitle", result.normalizedTitle);
  setText("size", result.size || "Unknown");
  setText("condition", result.condition);
  setText("ebayQuery", result.ebayQuery);
  setText("estimatedResale", money(result.estimatedResale));
  setText("maxBuy", money(result.maxBuy));
  setText("openingOffer", money(result.openingOffer));
  setText("finalOffer", money(result.finalOffer));
  setText("dealRating", result.dealRating);

  setMessage("msgFriendly", result.messages?.friendly || "");
  setMessage("msgBalanced", result.messages?.balanced || "");
  setMessage("msgFirm", result.messages?.firm || "");
  setMessage("msgDistance", result.messages?.distance || "");

  latestImageUrl = result.largestImage || "";
  openImageLink.href = latestImageUrl || "#";
  openImageLink.textContent = latestImageUrl ? "Open Largest Image" : "Largest image unavailable";

  resultsEl.classList.remove("hidden");
}

analyzeBtn.addEventListener("click", async () => {
  clearWarning();
  resultsEl.classList.add("hidden");

  try {
    const tab = await getActiveTab();
    if (!tab?.id || !tab.url?.includes("facebook.com/marketplace/item/")) {
      showWarning("Open a single Facebook Marketplace item listing first.");
      return;
    }

    const listing = await extractListing(tab.id);
    if (!listing?.ok) {
      showWarning(listing?.error || "Failed to extract listing fields.");
      return;
    }

    const distanceMiles = Math.max(0, Number(distanceInput.value || 0));
    const analysis = await analyze({ ...listing.data, distanceMiles });

    if (!analysis?.ok) {
      const base = analysis?.warning || "No comps found. Use manual overrides.";
      showWarning(base);
      if (analysis?.derived) {
        fillResults({
          detectedTitle: listing.data.title,
          normalizedTitle: analysis.derived.normalizedTitle,
          size: analysis.derived.size,
          condition: analysis.derived.condition,
          ebayQuery: analysis.derived.ebayQuery,
          estimatedResale: null,
          maxBuy: null,
          openingOffer: null,
          finalOffer: null,
          dealRating: "Unknown",
          messages: {}
        });
      }
      return;
    }

    fillResults(analysis.result);
  } catch (err) {
    showWarning(err.message || "Unexpected extension error.");
  }
});

document.querySelectorAll("button[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const id = btn.getAttribute("data-copy");
    const text = document.getElementById(id)?.value || "";
    await navigator.clipboard.writeText(text);
  });
});

copyImageUrlBtn.addEventListener("click", async () => {
  if (!latestImageUrl) {
    showWarning("No listing image URL available to copy.");
    return;
  }
  await navigator.clipboard.writeText(latestImageUrl);
});
