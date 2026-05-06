import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CRISIS_KEYWORDS = [
  "suicidal", "suicide", "kill myself", "end my life", "want to die",
  "don't want to live", "no reason to live", "hopeless", "worthless",
  "can't go on", "self harm", "self-harm", "hurt myself", "cutting myself", "overdose", "hang myself", "jump off", "drowning myself", "shoot myself",
  "depressed", "depression", "anxious", "anxiety", "panic attack", "ptsd", "trauma", "bipolar", "schizophrenia", "ocd", "adhd", "autism", "eating disorder", "anorexia", "bulimia",
  "abuse", "domestic violence", "assault", "rape", "molest", "harass", "stalk", "threaten", "violence", "weapon", "gun", "knife", "cutting", "burning", "harming others"
];

const HEALTH_KEYWORDS = new Set([
  'menopause', 'menstruation', 'menstrual', 'period', 'periods', 'pms',
  'perimenopause', 'postmenopause', 'hormonal', 'hormone', 'hormones',
  'estrogen', 'progesterone', 'testosterone', 'ovulation', 'ovary', 'ovaries',
  'uterus', 'cervix', 'endometriosis', 'pcos', 'polycystic', 'fertility',
  'infertility', 'pregnancy', 'pregnant', 'breastfeeding', 'menstrual cycle',
  'hot flashes', 'hot flush', 'vaginal', 'contraception', 'contraceptive',
  'mental', 'anxiety', 'depression', 'stress', 'trauma', 'ptsd', 'bipolar',
  'schizophrenia', 'ocd', 'adhd', 'autism', 'eating disorder', 'anorexia',
  'bulimia', 'panic attack', 'phobia', 'therapy', 'counseling', 'psychiatry',
  'psychologist', 'antidepressant', 'mood', 'emotional',
  'probiotic', 'probiotics', 'prebiotic', 'prebiotics', 'gut', 'flora',
  'microbiome', 'digestion', 'digestive', 'stomach', 'intestine', 'colon',
  'bloating', 'constipation', 'diarrhea', 'ibs', 'crohn',
  'health', 'healthy', 'disease', 'illness', 'symptom', 'treatment', 'therapy',
  'cure', 'remedy', 'medicine', 'medication', 'drug', 'pill', 'prescription',
  'doctor', 'hospital', 'clinic', 'nurse', 'patient', 'diagnosis', 'chronic',
  'immune', 'immunity', 'antibody', 'vaccine', 'vaccination', 'booster',
  'virus', 'viral', 'bacteria', 'bacterial', 'infection', 'fungal', 'parasite',
  'cancer', 'tumor', 'diabetes', 'hypertension', 'asthma', 'allergy', 'allergic',
  'arthritis', 'inflammation', 'acute', 'pain', 'fever', 'cough',
  'blood', 'heart', 'cardiovascular', 'liver', 'kidney', 'lung', 'brain',
  'nerve', 'muscle', 'bone', 'joint', 'skin', 'hair', 'eye', 'ear',
  'thyroid', 'adrenal', 'pancreas', 'spleen',
  'nutrition', 'nutrient', 'vitamin', 'mineral', 'supplement', 'herbal', 'herb',
  'diet', 'food', 'eat', 'drink', 'exercise', 'workout', 'fitness', 'weight',
  'obesity', 'sleep', 'fatigue', 'cholesterol', 'blood pressure', 'blood sugar',
  'surgery', 'operation', 'transplant', 'dialysis', 'chemotherapy', 'radiation',
  'newborn', 'infant', 'child', 'elderly', 'senior', 'aging', 'puberty', 'adolescence', 'adult', 'teenager', 
  'women', 'man', 'female', 'male', 'gender', 'sex', 'lgbtq', 'transgender', 'non-binary', 'intersex', 'queer',
  'mental health', 'physical health', 'sexual health', 'reproductive health', 'women\'s health', 'men\'s health', 'child health', 
  'elderly health', 'public health', 'global health', 'healthcare', 'health system', 'health policy', 'health insurance', 'health equity',
]);

