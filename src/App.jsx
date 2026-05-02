import { useState, memo, useCallback } from "react";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

const sanitizeInput = (input) => input.trim().slice(0, 500);

async function callAI(prompt, maxTokens = 600) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "HTTP-Referer": "https://infocure.app",
        "X-Title": "InfoCure",
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.4,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await response.json();
    if (data.error) {
      console.error("API Error:", data.error);
      throw new Error("Unable to process request. Please try again.");
    }
    return data.choices?.[0]?.message?.content || "";
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("Request timed out. Please try again.");
    throw new Error(err.message || "API call failed");
  }
}

async function callAIWithRetry(prompt, maxTokens = 600, retries = 2) {
  try {
    return await callAI(prompt, maxTokens);
  } catch (err) {
    if (retries > 0) return callAIWithRetry(prompt, maxTokens, retries - 1);
    throw err;
  }
}

/* ---------- Prompt ---------- */
const getPrompt = (input, language) => `You are a careful health fact-checker for NGO community health workers. Evaluate the user's claim against established guidance from major health authorities (WHO, CDC, NIH, AHA, ADA, NHS, UNICEF, ECDC, FDA, peer-reviewed medical literature).

RULES:
- Choose the verdict honestly: SUPPORTED (well-supported by evidence), MISLEADING (partial truth or missing context), or UNSUPPORTED (false or dangerous).
- Pick the SOURCE most relevant to THIS specific claim. DO NOT default to WHO. Use CDC for infectious disease, AHA for cardiovascular, ADA for diabetes, NIH for general biomedical research, UNICEF for child/maternal health, NHS for clinical guidance, etc.
- The WHATSAPP REPLY MUST be different in wording and tone from the EXPLANATION. The explanation is formal and informative. The WhatsApp reply is warm, friendly, and conversational — like texting a neighbor in a community group. Short sentences. No jargon. End with the source name in parentheses (in English).
- Write EXPLANATION and WHATSAPP REPLY in ${language}. Keep the source authority name in English.
- Use the exact section labels below. Plain text only — no markdown, no asterisks.

Claim: "${input}"

VERDICT: <one word: SUPPORTED, MISLEADING, or UNSUPPORTED>

EXPLANATION:
<3 plain sentences in ${language} explaining what is true or false and why, referencing the relevant guideline.>

SOURCE:
<Name of the most relevant health authority for this specific claim, in English.>

WHATSAPP REPLY:
<2-3 warm, conversational sentences in ${language} as if texting in a community group chat. Different wording and tone from the explanation. End with the source name in parentheses in English.>`;

/* ---------- Bulletproof parser ---------- */
const normalizeVerdict = (raw) => {
  const s = String(raw || "").toUpperCase();
  if (s.includes("UNSUPPORTED") || s.includes("NOT SUPPORTED") || s.includes("FALSE")) return "UNSUPPORTED";
  if (s.includes("MISLEADING") || s.includes("PARTIAL")) return "MISLEADING";
  if (s.includes("SUPPORTED") && !s.includes("UN") && !s.includes("NOT")) return "SUPPORTED";
  if (s.includes("TRUE") || s.includes("CORRECT") || s.includes("ACCURATE")) return "SUPPORTED";
  return "MISLEADING";
};

const shorten = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
};

const inferSource = (text) => {
  const t = String(text || "").toLowerCase();
  if (t.includes("heart") || t.includes("blood pressure") || t.includes("cardio") || t.includes("cholesterol"))
    return "American Heart Association (AHA)";
  if (t.includes("diabet") || t.includes("insulin") || t.includes("blood sugar"))
    return "American Diabetes Association (ADA)";
  if (t.includes("vaccin") || t.includes("infection") || t.includes("outbreak") || t.includes("covid") || t.includes("flu") || t.includes("malaria"))
    return "Centers for Disease Control and Prevention (CDC)";
  if (t.includes("child") || t.includes("infant") || t.includes("breastfeed") || t.includes("maternal") || t.includes("pregnan"))
    return "UNICEF";
  if (t.includes("cancer") || t.includes("research") || t.includes("study") || t.includes("trial"))
    return "National Institutes of Health (NIH)";
  return "World Health Organization (WHO)";
};

