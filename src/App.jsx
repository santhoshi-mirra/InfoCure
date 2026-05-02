import { useState } from "react";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

async function callAI(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
        "HTTP-Referer": "https://infocure.app",
        "X-Title": "InfoCure",
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices?.[0]?.message?.content || "";
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("Request timed out. Please try again.");
    throw new Error(err.message || "API call failed");
  }
}

async function callAIWithRetry(prompt, retries = 2) {
  try {
    return await callAI(prompt);
  } catch (err) {
    if (retries > 0) return callAIWithRetry(prompt, retries - 1);
    throw err;
  }
}

function DisclaimerModal({ onAgree }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-icon">⚕</div>
        <h2>Before You Continue</h2>
        <p>
          InfoCure is a research-assistance tool designed to help community health workers
          verify health claims and answer health questions based on established guidelines.
        </p>
        <ul>
          <li>This tool does <strong>not</strong> provide medical advice.</li>
          <li>Results should <strong>never</strong> replace consultation with a qualified healthcare professional.</li>
          <li>Do <strong>not</strong> alter, stop, or start any medication or treatment based on results from this tool.</li>
          <li>Information is sourced from recognized health organizations such as WHO and CDC, but may not reflect the latest clinical guidelines.</li>
        </ul>
        <p className="modal-footer-text">
          By continuing, you acknowledge that this tool is for informational purposes only.
        </p>
        <button className="agree-btn" onClick={onAgree}>
          I Understand, Continue
        </button>
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

function ResultCard({ result, onReport, reported }) {
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
}

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

  const languages = [
    "English", "Arabic", "French", "Swahili",
    "Hindi", "Urdu", "Portuguese", "Spanish", "Bengali", "Hausa", "Pashto",
  ];

  const parseResult = (text) => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    let verdict = "MISLEADING";
    let explanation = "";
    let source = "";
    let whatsapp = "";
    let currentSection = "";

    for (const line of lines) {
      if (line.startsWith("VERDICT:")) {
        const v = line.replace("VERDICT:", "").trim().toUpperCase();
        if (v.includes("UNSUPPORTED") || v.includes("NOT SUPPORTED") || v.includes("FALSE")) verdict = "UNSUPPORTED";
        else if (v.includes("SUPPORTED") && !v.includes("UN") && !v.includes("PARTIAL")) verdict = "SUPPORTED";
        else verdict = "MISLEADING";
        currentSection = "";
      } else if (line.startsWith("OFF-TOPIC:")) {
        return null;
      } else if (line.startsWith("EXPLANATION:") || line.startsWith("ANSWER:")) {
        currentSection = "explanation";
        const inline = line.replace("EXPLANATION:", "").replace("ANSWER:", "").trim();
        if (inline) explanation += inline + " ";
      } else if (line.startsWith("SOURCE:")) {
        currentSection = "source";
        const inline = line.replace("SOURCE:", "").trim();
        if (inline) source += inline + " ";
      } else if (line.startsWith("WHATSAPP REPLY:")) {
        currentSection = "whatsapp";
        const inline = line.replace("WHATSAPP REPLY:", "").trim();
        if (inline) whatsapp += inline + " ";
      } else {
        if (currentSection === "explanation") explanation += line + " ";
        else if (currentSection === "source") source += line + " ";
        else if (currentSection === "whatsapp") whatsapp += line + " ";
      }
    }

    return {
      verdict,
      explanation: explanation.trim(),
      source: source.trim() || "World Health Organization (WHO)",
      whatsapp: whatsapp.trim(),
    };
  };

  const handleCheck = async (overrideClaim) => {
    const input = overrideClaim || claim;
    if (!input.trim()) {
      setWarning("Please enter a health claim or question before checking.");
      return;
    }
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
        `Classify this as HEALTH or NOT_HEALTH. Answer one word only.\n"${input}"`
      );

      const label = relevanceCheck.trim().toUpperCase();
      if (label === "NOT_HEALTH") {
        setOffTopic(true);
        setLoading(false);
        setLoadingStep("");
        return;
      }

      setLoadingStep("Analyzing claim...");

      const prompt = `You are a health fact-checker for NGO workers. STRICT FORMAT. DO NOT CHANGE LABELS.

Input: "${input}"

VERDICT: [SUPPORTED or MISLEADING or UNSUPPORTED]

EXPLANATION:
[2 sentences max. Simple language. No jargon.]

SOURCE:
[One source only, e.g. World Health Organization (WHO)]

WHATSAPP REPLY:
[2 sentences. Friendly tone. End with source in parentheses.]`;

      const text = await callAIWithRetry(prompt);

      if (text.trim().startsWith("OFF-TOPIC:")) {
        setOffTopic(true);
        setLoading(false);
        setLoadingStep("");
        return;
      }

      let parsed = parseResult(text);
      if (!parsed) {
        setOffTopic(true);
        setLoading(false);
        setLoadingStep("");
        return;
      }

      if (!parsed.explanation) {
        throw new Error("Unexpected response format. Please try again.");
      }

      if (language !== "English") {
        setLoadingStep(`Translating to ${language}...`);
        try {
          const translatePrompt = `Translate into ${language}. Natural and friendly tone. Return only translated text.

EXPLANATION: ${parsed.explanation}
WHATSAPP REPLY: ${parsed.whatsapp}

Return in this exact format:
EXPLANATION: [translated]
WHATSAPP REPLY: [translated]`;

          const translated = await callAIWithRetry(translatePrompt);
          const expMatch = translated.match(/EXPLANATION:\s*([\s\S]*?)(?=WHATSAPP REPLY:|$)/i);
          const waMatch = translated.match(/WHATSAPP REPLY:\s*([\s\S]*?)$/i);
          if (expMatch) parsed.explanation = expMatch[1].trim();
          if (waMatch) parsed.whatsapp = waMatch[1].trim();
        } catch {
          // Translation failed silently — keep English result
        }
      }

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
  };

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
    setResult(null);
    setOffTopic(false);
    setWarning("");
  };

  return (
    <>
      {!agreed && <DisclaimerModal onAgree={() => setAgreed(true)} />}
      <div className="app">
        <header className="header">
          <h1>InfoCure</h1>
          <p>Health Misinformation Detector for Community Health Workers</p>
          <p className="subtle-note">Works best with simple, clear health claims.</p>
          <div className="about-banner">
            <p>Health misinformation spreads rapidly through WhatsApp groups in developing regions, leading to dangerous health decisions in communities with limited access to medical professionals. InfoCure helps NGO field workers instantly verify claims and respond with evidence-based information — directly shareable to their communities.</p>
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
              }}
            />
            <div className="examples">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  className="example-btn"
                  onClick={() => {
                    setClaim(ex);
                    setResult(null);
                    setOffTopic(false);
                    setWarning("");
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
            {warning && <p className="warning-text">{warning}</p>}
            <button className="check-btn" onClick={() => handleCheck()} disabled={loading}>
              {loading ? loadingStep || "Analyzing..." : "Check"}
            </button>
          </div>
          {error && <div className="error-card"><p>{error}</p></div>}
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