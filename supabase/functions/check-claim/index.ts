import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Crisis keywords — these trigger compassionate response + hotline
const CRISIS_KEYWORDS = [
  "suicidal", "suicide", "kill myself", "end my life", "want to die",
  "don't want to live", "no reason to live", "hopeless", "worthless",
  "can't go on", "self harm", "self-harm", "hurt myself", "cutting myself"
];

// Comprehensive health keywords
const HEALTH_KEYWORDS = new Set([
  // Women's health
  'menopause', 'menstruation', 'menstrual', 'period', 'periods', 'pms',
  'perimenopause', 'postmenopause', 'hormonal', 'hormone', 'hormones',
  'estrogen', 'progesterone', 'testosterone', 'ovulation', 'ovary', 'ovaries',
  'uterus', 'cervix', 'endometriosis', 'pcos', 'polycystic', 'fertility',
  'infertility', 'pregnancy', 'pregnant', 'breastfeeding', 'menstrual cycle',
  'hot flashes', 'hot flush', 'vaginal', 'contraception', 'contraceptive',
  
  // Mental health
  'mental', 'anxiety', 'depression', 'stress', 'trauma', 'ptsd', 'bipolar',
  'schizophrenia', 'ocd', 'adhd', 'autism', 'eating disorder', 'anorexia',
  'bulimia', 'panic attack', 'phobia', 'therapy', 'counseling', 'psychiatry',
  'psychologist', 'antidepressant', 'medication', 'mood', 'emotional',
  
  // Gut & digestive health
  'probiotic', 'probiotics', 'prebiotic', 'prebiotics', 'gut', 'flora',
  'microbiome', 'digestion', 'digestive', 'stomach', 'intestine', 'colon',
  'bloating', 'constipation', 'diarrhea', 'ibs', 'crohn',
  
  // General health & medicine
  'health', 'healthy', 'disease', 'illness', 'symptom', 'treatment', 'therapy',
  'cure', 'remedy', 'medicine', 'medication', 'drug', 'pill', 'prescription',
  'doctor', 'hospital', 'clinic', 'nurse', 'patient', 'diagnosis', 'chronic',
  
  // Immune system
  'immune', 'immunity', 'antibody', 'vaccine', 'vaccination', 'booster',
  
  // Infections & conditions
  'virus', 'viral', 'bacteria', 'bacterial', 'infection', 'fungal', 'parasite',
  'cancer', 'tumor', 'diabetes', 'hypertension', 'asthma', 'allergy', 'allergic',
  'arthritis', 'inflammation', 'acute', 'pain', 'fever', 'cough',
  
  // Body systems
  'blood', 'heart', 'cardiovascular', 'liver', 'kidney', 'lung', 'brain',
  'nerve', 'muscle', 'bone', 'joint', 'skin', 'hair', 'eye', 'ear',
  'thyroid', 'adrenal', 'pancreas', 'spleen',
  
  // Nutrition & lifestyle
  'nutrition', 'nutrient', 'vitamin', 'mineral', 'supplement', 'herbal', 'herb',
  'diet', 'food', 'eat', 'drink', 'exercise', 'workout', 'fitness', 'weight',
  'obesity', 'sleep', 'fatigue', 'cholesterol', 'blood pressure', 'blood sugar',
  
  // Medical procedures
  'surgery', 'operation', 'transplant', 'dialysis', 'chemotherapy', 'radiation',
  'biopsy', 'scan', 'mri', 'xray', 'ultrasound',
  
  // Demographics
  'newborn', 'infant', 'child', 'elderly', 'senior', 'aging', 'puberty',
]); 

const HEALTH_PHRASES = [
  'gut health', 'immune system', 'blood circulation', 'weight loss',
  'muscle gain', 'mental health', 'joint pain', 'back pain',
  'headache relief', 'cold remedy', 'flu prevention', 'women health',
  'reproductive health', 'sexual health', 'bone density', 'heart rate',
  'blood type', 'body mass', 'hormone levels', 'hormonal imbalance'
];

function isCrisis(claim: string): boolean {
  const lower = claim.toLowerCase();
  return CRISIS_KEYWORDS.some(keyword => lower.includes(keyword));
}