const parseResult = (text, originalInput = "") => {
  const safe = String(text || "");

  // Aggressive cleanup of markdown
  const cleaned = safe
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[a-z]*|```/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .trim();

  // Extract by label using regex that tolerates colons, dashes, blank lines, markdown remnants
  const grab = (label) => {
    const re = new RegExp(
      `${label}\\s*[:\\-–]?\\s*([\\s\\S]*?)(?=\\n\\s*(?:VERDICT|EXPLANATION|ANALYSIS|SOURCE|REFERENCE|WHATSAPP\\s*REPLY|WHATSAPP|SHAREABLE)\\s*[:\\-–]?|$)`,
      "i"
    );
    const m = cleaned.match(re);
    return m?.[1]?.trim().replace(/^["']|["']$/g, "") || "";
  };

  let verdict = grab("VERDICT");
  let explanation = grab("EXPLANATION") || grab("ANALYSIS");
  let source = grab("SOURCE") || grab("REFERENCE");
  let whatsapp = grab("WHATSAPP REPLY") || grab("WHATSAPP") || grab("SHAREABLE");

  // Verdict fallback: scan first 200 chars
  if (!verdict) verdict = cleaned.slice(0, 200);
  verdict = normalizeVerdict(verdict);

  // Explanation fallback: take meaningful prose from the response
  if (!explanation) {
    const paragraphs = cleaned
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 40 && !/^(verdict|source|whatsapp)/i.test(p));
    explanation = paragraphs[0] || shorten(cleaned, 400) || "We could not generate a detailed analysis for this claim. Please consult a qualified healthcare professional.";
  }

  // Source fallback: infer from claim + explanation
  if (!source || source.length < 3 || source.length > 120) {
    source = inferSource(originalInput + " " + explanation);
  } else {
    // Strip trailing punctuation/quotes
    source = source.replace(/[.,;]\s*$/, "").trim();
  }

  // WhatsApp fallback: ALWAYS produce something distinct from the explanation
  if (!whatsapp || whatsapp.length < 20) {
    whatsapp = `Hey! Quick note on this one — ${shorten(explanation, 180)} Always best to check with a clinic if you're unsure. (${source})`;
  } else if (whatsapp.trim().toLowerCase() === explanation.trim().toLowerCase()) {
    // If model returned the same text, soften it
    whatsapp = `Just sharing — ${shorten(explanation, 180)} Stay safe everyone! (${source})`;
  }

  // Final guarantees: NEVER return null
  return {
    verdict,
    explanation: explanation.trim(),
    source: source.trim(),
    whatsapp: whatsapp.trim(),
  };
};

/* ---------- UI components ---------- */
function DisclaimerModal({ onAgree }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-icon">⚕</div>
        <h2>Before You Continue</h2>
        <p>InfoCure is a research assistance tool designed to help community health workers verify health claims and answer health questions based on established guidelines.</p>
        <ul>
          <li>This tool does <strong>not</strong> provide medical advice.</li>
          <li>Results should <strong>never</strong> replace consultation with a qualified healthcare professional.</li>
          <li>Do <strong>not</strong> alter, stop, or start any medication or treatment based on results from this tool.</li>
          <li>Information is sourced from recognized health organizations such as WHO and CDC, but may not reflect the latest clinical guidelines.</li>
        </ul>
        <p className="modal-footer-text">By continuing, you acknowledge that this tool is for informational purposes only.</p>
        <button className="agree-btn" onClick={onAgree}>I Understand, Continue</button>
      </div>
    </div>
  );
}

function VerdictBadge({ verdict }) {
  const map = {
    SUPPORTED: { label: "Evidence Supported", className: "badge-supported" },
    MISLEADING: { label: "Partially Supported", className: "badge-misleading" },
    UNSUPPORTED: { label: "Not Supported by Evidence", className: "badge-unsupported" },
  };
  const item = map[verdict] || map["MISLEADING"];
  return <span className={`badge ${item.className}`}>{item.label}</span>;
}

const ResultCard = memo(function ResultCard({ result, onReport, reported }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.whatsapp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Copy failed. Please copy manually.");
    }
  };

  return (
    <div className="result-card">
      <div className="result-header">
        <VerdictBadge verdict={result.verdict} />
      </div>
      <div className="result-section">
        <h4>Analysis</h4>
        <p>{result.explanation}</p>
      </div>
      <div className="result-section">
        <h4>Source</h4>
        <p>{result.source}</p>
      </div>
      <div className="result-section whatsapp-section">
        <h4>Shareable Reply</h4>
        <p className="whatsapp-text">{result.whatsapp}</p>
        <button className="copy-btn" onClick={handleCopy}>
          {copied ? "Copied" : "Copy to Clipboard"}
        </button>
      </div>
      <div className="report-section">
        <button
          className={`report-btn ${reported ? "reported" : ""}`}
          onClick={onReport}
          disabled={reported}
        >
          {reported ? "Reported to community" : "Report as circulating in my community"}
        </button>
      </div>
    </div>
  );
});

