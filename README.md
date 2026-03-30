# Facebook Marketplace Resale Assistant

Manifest V3 Chrome extension that analyzes the currently open Facebook Marketplace listing and estimates resale value from eBay sold comps.

## Features

- Strict listing extraction from currently open item page
- Deterministic sneaker normalization and size parsing
- eBay sold+completed comps parsing and scoring
- Profit/max buy/offer math (fees + gas + target profit)
- Negotiation message generation
- Popup UI with copy buttons, image URL tools, and manual override fields when extraction fails

## Install (Developer Mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder
5. Open a Facebook Marketplace item page and click extension icon

## Notes

- The extension analyzes only the single listing currently open.
- It does not auto-message sellers.
- If title extraction is invalid or comps are missing, popup shows warning and supports manual override values for title/price/details.
