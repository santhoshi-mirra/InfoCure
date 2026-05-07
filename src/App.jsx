import { useState, memo, useCallback, useEffect } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const IS_DEMO_MODE = !import.meta.env.VITE_SUPABASE_URL ||
  !import.meta.env.VITE_SUPABASE_ANON_KEY;

const sanitizeInput = (input) => input.trim().slice(0, 500);

function getMockResponse(claim) {
  const lowerClaim = claim.toLowerCase();

  if (lowerClaim.includes("probiotic")) {
    return {
      verdict: "SUPPORTED",
      explanation: "Probiotics are live beneficial bacteria that help maintain digestive health. Multiple studies show they can help with conditions like antibiotic-associated diarrhea and IBS.",
      source: "International Scientific Association for Probiotics and Prebiotics (ISAPP)",
      whatsapp: "Yes! Probiotics support gut health by maintaining healthy gut flora. Look for reputable brands with live cultures. (ISAPP)"
    };
  }
  if (lowerClaim.includes("vaccine") && lowerClaim.includes("infertility")) {
    return {
      verdict: "UNSUPPORTED",
      explanation: "Extensive research shows no link between vaccines and infertility. This myth has been debunked by multiple large-scale studies involving millions of participants.",
      source: "Centers for Disease Control and Prevention (CDC)",
      whatsapp: "Vaccines do NOT cause infertility. This is a dangerous myth. Vaccination is safe and strongly recommended. (CDC)"
    };
  }
  if (lowerClaim.includes("garlic") && lowerClaim.includes("blood pressure")) {
    return {
      verdict: "MISLEADING",
      explanation: "Garlic may have mild blood pressure lowering effects, but it is not a replacement for prescribed medication. Effects are modest at best according to current research.",
      source: "American Heart Association (AHA)",
      whatsapp: "Garlic can be part of a heart-healthy diet, but please don't stop your blood pressure medication. Always consult your doctor. (AHA)"
    };
  }
  if (lowerClaim.includes("salt water") && lowerClaim.includes("infection")) {
    return {
      verdict: "MISLEADING",
      explanation: "Salt water can help soothe a sore throat and may reduce bacteria temporarily, but it cannot cure infections. Bacterial infections require proper medical treatment.",
      source: "National Institutes of Health (NIH)",
      whatsapp: "Salt water gargles can give temporary relief but won't cure an infection. Please see a doctor if symptoms persist. (NIH)"
    };
  }
  return {
    verdict: "MISLEADING",
    explanation: `This is a demo response for: "${claim.substring(0, 80)}...". In production with API keys, InfoCure would provide real AI-powered health verification.`,
    source: "Demo Mode — Add API keys for real analysis",
    whatsapp: `Demo mode active. Add your Supabase and OpenRouter API keys to get real health verification results. (InfoCure Demo)`
  };
}

