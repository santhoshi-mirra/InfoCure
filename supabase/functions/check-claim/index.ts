import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CRISIS_KEYWORDS = [
  "suicidal", "suicide", "kill myself", "end my life", "want to die",
  "don't want to live", "no reason to live", "hopeless", "worthless",
  "can't go on", "self harm", "self-harm", "hurt myself", "cutting myself",
  "overdose", "hang myself", "jump off", "drowning myself", "shoot myself",
  "i want to die", "i don't want to live", "i can't go on", "i'm hopeless",
  "i'm worthless", "cut myself", "depressed and want to die", "feeling suicidal", 
  "helpless", "numb and want to die", "tired of living", "i wish i was dead", "i want to end it all",
  "i'm a burden and want to die", "i have no reason to live", "i want to disappear", "i want to be gone",
  "i'm overwhelmed and want to die", "i'm in so much pain i want to die", "i can't take this anymore and want to die",
  "i'm struggling and want to die", "i'm suffering and want to die", "i'm in despair and want to die",
  "worthless", "sad", "fatigued", "exhausted", "alone", "lonely", "isolated", "rejected", "unloved", "empty",
  "fat", "ugly", "stupid", "idiot", "failure", "disgusting", "nobody cares", "no one cares", "everyone would be better off without me",,
  "bullied", "abused", "harassed", "assaulted", "traumatized", "victimized", "mistreated", "neglected",
  'cutting', 'overdosing', 'hanging', 'drowning', 'shooting', 'jumping off', "hang myself", "kill myself", "end my life", "want to die", "don't want to live", "no reason to live"
];

function isCrisis(claim: string): boolean {
  const lower = claim.toLowerCase();
  return CRISIS_KEYWORDS.some(keyword => lower.includes(keyword));
}

function isHealthRelated(claim: string): boolean {
  const lower = claim.toLowerCase();

  const nonHealthKeywords = [
    'who won', 'world cup', 'football score', 'cricket score', 'basketball score',
    'movie', 'film', 'netflix', 'actor', 'actress', 'celebrity', 'singer',
    'president', 'election', 'politics', 'government', 'minister', 'prime minister',
    'bitcoin', 'crypto', 'stock market', 'finance', 'economy',
    'coding', 'programming', 'software', 'javascript', 'python',
    'recipe', 'how to cook', 'restaurant', 'hotel', 'travel destination',
    'weather', 'temperature outside', 'forecast',
    'music album', 'song lyrics', 'concert',
    'fashion', 'outfit', 'shopping',
    'math', 'algebra', 'history lesson', 'geography',
    'who is', 'what is the capital', 'how do i code',"how to make", "how to build", "how to create", "how to learn", "what is the best way to", "best way to", "can you help me with", "explain like i'm 5",
    "how to", "what is", "who is", "where is", "when is", "why is", "which is", "can you tell me about", "give me information on", "news about", "latest news on", "sports score", "movie times", "book recommendation", "music recommendation",
    "where can i find", "how do i get", "directions to", "translate", "what does mean", "define", "synonym for", "antonym for", "how to say in", "what language is", "is it going to rain", "what's the weather", "who won the game", "what's the score", "when is the next game",
    "which movie should i watch", "what's a good restaurant", "how do i get to", "what's the best way to", "can you help me with"
  ];

  const healthKeywords = [
    'health', 'healthy', 'disease', 'illness', 'symptom', 'treatment', 'cure',
    'medicine', 'medication', 'drug', 'pill', 'vaccine', 'vaccination',
    'virus', 'bacteria', 'infection', 'cancer', 'diabetes', 'blood pressure',
    'heart', 'liver', 'kidney', 'lung', 'brain', 'immune', 'allergy',
    'nutrition', 'vitamin', 'mineral', 'supplement', 'diet', 'weight loss',
    'exercise', 'fitness', 'mental health', 'anxiety', 'depression', 'stress',
    'sleep', 'fatigue', 'pain', 'fever', 'cough', 'cholesterol',
    'pregnancy', 'pregnant', 'fertility', 'menopause', 'menstrual', 'period',
    'hormonal', 'hormone', 'pcos', 'thyroid', 'probiotic', 'gut health',
    'surgery', 'doctor', 'hospital', 'clinic', 'therapy', 'antibiotic',
    'sugar', 'protein', 'carb', 'calorie', 'fat intake',
    'garlic', 'ginger', 'turmeric', 'honey', 'salt water',
    'blood', 'skin condition', 'hair loss', 'bone', 'muscle', 'joint',
    'stroke', 'asthma', 'arthritis', 'obesity',
    'breastfeeding', 'infant health', 'child health', 'aging',
    'cure', 'prevent', 'treat', 'reduce', 'lower', 'improve health',
    'good for', 'bad for', 'safe to', 'dangerous to',
    'does eating', 'can drinking', 'is it safe', 'health benefits',
  ];

  // Reject immediately if matches non-health
  for (const keyword of nonHealthKeywords) {
    if (lower.includes(keyword)) return false;
  }

  // Accept if matches health
  for (const keyword of healthKeywords) {
    if (lower.includes(keyword)) return true;
  }

  // Check question patterns
  const healthPatterns = [
    /does .* (cure|prevent|treat|help|reduce|lower|improve|cause)/i,
    /can .* (cause|lead to|prevent|treat|cure|help)/i,
    /is .* (good for|bad for|safe|healthy|dangerous)/i,
    /what (should|can) i (eat|take|do) for/i,
    /how to (treat|prevent|cure|reduce|lower|improve)/i,
    /what are the (symptoms|effects|causes|benefits|risks)/i,
    /is it safe to/i,
    /health benefits of/i,
  ];

  for (const pattern of healthPatterns) {
    if (pattern.test(lower)) return true;
  }

  return false;
}