function ClaimHistory({ history, onSelect }) {
  if (history.length === 0) return null;
  return (
    <div className="history-card">
      <h4 className="history-title">Recent Checks</h4>
      <div className="history-list">
        {history.map((item, i) => (
          <div key={i} className="history-item" onClick={() => onSelect(item.claim)}>
            <span className={`history-dot ${item.verdict.toLowerCase()}`} />
            <span className="history-text">{item.claim}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommunityReports({ reports }) {
  if (reports.length === 0) return null;
  return (
    <div className="history-card">
      <h4 className="history-title">Most Reported in Community</h4>
      <div className="history-list">
        {reports.slice(0, 5).map((item, i) => (
          <div key={i} className="history-item">
            <span className="history-count">{item.count}x</span>
            <span className="history-text">{item.claim}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const EXAMPLES = [
  "Does salt water cure infections?",
  "Can vaccines cause infertility?",
  "Is garlic good for high blood pressure?",
];

const MIN_CALL_INTERVAL = 2000;

export default function App() {
  const [agreed, setAgreed] = useState(false);
  const [claim, setClaim] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [offTopic, setOffTopic] = useState(false);
  const [language, setLanguage] = useState("English");
  const [history, setHistory] = useState([]);
  const [reports, setReports] = useState([]);
  const [reported, setReported] = useState(false);
  const [currentClaim, setCurrentClaim] = useState("");
  const [lastCallTime, setLastCallTime] = useState(0);

  const languages = [
    "English", "Arabic", "French", "Swahili",
    "Hindi", "Urdu", "Portuguese", "Spanish", "Bengali", "Hausa", "Pashto",
  ];

  const resetState = () => {
    setResult(null);
    setOffTopic(false);
    setWarning("");
    setError("");
  };

  const handleCheck = useCallback(async (overrideClaim) => {
    const raw = overrideClaim || claim;
    const input = sanitizeInput(raw);

    if (!input) {
      setWarning("Please enter a health claim or question before checking.");
      return;
    }

    const now = Date.now();
    if (now - lastCallTime < MIN_CALL_INTERVAL) {
      setWarning("Please wait a moment before checking another claim.");
      return;
    }
    setLastCallTime(now);

    setWarning("");
    setError("");
    setResult(null);
    setOffTopic(false);
    setReported(false);
    setLoading(true);
    setCurrentClaim(input);
    setLoadingStep("Checking relevance...");

    try {
      const relevanceCheck = await callAIWithRetry(
        `Is the following specifically about health, medicine, nutrition, disease, or medical treatment? Reply YES or NO only.\n"${input}"`,
        5
      );

      if (!relevanceCheck.trim().toUpperCase().startsWith("YES")) {
        setOffTopic(true);
        setLoading(false);
        setLoadingStep("");
        return;
      }

      setLoadingStep("Analyzing...");

      const text = await callAIWithRetry(getPrompt(input, language), 600);
      const parsed = parseResult(text, input); // never returns null

      setResult(parsed);
      setHistory(prev => [{
        claim: input.length > 60 ? input.substring(0, 60) + "..." : input,
        verdict: parsed.verdict,
      }, ...prev].slice(0, 5));

    } catch (err) {
      setError(
        err.message.includes("timed out")
          ? "Server is busy. Please try again in a moment."
          : err.message
      );
    }

    setLoading(false);
    setLoadingStep("");
  }, [claim, language, lastCallTime]);

  const handleReport = () => {
    setReported(true);
    setReports(prev => {
      const existing = prev.find(r => r.claim === currentClaim);
      if (existing) {
        return prev.map(r => r.claim === currentClaim ? { ...r, count: r.count + 1 } : r)
          .sort((a, b) => b.count - a.count);
      }
      return [...prev, { claim: currentClaim, count: 1 }].sort((a, b) => b.count - a.count);
    });
  };

  const handleSelectHistory = (selectedClaim) => {
    setClaim(selectedClaim);
    resetState();
  };

  return (
    <>
      {!agreed && <DisclaimerModal onAgree={() => setAgreed(true)} />}
      <div className="app">
        <header className="header">
          <h1>InfoCure</h1>
          <p>Health Misinformation Detector for Community Health Workers</p>
          <p className="subtle-note">Works best with clear health claims.</p>
          <div className="about-banner">
            <p>Health misinformation spreads rapidly through WhatsApp groups in developing regions, leading to dangerous health decisions in communities with limited access to medical professionals. InfoCure helps NGO field workers instantly verify claims and respond with evidence-based information directly shareable to their communities.</p>
          </div>
        </header>
        <main className="main">
          {offTopic && (
            <div className="offtopic-top-banner">
              This tool only covers health-related claims and questions. Please try again with a health topic.
            </div>
          )}
          <div className="card">
            <div className="field-row">
              <label className="field-label">Health Claim or Question</label>
              <select
                className="language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {languages.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>
            <textarea
              className="claim-input"
              placeholder='e.g. "Does eating garlic cure high blood pressure?" or "What should I eat to manage thyroid?"'
              value={claim}
              onChange={(e) => {
                setClaim(e.target.value);
                setWarning("");
                setOffTopic(false);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCheck();
              }}
            />
            <div className="examples">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  className="example-btn"
                  onClick={() => {
                    setClaim(ex);
                    resetState();
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
            {warning && <p className="warning-text">{warning}</p>}
            <button
              className="check-btn"
              onClick={() => handleCheck()}
              disabled={loading}
            >
              {loading ? loadingStep || "Analyzing..." : "Check"}
            </button>
          </div>
          {error && <div className="error-card" role="alert"><p>{error}</p></div>}
          {result && (
            <ResultCard
              result={result}
              onReport={handleReport}
              reported={reported}
            />
          )}
          <ClaimHistory history={history} onSelect={handleSelectHistory} />
          <CommunityReports reports={reports} />
        </main>
        <footer className="footer">
          <p>InfoCure is for informational purposes only and does not constitute medical advice.</p>
        </footer>
      </div>
    </>
  );
}
