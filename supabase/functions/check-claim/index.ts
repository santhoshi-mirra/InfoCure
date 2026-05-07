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
  "depressed", "depression", "anxiety", "panic attack", "ptsd", "trauma", "cut myself", "self harm", 
  "self-harm", "hurt myself", "cutting myself", "overdose", "hang myself", "jump off", "drowning myself", "shoot myself",
  "i want to die", "i don't want to live", "i can't go on", "i'm hopeless", "i'm worthless", "hate", "depressed", "depression", 
  "anxiety", "panic attack", "ptsd",
];

function isCrisis(claim: string): boolean {
  const lower = claim.toLowerCase();
  return CRISIS_KEYWORDS.some(keyword => lower.includes(keyword));
}

const MODELS = [
  "openrouter/free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "openrouter/free"
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

// NEW: AI-powered health relevance detection (works for ANY language)
async function isHealthRelated(claim: string, language: string): Promise<boolean> {
  // Very short claims - ask for clarification
  if (claim.length < 5) {
    return false;
  }
  
  try {
    const response = await callAIWithRetry([
      { 
        role: "system", 
        content: `You are a classifier. Answer ONLY "YES" or "NO". 
        Is this a health, medical, nutrition, wellness, fitness, or mental health question?
        Language detected: ${language}
        
        Say YES for questions about:
        - Food, diet, nutrition
        - Diseases, symptoms, treatments
        - Body parts, organs, functions
        - Medications, vaccines, supplements
        - Exercise, fitness, weight
        - Mental health, stress, sleep
        - Pregnancy, child health, aging
        
        Say NO only for:
        - Politics, sports scores, entertainment
        - Technology, programming, gaming
        - Completely unrelated topics
        
        Be PERMISSIVE - if it MIGHT be health-related, say YES.` 
      },
      { 
        role: "user", 
        content: claim 
      }
    ], 10, 2);
    
    const result = response.trim().toUpperCase() === "YES";
    console.log(`🔍 Relevance check: "${claim.substring(0, 50)}..." -> ${result ? "HEALTH ✅" : "NOT HEALTH ❌"}`);
    return result;
    
  } catch (err) {
    // If AI fails, assume it's health-related (better false positive than false negative)
    console.error("Relevance check failed, defaulting to true");
    return true;
  }
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

  // Fix truncated explanations
  if (explanation && !explanation.endsWith(".") && !explanation.endsWith("?") && !explanation.endsWith("!")) {
    if (explanation.toLowerCase().includes("bacteria") || explanation.toLowerCase().includes("infection")) {
      explanation += " Infections typically require proper medical treatment.";
    } else if (explanation.toLowerCase().includes("may help")) {
      explanation += " Consult a healthcare provider for proper treatment.";
    } else {
      explanation += " Please consult a healthcare professional for medical advice.";
    }
  }

  // Fix truncated whatsapp messages
  if (whatsapp && !whatsapp.endsWith(".") && !whatsapp.endsWith("?") && !whatsapp.endsWith(")") && !whatsapp.endsWith("!")) {
    if (whatsapp.toLowerCase().includes("typically require") || whatsapp.toLowerCase().includes("requires")) {
      whatsapp += " proper medical treatment.";
    } else if (whatsapp.toLowerCase().includes("may help")) {
      whatsapp += " Please see a doctor if symptoms persist.";
    } else if (whatsapp.toLowerCase().includes("won't cure")) {
      whatsapp += " Professional medical care is recommended.";
    } else {
      whatsapp += " Please consult a healthcare professional.";
    }
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

    // Check for crisis FIRST
    if (isCrisis(trimmedClaim)) {
      return new Response(
        JSON.stringify({ crisis: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // NEW: AI-powered health relevance check (works for any language)
    const relevant = await isHealthRelated(trimmedClaim, language);
    
    if (!relevant) {
      console.log(`📋 Off-topic claim rejected: "${trimmedClaim.substring(0, 80)}..."`);
      return new Response(
        JSON.stringify({ offTopic: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Updated system prompt with STRICT language enforcement
    const systemPrompt = `You are InfoCure, a health verification tool.

⚠️ CRITICAL LANGUAGE INSTRUCTION:
You MUST respond in ${language} language ONLY.
Do NOT use English. Do NOT mix languages.
If ${language} is not English, respond completely in ${language}.

Format EXACTLY as:
VERDICT: [SUPPORTED/MISLEADING/UNSUPPORTED in ${language}]
EXPLANATION: [2-3 COMPLETE sentences ending with periods in ${language}]
SOURCE: [Organization name - keep in English or ${language}]
SHAREABLE REPLY: [2-3 warm, friendly COMPLETE sentences in ${language} ending with source in parentheses]

Example for Hindi:
VERDICT: समर्थित
EXPLANATION: प्रोबायोटिक्स पाचन स्वास्थ्य के लिए फायदेमंद होते हैं। ये अच्छे बैक्टीरिया हैं जो आंतों को स्वस्थ रखते हैं।
SOURCE: ISAPP
SHAREABLE REPLY: प्रोबायोटिक्स आपके पाचन के लिए अच्छे हैं। गुणवत्ता वाले ब्रांड चुनें। (ISAPP)

Example for Spanish:
VERDICT: APOYADO
EXPLANATION: Los probióticos son bacterias beneficiosas que ayudan a la salud digestiva. Múltiples estudios respaldan su uso.
SOURCE: ISAPP
SHAREABLE REPLY: ¡Sí! Los probióticos apoyan la salud intestinal. Elija marcas de calidad con cultivos vivos. (ISAPP)`;

    const userPrompt = `Analyze this health claim and provide evidence-based information: "${trimmedClaim}"`;

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