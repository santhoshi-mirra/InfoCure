# InfoCure

> AI-powered health misinformation detector for NGO community health workers.

![InfoCure](https://img.shields.io/badge/SDG-3%20Good%20Health-green) ![React](https://img.shields.io/badge/React-18-blue) ![OpenRouter](https://img.shields.io/badge/AI-OpenRouter-purple)

---

## What is InfoCure?

Health misinformation spreads quickly through WhatsApp groups in developing areas. This can lead to harmful health decisions in communities that have limited access to medical professionals. InfoCure helps NGO field workers verify health claims instantly. They can then respond with information based on evidence, which is easy to share with their communities.

**Built for:** GNEC Hackathon 2026 — SDG 3 (Good Health and Well-being)

---

## Features

- Instant fact-checking of health claims and questions
- Evidence-based verdicts: Supported, Partially Supported, or Not Supported 
- Source citations from WHO, CDC, and NIH 
- WhatsApp-ready shareable reply with one click
- 11 language support: English, Arabic, French, Swahili, Hindi, Urdu, Portuguese, Spanish, Bengali, Hausa, Pashto
- Off-topic query rejection
- Claim history for the session
- Community reporting: flag claims circulating in your area
- Typo handling and spelling correction - Timeout and retry handling for reliability

---

## Tech Stack

- **Frontend:** React 18 + Vite
- **Styling:** Custom CSS with CSS variables
- **AI:** OpenRouter API
- **Languages:** JavaScript, CSS

---

## How to Run Locally

**Prerequisites:**
- Node.js v18 or higher
- An OpenRouter API key (free at [openrouter.ai](https://openrouter.ai))

**Steps:**

1. Clone the repository:
```bash
git clone https://github.com/your-username/infocure.git
cd infocure
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root folder:
VITE_OPENROUTER_API_KEY=your_api_key_here

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Challenges

**Model reliability** — Free OpenRouter models are often flaky and go offline without warning. I added retry logic and timeouts so the app doesn't freeze up if a model drops during a demo.

**Multilingual parsing** — Getting the AI to use 11 languages while keeping English headers for the parser was tough. I spent a lot of time on the prompts to make sure the code could still read the sections correctly.

**Responsible design** — Since this is a health tool, the results have real stakes. I focused on safety by adding disclaimers, limiting it to health topics, and citing sources so users know it's just for information, not a clinical diagnosis.

**Speed optimization** — I sped things up by moving from three sequential API calls to a two-step pipeline. It only translates when necessary now, which cut down the wait time quite a bit.
---

## SDG 3 Alignment

InfoCure works on the  **SDG 3 — Good Health and Well-being** by fighting health misinformation, which is a big but often ignored problem in developing areas. By giving NGO workers accurate info they can share, the app helps people in those regions make safer decisions about their health.
---

## License

MIT