async function callEdgeFunction(body) {
  if (IS_DEMO_MODE && !body.action) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return getMockResponse(body.claim || "");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/check-claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("API Error:", response.status, errorText);
      throw new Error(`Server error: ${response.status}`);
    }
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("Request timed out. Please try again.");
    throw new Error(err.message || "API call failed");
  }
}

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
        {reports.map((item, i) => (
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
  const [crisis, setCrisis] = useState(false);
  const [language, setLanguage] = useState("English");
  const [history, setHistory] = useState([]);
  const [reports, setReports] = useState([]);
  const [reported, setReported] = useState(false);
  const [currentClaim, setCurrentClaim] = useState("");
  const [lastCallTime, setLastCallTime] = useState(0);
  const [theme, setTheme] = useState("dark");

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    document.documentElement.classList.toggle("light", newTheme === "light");
  };

  const languages = [
    "English", "Arabic", "French", "Swahili",
    "Hindi", "Urdu", "Portuguese", "Spanish", "Bengali", "Hausa", "Pashto",
  ];

  useEffect(() => {
    if (IS_DEMO_MODE) return;
    async function loadReports() {
      try {
        const data = await callEdgeFunction({ action: "getReports" });
        if (data.reports) setReports(data.reports);
      } catch (err) {
        console.error("Failed to load reports:", err);
      }
    }
    loadReports();
  }, []);

  const resetState = () => {
    setResult(null);
    setOffTopic(false);
    setCrisis(false);
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
    setCrisis(false);
    setReported(false);
    setLoading(true);
    setCurrentClaim(input);
    setLoadingStep("Analyzing...");

    try {
      const data = await callEdgeFunction({ claim: input, language });

      if (data.crisis) {
        setCrisis(true);
        setLoading(false);
        setLoadingStep("");
        return;
      }

      if (data.offTopic) {
        setOffTopic(true);
        setLoading(false);
        setLoadingStep("");
        return;
      }

      if (!data.explanation) {
        throw new Error("Could not analyze this claim. Please try again.");
      }

      setResult(data);
      setHistory(prev => [{
        claim: input.length > 60 ? input.substring(0, 60) + "..." : input,
        verdict: data.verdict,
      }, ...prev].slice(0, 5));

    } catch (err) {
      console.error("Check claim error:", err);
      setError(
        err.message.includes("timed out")
          ? "Server is busy. Please try again in a moment."
          : err.message || "Failed to analyze claim. Please try again."
      );
    }

    setLoading(false);
    setLoadingStep("");
  }, [claim, language, lastCallTime]);

  const handleReport = async () => {
    setReported(true);
    if (IS_DEMO_MODE) return;
    try {
      await callEdgeFunction({ action: "report", claim: currentClaim });
      const data = await callEdgeFunction({ action: "getReports" });
      if (data.reports) setReports(data.reports);
    } catch (err) {
      console.error("Failed to report:", err);
    }
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
          <div className="header-top-row">
            <div className="header-tag">For NGO community health workers</div>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
          <h1>InfoCure</h1>
          <p className="header-tagline">Verify health claims circulating on social media. Get an evidence-based reply you can share with your community in seconds.</p>
          <p className="header-sub">Health misinformation spreads rapidly through messaging apps in regions with limited access to medical professionals. InfoCure helps field workers respond with sourced, plain-language guidance in 11 languages.</p>
        </header>
        <main className="main">
          {IS_DEMO_MODE && (
            <div className="demo-banner">
              🎭 Demo Mode — Running with mock data. Add API keys for real health verification.
            </div>
          )}
          {crisis && (
            <div className="crisis-banner">
              <p className="crisis-title">You are not alone.</p>
              <p>If you or someone you know is struggling, please reach out immediately. Support is available 24/7 — you matter.</p>
              <div className="crisis-hotlines">
                <div className="hotline-item">
                  <span className="hotline-region">🌍 International</span>
                  <a href="https://www.befrienders.org" target="_blank" rel="noreferrer">Befrienders Worldwide — befrienders.org</a>
                </div>
                <div className="hotline-item">
                  <span className="hotline-region">🇨🇦 Canada</span>
                  <a href="tel:18334564566">Talk Suicide Canada — 1-833-456-4566 (24/7)</a>
                </div>
                <div className="hotline-item">
                  <span className="hotline-region">🇺🇸 USA</span>
                  <a href="tel:988">988 Suicide & Crisis Lifeline — Call or text 988</a>
                </div>
                <div className="hotline-item">
                  <span className="hotline-region">🇬🇧 UK</span>
                  <a href="tel:116123">Samaritans — 116 123 (free, 24/7)</a>
                </div>
                <div className="hotline-item">
                  <span className="hotline-region">🇮🇳 India</span>
                  <a href="tel:9152987821">iCall — 9152987821</a>
                </div>
                <div className="hotline-item">
                  <span className="hotline-region">🇦🇪 UAE</span>
                  <a href="tel:8004673">Dubai Happiness Line — 800 4673</a>
                </div>
                <div className="hotline-item">
                  <span className="hotline-region">🇵🇰 Pakistan</span>
                  <a href="tel:03117786264">Umang — 0311-7786264</a>
                </div>
              </div>
              <p className="crisis-note">Please talk to someone. You deserve support.</p>
            </div>
          )}
          {offTopic && !crisis && (
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
                setCrisis(false);
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