const HEALTH_PHRASES = [
  'gut health', 'immune system', 'blood circulation', 'weight loss',
  'muscle gain', 'mental health', 'joint pain', 'back pain',
  'headache relief', 'cold remedy', 'flu prevention', 'women health',
  'reproductive health', 'sexual health', 'bone density', 'heart rate',
  'blood type', 'body mass', 'hormone levels', 'hormonal imbalance', 'menstrual pain', 
  'menopause symptoms', 'breast health', 'prostate health', 'diabetes management', 
  'hypertension control', 'asthma relief', 'allergy treatment', 'cholesterol reduction', 'sleep quality', 'stress relief', 
  'anxiety reduction', 'depression management', 'cognitive function', 'memory improvement', 'digestion support', 'liver detox', 
  'kidney function', 'lung capacity', 'brain health', 'eye health', 'thyroid function', 'adrenal fatigue', 
  'pancreatic health', 'spleen function', 'nutrition absorption', 'vitamin deficiency', 'mineral imbalance', 
  'supplement effectiveness', 'herbal remedy', 'diet plan', 'exercise routine', 'fitness level', 'weight management',
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

  const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
  let section = "";

  for (const line of lines) {
    const low = line.toLowerCase();
    if (low.startsWith("verdict:")) {
      const v = line.slice(8).trim().toUpperCase();
      if (v.includes("UNSUPPORTED") || v.includes("NOT SUPPORTED")) verdict = "UNSUPPORTED";
      else if (v.includes("SUPPORTED") && !v.includes("UN")) verdict = "SUPPORTED";
      else verdict = "MISLEADING";
      section = "";
    } else if (low.startsWith("explanation:")) {
      section = "exp";
      const rest = line.slice(12).trim();
      if (rest) explanation += rest + " ";
    } else if (low.startsWith("source:")) {
      section = "src";
      const rest = line.slice(7).trim();
      if (rest) source += rest + " ";
    } else if (low.startsWith("shareable reply:") || low.startsWith("whatsapp:") || low.startsWith("whatsapp reply:")) {
      section = "wa";
      const rest = line.slice(low.indexOf(":") + 1).trim();
      if (rest) whatsapp += rest + " ";
    } else {
      if (section === "exp") explanation += line + " ";
      else if (section === "src") source += line + " ";
      else if (section === "wa") whatsapp += line + " ";
    }
  }

  explanation = explanation.trim();
  // Fix source bleed — take only first line and limit length
  source = source.trim().split("\n")[0].trim();
  if (source.length > 80) source = source.substring(0, 80).trim();
  whatsapp = whatsapp.trim();

  if (!explanation || explanation.length < 20) {
    explanation = "Based on available evidence, this claim requires careful evaluation. Please consult a healthcare professional for personal advice.";
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
    const { claim, language = "English", action } = await req.json();

    // Handle community report action
    if (action === "report") {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { data: existing } = await supabase
        .from("community_reports")
        .select("*")
        .eq("claim", claim)
        .single();

      if (existing) {
        await supabase
          .from("community_reports")
          .update({ count: existing.count + 1, updated_at: new Date().toISOString() })
          .eq("claim", claim);
      } else {
        await supabase
          .from("community_reports")
          .insert({ claim, count: 1 });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle fetch reports action
    if (action === "getReports") {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { data } = await supabase
        .from("community_reports")
        .select("*")
        .order("count", { ascending: false })
        .limit(5);

      return new Response(JSON.stringify({ reports: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!claim || typeof claim !== 'string' || claim.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Please enter a health claim or question" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmedClaim = claim.trim().substring(0, 500);

    if (isCrisis(trimmedClaim)) {
      return new Response(
        JSON.stringify({ crisis: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isHealthRelated(trimmedClaim)) {
      return new Response(
        JSON.stringify({ offTopic: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are InfoCure, a health verification tool. Respond in ${language} using ONLY plain text (no markdown, no asterisks).

Format EXACTLY as:
VERDICT: [SUPPORTED/MISLEADING/UNSUPPORTED]
EXPLANATION: [2-3 sentences]
SOURCE: [Specific organization name only — one line, no extra text]
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