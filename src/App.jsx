import { useState, memo, useCallback } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const sanitizeInput = (input) => input.trim().slice(0, 500);

async function checkClaim(claim, language) {
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
      body: JSON.stringify({ claim, language }),
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
  const [crisis, setCrisis] = useState(false);
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
      const data = await checkClaim(input, language);

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
          <div className="header-tag">For NGO community health workers</div>
          <h1>InfoCure</h1>
          <p className="header-tagline">Verify health claims circulating on social media. Get an evidence-based reply you can share with your community in seconds.</p>
          <p className="header-sub">Health misinformation spreads rapidly through messaging apps in regions with limited access to medical professionals. InfoCure helps field workers respond with sourced, plain-language guidance in 11 languages.</p>
        </header>
        <main className="main">
          {crisis && (
            <div className="crisis-banner">
              <p className="crisis-title">You are not alone.</p>
              <p>If you or someone you know is struggling, please reach out to a crisis helpline immediately. Support is available 24/7.</p>
              <div className="crisis-links">
                <a href="https://www.befrienders.org" target="_blank" rel="noreferrer">Befrienders Worldwide — Find support in your country</a>
                <a href="https://www.iasp.info/resources/Crisis_Centres/" target="_blank" rel="noreferrer">International Crisis Centre Directory</a>
              </div>
              <p className="crisis-note">You matter. Please talk to someone.</p>
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