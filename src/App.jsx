import { useState, memo, useCallback } from "react";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

if (!API_KEY && import.meta.env.PROD) {
  console.error("Missing VITE_OPENROUTER_API_KEY environment variable");
}

const sanitizeInput = (input) => input.trim().slice(0, 500);

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
        max_tokens: 500,
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

async function callAIWithRetry(prompt, retries = 2) {
  try {
    return await callAI(prompt);
  } catch (err) {
    if (retries > 0) return callAIWithRetry(prompt, retries - 1);
    throw err;
  }
}

const getFallbackResult = (language) => ({
  verdict: "MISLEADING",
  explanation: getDefaultExplanation(language, "MISLEADING"),
  source: "World Health Organization (WHO)",
  whatsapp: getDefaultWhatsapp(language, "MISLEADING"),
});

const getDefaultExplanation = (language, verdict) => {
  const map = {
    English: {
      SUPPORTED: "This health claim is supported by scientific evidence.",
      MISLEADING: "This claim is partially true but requires important context.",
      UNSUPPORTED: "This claim is not supported by current medical evidence.",
    },
    Spanish: {
      SUPPORTED: "Esta afirmación está respaldada por evidencia científica.",
      MISLEADING: "Esta afirmación es parcialmente cierta pero requiere contexto importante.",
      UNSUPPORTED: "Esta afirmación no está respaldada por la evidencia médica actual.",
    },
    French: {
      SUPPORTED: "Cette affirmation est soutenue par des preuves scientifiques.",
      MISLEADING: "Cette affirmation est partiellement vraie mais nécessite un contexte important.",
      UNSUPPORTED: "Cette affirmation n'est pas soutenue par les preuves médicales actuelles.",
    },
    Arabic: {
      SUPPORTED: "هذا الادعاء مدعوم بأدلة علمية.",
      MISLEADING: "هذا الادعاء صحيح جزئياً لكنه يحتاج إلى سياق مهم.",
      UNSUPPORTED: "هذا الادعاء غير مدعوم بالأدلة الطبية الحالية.",
    },
  };
  
  if (!map[language]) {
    const generic = {
      SUPPORTED: `This claim is supported by evidence.`,
      MISLEADING: `This claim needs more context.`,
      UNSUPPORTED: `This claim is not supported by evidence.`
    };
    return generic[verdict];
  }
  
  return map[language]?.[verdict] || map.English[verdict];
};

const getDefaultWhatsapp = (language, verdict) => {
  const map = {
    English: {
      SUPPORTED: "This claim is supported by health experts. Always consult a doctor for personal advice. (WHO)",
      MISLEADING: "This claim needs more context. Please speak with a healthcare provider. (WHO)",
      UNSUPPORTED: "This claim is not supported by evidence. Please consult reliable medical sources. (WHO)",
    },
    Spanish: {
      SUPPORTED: "Esta afirmación está respaldada por expertos. Siempre consulte a un médico. (WHO)",
      MISLEADING: "Esta afirmación necesita más contexto. Hable con un profesional de salud. (WHO)",
      UNSUPPORTED: "Esta afirmación no está respaldada por evidencia. Consulte fuentes médicas confiables. (WHO)",
    },
    French: {
      SUPPORTED: "Cette affirmation est soutenue par des experts. Consultez toujours un médecin. (WHO)",
      MISLEADING: "Cette affirmation nécessite plus de contexte. Parlez à un professionnel de santé. (WHO)",
      UNSUPPORTED: "Cette affirmation n'est pas soutenue. Consultez des sources médicales fiables. (WHO)",
    },
    Arabic: {
      SUPPORTED: "هذا الادعاء مدعوم من قبل خبراء الصحة. استشر طبيبك دائماً. (WHO)",
      MISLEADING: "يحتاج هذا الادعاء إلى مزيد من السياق. تحدث مع مقدم رعاية صحية. (WHO)",
      UNSUPPORTED: "هذا الادعاء غير مدعوم بأدلة. استشر مصادر طبية موثوقة. (WHO)",
    },
  };
  
  if (!map[language]) {
    const generic = {
      SUPPORTED: `This claim is supported by health experts. Consult a doctor for personal advice. (WHO)`,
      MISLEADING: `This claim needs more context. Speak with a healthcare provider. (WHO)`,
      UNSUPPORTED: `This claim is not supported by evidence. Consult reliable medical sources. (WHO)`
    };
    return generic[verdict];
  }
  
  return map[language]?.[verdict] || map.English[verdict];
};

const getPrompt = (input, language) => {
  const labelMap = {
    English: { verdict: "VERDICT:", explanation: "EXPLANATION:", source: "SOURCE:", whatsapp: "WHATSAPP REPLY:" },
    Spanish: { verdict: "VEREDICTO:", explanation: "EXPLICACIÓN:", source: "FUENTE:", whatsapp: "RESPUESTA WHATSAPP:" },
    French: { verdict: "JUGEMENT:", explanation: "EXPLICATION:", source: "SOURCE:", whatsapp: "RÉPONSE WHATSAPP:" },
    Arabic: { verdict: "الحكم:", explanation: "تفسير:", source: "مصدر:", whatsapp: "رد واتساب:" },
  };
  
  const labels = labelMap[language] || labelMap.English;
  
  return `You are a health fact-checker for NGO workers. Respond in ${language}.

Use EXACTLY these labels:
${labels.verdict} [SUPPORTED or MISLEADING or UNSUPPORTED]
${labels.explanation} [2 sentences maximum. Use simple language. No medical jargon.]
${labels.source} [One source only]
${labels.whatsapp} [2 sentences. Friendly tone. End with source in parentheses]

Input: "${input}"

${labels.verdict} `;
};