const MODELS = [
  "anthropic/claude-haiku-20240307",
  "anthropic/claude-haiku-20240307",
  "openai/gpt-4o-mini",
];

async function callAIWithRetry(
  messages: { role: string; content: string }[],
  maxTokens: number = 800,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const model = MODELS[(attempt - 1) % MODELS.length];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
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
  source = source.trim().split("\n")[0].trim();
  if (source.length > 80) source = source.substring(0, 80).trim();
  whatsapp = whatsapp.trim();

  if (explanation && !explanation.endsWith(".") && !explanation.endsWith("?") && !explanation.endsWith("!")) {
    explanation += " Please consult a healthcare professional for medical advice.";
  }

  if (whatsapp && !whatsapp.endsWith(".") && !whatsapp.endsWith("?") && !whatsapp.endsWith(")") && !whatsapp.endsWith("!")) {
    whatsapp += " Please consult a healthcare professional.";
  }

  if (!explanation || explanation.length < 20) {
    explanation = "Based on available evidence, this claim requires careful evaluation. Please consult a healthcare professional for personal advice.";
  }

  if (!source || source.length < 3) {
    const lower = claim.toLowerCase();
    if (lower.includes('vaccine')) source = "Centers for Disease Control and Prevention (CDC)";
    else if (lower.includes('diabetes')) source = "American Diabetes Association (ADA)";
    else if (lower.includes('heart') || lower.includes('blood pressure')) source = "American Heart Association (AHA)";
    else if (lower.includes('cancer')) source = "American Cancer Society (ACS)";
    else if (lower.includes('probiotic')) source = "International Scientific Association for Probiotics and Prebiotics (ISAPP)";
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
        Deno.env.get("DB_SERVICE_ROLE_KEY") ?? ""
      );

      const { data: existing } = await supabase
        .from("community_reports")
        .select("*")
        .eq("claim", claim)
        .single();

      if (existing) {
        const updatedAt = new Date(existing.updated_at);
        const daysSince = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSince > 3) {
          await supabase
            .from("community_reports")
            .update({ count: 1, updated_at: new Date().toISOString() })
            .eq("claim", claim);
        } else {
          await supabase
            .from("community_reports")
            .update({ count: existing.count + 1, updated_at: new Date().toISOString() })
            .eq("claim", claim);
        }
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
        Deno.env.get("DB_SERVICE_ROLE_KEY") ?? ""
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

    // Step 1 — Crisis check
    if (isCrisis(trimmedClaim)) {
      return new Response(
        JSON.stringify({ crisis: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2 — Health relevance check (keyword based, no AI call)
    if (!isHealthRelated(trimmedClaim)) {
      return new Response(
        JSON.stringify({ offTopic: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3 — AI analysis with Claude Haiku
    const systemPrompt = `You are InfoCure, a health fact-checker for NGO community health workers. Respond in plain text only. No markdown. No asterisks.

Respond in ${language}. Keep ALL section labels in English exactly as shown.

Format EXACTLY as:
VERDICT: [write only SUPPORTED or MISLEADING or UNSUPPORTED]
EXPLANATION: [3 clear sentences in ${language} explaining the evidence. End with a period.]
SOURCE: [Name of the most relevant health authority — CDC, NIH, WHO, AHA, ADA, ACS, Mayo Clinic, or other credible source. One line only.]
SHAREABLE REPLY: [2-3 warm friendly sentences in ${language} for sharing. End with source in parentheses.]`;

    const userPrompt = `Health claim to analyze: "${trimmedClaim}"`;

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
    console.error("Fatal error:", err);
    return new Response(
      JSON.stringify({ error: "Service error. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});