function isHealthRelated(claim: string): boolean {
  const lower = claim.toLowerCase();
  for (const keyword of HEALTH_KEYWORDS) {
    if (lower.includes(keyword)) return true;
  }
  for (const phrase of HEALTH_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  const questionPatterns = [
    /does .* (cure|prevent|treat|help|reduce|lower|improve)/i,
    /can .* (cause|lead to|result in|prevent|treat|cure)/i,
    /is .* (good for|bad for|safe for|effective for)/i,
    /what (should|can|do) i (eat|take|do) for/i,
    /how to (treat|prevent|cure|reduce|lower)/i,
    /what (are|is) the (symptoms|effects|causes|treatment)/i,
    /what happens (during|after|when)/i,
  ];
  for (const pattern of questionPatterns) {
    if (pattern.test(lower)) return true;
  }
  return false;
}

const MODELS = [
  "openrouter/free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "openrouter/free"
];

async function callAIWithRetry(
  messages: { role: string; content: string }[],
  maxTokens: number = 600,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const model = MODELS[(attempt - 1) % MODELS.length];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`,
          "HTTP-Referer": "https://infocure.app",
          "X-Title": "InfoCure",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      if (!content) throw new Error("Empty response from AI");

      return content
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/`/g, "")
        .replace(/#{1,6}\s/g, "")
        .trim();

    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError || new Error("All AI attempts failed");
}

function parseAIResponse(text: string, claim: string) {
  let verdict = "MISLEADING";
  let explanation = "";
  let source = "";
  let whatsapp = "";

  const patterns = {
    verdict: [/VERDICT:\s*(SUPPORTED|MISLEADING|UNSUPPORTED)/i],
    explanation: [/EXPLANATION:\s*(.+?)(?=SOURCE:|VERDICT:|WHATSAPP:|SHAREABLE:|$)/is],
    source: [/SOURCE:\s*(.+?)(?=WHATSAPP:|SHAREABLE:|EXPLANATION:|VERDICT:|$)/is],
    whatsapp: [/SHAREABLE REPLY:\s*(.+?)$/is, /WHATSAPP:\s*(.+?)$/is],
  };

  for (const pattern of patterns.verdict) {
    const match = text.match(pattern);
    if (match) { verdict = match[1].toUpperCase(); break; }
  }

  for (const pattern of patterns.explanation) {
    const match = text.match(pattern);
    if (match?.[1]) { explanation = match[1].trim().replace(/\n/g, ' ').replace(/\s+/g, ' '); break; }
  }

  for (const pattern of patterns.source) {
    const match = text.match(pattern);
    if (match?.[1]) { source = match[1].trim().replace(/\n/g, ' ').replace(/\s+/g, ' '); break; }
  }

  for (const pattern of patterns.whatsapp) {
    const match = text.match(pattern);
    if (match?.[1]) { whatsapp = match[1].trim().replace(/\n/g, ' ').replace(/\s+/g, ' '); break; }
  }

  if (!explanation || explanation.length < 20) {
    explanation = `Based on available evidence, this claim requires careful evaluation. Please consult a healthcare professional for personal advice.`;
  }

  if (!source || source.length < 3) {
    const lower = claim.toLowerCase();
    if (lower.includes('vaccine')) source = "Centers for Disease Control and Prevention (CDC)";
    else if (lower.includes('diabetes')) source = "American Diabetes Association (ADA)";
    else if (lower.includes('heart') || lower.includes('blood pressure')) source = "American Heart Association (AHA)";
    else if (lower.includes('cancer')) source = "American Cancer Society (ACS)";
    else if (lower.includes('menopause') || lower.includes('hormonal') || lower.includes('menstrual')) source = "The Menopause Society (NAMS)";
    else source = "National Institutes of Health (NIH)";
  }

  if (!whatsapp || whatsapp.length < 20) {
    whatsapp = `${explanation.substring(0, 150)} (${source})`;
  }

  return { verdict, explanation, source, whatsapp };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { claim, language = "English" } = await req.json();

    if (!claim || typeof claim !== 'string' || claim.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Please enter a health claim or question" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmedClaim = claim.trim().substring(0, 500);

    // Step 1 — Crisis detection
    if (isCrisis(trimmedClaim)) {
      return new Response(
        JSON.stringify({ crisis: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2 — Health relevance check
    if (!isHealthRelated(trimmedClaim)) {
      return new Response(
        JSON.stringify({ offTopic: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3 — AI analysis
    const systemPrompt = `You are InfoCure, a health verification tool. Respond in ${language} using ONLY plain text (no markdown, no asterisks).

Format EXACTLY as:
VERDICT: [SUPPORTED/MISLEADING/UNSUPPORTED]
EXPLANATION: [2-3 sentences]
SOURCE: [Specific organization - never default to WHO alone]
SHAREABLE REPLY: [Conversational summary for sharing]`;

    const userPrompt = `Claim: "${trimmedClaim}"\n\nProvide health analysis with specific source.`;

    let aiResponse: string;
    try {
      aiResponse = await callAIWithRetry([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]);
    } catch (aiError) {
      return new Response(
        JSON.stringify({
          verdict: "MISLEADING",
          explanation: "Unable to analyze at this moment. Please try again in a few seconds.",
          source: "System",
          whatsapp: "Service temporarily unavailable. Please try again. (InfoCure)"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = parseAIResponse(aiResponse, trimmedClaim);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Service error. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});