const parseResult = (text, language) => {
  if (!text || typeof text !== "string") return getFallbackResult(language);

  const labelPatterns = {
    English: { verdict: /verdict:/i, explanation: /explanation:|answer:/i, source: /source:/i, whatsapp: /whatsapp reply:/i },
    Spanish: { verdict: /veredicto:|verdict:/i, explanation: /explicación:|explicacion:|explanation:/i, source: /fuente:|source:/i, whatsapp: /respuesta whatsapp:|whatsapp reply:/i },
    French: { verdict: /jugement:|verdict:/i, explanation: /explication:|explanation:/i, source: /source:/i, whatsapp: /réponse whatsapp:|whatsapp reply:/i },
    Arabic: { verdict: /الحكم:|verdict:/i, explanation: /تفسير:|explanation:/i, source: /مصدر:|source:/i, whatsapp: /رد واتساب:|whatsapp reply:/i },
  };
  
  const patterns = labelPatterns[language] || labelPatterns.English;
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let verdict = "MISLEADING";
  let explanation = "";
  let source = "";
  let whatsapp = "";
  let currentSection = "";

  for (const line of lines) {
    if (patterns.verdict.test(line)) {
      const v = line.replace(patterns.verdict, "").trim().toUpperCase();
      if (v.includes("UNSUPPORTED") || v.includes("NOT SUPPORTED") || v.includes("FALSO") || v.includes("غير مدعوم")) {
        verdict = "UNSUPPORTED";
      } else if ((v.includes("SUPPORTED") || v.includes("RESPALDADA") || v.includes("مدعوم")) && !v.includes("UN") && !v.includes("PARTIAL")) {
        verdict = "SUPPORTED";
      } else {
        verdict = "MISLEADING";
      }
      currentSection = "";
    } 
    else if (patterns.explanation.test(line)) {
      currentSection = "explanation";
      const inline = line.replace(patterns.explanation, "").trim();
      if (inline) explanation += inline + " ";
    } 
    else if (patterns.source.test(line)) {
      currentSection = "source";
      const inline = line.replace(patterns.source, "").trim();
      if (inline) source += inline + " ";
    } 
    else if (patterns.whatsapp.test(line)) {
      currentSection = "whatsapp";
      const inline = line.replace(patterns.whatsapp, "").trim();
      if (inline) whatsapp += inline + " ";
    } 
    else {
      if (currentSection === "explanation") explanation += line + " ";
      else if (currentSection === "source") source += line + " ";
      else if (currentSection === "whatsapp") whatsapp += line + " ";
    }
  }

  return {
    verdict,
    explanation: explanation.trim() || getDefaultExplanation(language, verdict),
    source: source.trim() || "World Health Organization (WHO)",
    whatsapp: whatsapp.trim() || getDefaultWhatsapp(language, verdict),
  };
};

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
        <button className="copy-btn" aria-label="Copy to clipboard" onClick={handleCopy}>
          {copied ? "Copied" : "Copy to Clipboard"}
        </button>
      </div>
      <div className="report-section">
        <button
          className={`report-btn ${reported ? "reported" : ""}`}
          onClick={onReport}
          disabled={reported}
          aria-label="Report claim as circulating in community"
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

const loadingMessages = {
  English: "Analyzing claim...",
  Spanish: "Analizando afirmación...",
  French: "Analyse de l'affirmation...",
  Arabic: "جاري تحليل الادعاء...",
};

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
        `Classify this as HEALTH or NOT_HEALTH. Answer one word only.\n"${input}"`
      );

      const label = relevanceCheck.trim().toUpperCase();
      if (label === "NOT_HEALTH") {
        setOffTopic(true);
        setLoading(false);
        setLoadingStep("");
        return;
      }

      setLoadingStep(loadingMessages[language] || loadingMessages.English);

      let parsed = null;
      let attempts = 0;

      while (attempts < 2 && !parsed) {
        try {
          const text = await callAIWithRetry(getPrompt(input, language));
          parsed = parseResult(text, language);
          if (!parsed.explanation || parsed.explanation.length < 10) {
            throw new Error("Invalid response");
          }
        } catch {
          attempts++;
          if (attempts === 2) {
            parsed = getFallbackResult(language);
            setWarning("AI response was unclear. Showing general guidance instead.");
          } else {
            setLoadingStep("Retrying...");
            await new Promise(r => setTimeout(r, 1000));
          }
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
    setResult(null);
    setOffTopic(false);
    setWarning("");
    setError("");
  };

  const handleClear = () => {
    setClaim("");
    setResult(null);
    setError("");
    setWarning("");
    setOffTopic(false);
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
            <p>Health misinformation spreads rapidly through WhatsApp groups in developing regions, leading to dangerous health decisions in communities with limited access to medical professionals. InfoCure helps NGO field workers instantly verify claims and respond with evidence based information directly shareable to their communities.</p>
          </div>
        </header>
        <main className="main">
          {offTopic && (
            <div className="offtopic-top-banner">
              This tool only covers health related claims and questions. Please try again with a health topic.
            </div>
          )}
          <div className="card">
            <div className="field-row">
              <label className="field-label">Health Claim or Question</label>
              <select
                className="language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="Select language"
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCheck();
              }}
              aria-label="Enter health claim or question"
            />
            <div className="char-counter">
              {claim.length}/500 characters
            </div>
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
            <div className="button-group">
              <button
                className="check-btn"
                onClick={() => handleCheck()}
                disabled={loading}
                aria-label="Check health claim"
              >
                {loading ? loadingStep || "Analyzing..." : "Check"}
              </button>
              <button
                className="clear-btn"
                onClick={handleClear}
                disabled={loading}
                aria-label="Clear all"
              >
                Clear
              </button>
            </div>
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