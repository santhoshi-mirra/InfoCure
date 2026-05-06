# InfoCure

> AI-powered health misinformation detector for NGO community health workers.

![InfoCure](https://img.shields.io/badge/SDG-3%20Good%20Health-green) ![React](https://img.shields.io/badge/React-18-blue) ![Supabase](https://img.shields.io/badge/Backend-Supabase-darkgreen) ![OpenRouter](https://img.shields.io/badge/AI-OpenRouter-purple)

---

## What is InfoCure?

Health misinformation spreads quickly through social media and messaging apps in developing regions. This leads to harmful health decisions in communities with limited access to medical professionals. InfoCure helps NGO field workers verify health claims instantly and respond with evidence-based information that is easy to share with their communities.

**Built for:** GNEC Hackathon 2026 — SDG 3 (Good Health and Well-being)

**Live Demo:** [info-cure.vercel.app](https://info-cure.vercel.app)

---

## Features

- Instant fact-checking of health claims and questions
- Evidence-based verdicts — Supported, Partially Supported, or Not Supported by Evidence
- Smart source citations — CDC, NIH, WHO, AHA, ADA, NAMS and more, picked based on the specific claim
- Social media-ready shareable reply with one-click copy
- 11 language support — English, Arabic, French, Swahili, Hindi, Urdu, Portuguese, Spanish, Bengali, Hausa, Pashto
- Off-topic query rejection — only health-related queries are processed
- Women's health support — menopause, menstruation, PCOS, hormonal issues, endometriosis and more are fully supported
- Crisis support — detects mental health distress and shows hotline numbers for Canada, USA, UK, India, UAE and Pakistan instead of fact-checking
- Community reporting — flag claims circulating in your area, saved to a real Supabase database visible to all users
- Most Reported list — loads from database on page open, updates in real time
- Claim history — last 5 checks saved in session, clickable to refill
- Disclaimer modal on first load — responsible design for a health tool
- Typo handling and automatic spelling correction
- Timeout and retry handling for reliability
- Rate limiting and input sanitization
- Demo Mode — runs without API keys so anyone can explore the interface instantly

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Styling | Custom CSS with CSS variables, dark mode |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| AI | OpenRouter API |
| Database | Supabase (community reports) |
| Hosting | Vercel |
| Fonts | DM Sans, DM Mono (Google Fonts) |

---

## Try It

**Easiest — just open the live site:**

👉 [info-cure.vercel.app](https://info-cure.vercel.app)

No setup, no accounts, no API keys. Works instantly in your browser.

---

## Run Locally

**Prerequisites:**
- Node.js v18 or higher
- No API keys needed to get started

**Steps:**

1. Clone the repository:

```bash
git clone https://github.com/santhoshi-mirra/InfoCure.git
cd InfoCure
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open [http://localhost:5173](http://localhost:5173) in your browser.

> The app runs in **Demo Mode** by default — no API keys needed. A few common health claims have pre-built responses so you can explore the interface straight away. For real AI-powered verification, follow the steps below.

---

### Want Real AI Responses?

To enable real AI-powered health verification, create a `.env` file in the root folder:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_OPENROUTER_API_KEY=your_openrouter_api_key
```

Both [Supabase](https://supabase.com) and [OpenRouter](https://openrouter.ai) are free to sign up. Then deploy the Edge Function:

```bash
supabase functions deploy check-claim
supabase secrets set OPENROUTER_API_KEY=your_openrouter_api_key
supabase secrets set DB_SERVICE_ROLE_KEY=your_service_role_key
```

---

## Challenges

**Model reliability** — Free OpenRouter models are often flaky and go offline without warning. I added retry logic across multiple model fallbacks and timeout handling so the app never freezes.

**Multilingual parsing** — Getting the AI to respond in 11 languages while keeping English section headers for reliable parsing required extensive prompt engineering. The solution was explicitly instructing the model to keep labels in English and translate only the content.

**Responsible design** — Since this is a health tool, every output has real stakes. I added disclaimers, off-topic rejection, crisis detection, and source citations so users always know this is informational, not clinical advice.

**Architecture** — Started with browser-side API calls. Moved to Supabase Edge Functions so the API key is never exposed in the browser and all parsing happens server-side.

**Regional API restrictions** — Several free AI APIs had quota or access issues in the UAE. Required testing multiple providers and building retry logic with multiple model fallbacks.

---

## SDG 3 Alignment

InfoCure directly addresses SDG 3 — Good Health and Well-being by tackling health misinformation, one of the most underrecognized barriers to good health in developing regions. By putting accurate, shareable health information in the hands of NGO field workers at the moment misinformation is spreading, InfoCure helps communities make safer health decisions.

---

## What's Next

- Expand community reporting into a regional misinformation map visible to all NGO workers in an area
- NGO coordinator dashboard showing trending false claims by region
- Direct messaging app integration so health workers can fact-check without leaving the app
- Offline mode for low-connectivity environments

---

## License

MIT