// supabase/functions/check-claim/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// COMPREHENSIVE HEALTH KEYWORD DATABASE
const HEALTH_KEYWORDS = new Set([
  // Gut & digestive health
  'probiotic', 'probiotics', 'prebiotic', 'prebiotics', 'gut', 'flora', 'microbiome',
  'digestion', 'digestive', 'stomach', 'intestine', 'colon', 'bloating', 'constipation',
  
  // General health & medicine
  'health', 'healthy', 'disease', 'illness', 'symptom', 'treatment', 'therapy',
  'cure', 'remedy', 'medicine', 'medication', 'drug', 'pill', 'prescription',
  
  // Immune system
  'immune', 'immunity', 'antibody', 'vaccine', 'vaccination', 'booster',
  
  // Infections & conditions
  'virus', 'viral', 'bacteria', 'bacterial', 'infection', 'fungal', 'parasite',
  'cancer', 'tumor', 'diabetes', 'hypertension', 'asthma', 'allergy', 'allergic',
  'arthritis', 'inflammation', 'chronic', 'acute', 'pain', 'fever', 'cough',
  
  // Body systems
  'blood', 'heart', 'cardiovascular', 'liver', 'kidney', 'lung', 'brain', 'nerve',
  'muscle', 'bone', 'joint', 'skin', 'hair', 'eye', 'ear', 'thyroid', 'hormone',
  
  // Nutrition & lifestyle
  'nutrition', 'nutrient', 'vitamin', 'mineral', 'supplement', 'herbal', 'herb',
  'diet', 'food', 'eat', 'drink', 'exercise', 'workout', 'fitness', 'weight',
  'obesity', 'mental', 'stress', 'anxiety', 'depression', 'sleep', 'fatigue',
  
  // Specific health claims
  'cures', 'prevents', 'treats', 'reduces risk', 'lowers', 'improves', 'boosts',
  'blood pressure', 'blood sugar', 'cholesterol', 'triglycerides',
  
  // Medical procedures
  'surgery', 'operation', 'transplant', 'dialysis', 'chemotherapy', 'radiation',
  
  // Demographics
  'pregnancy', 'pregnant', 'fertility', 'infertility', 'breastfeeding', 'newborn',
  'infant', 'child', 'elderly', 'senior', 'aging'
]);

const HEALTH_PHRASES = [
  'gut health', 'immune system', 'blood circulation', 'weight loss',
  'muscle gain', 'mental clarity', 'joint pain', 'back pain',
  'headache relief', 'cold remedy', 'flu prevention'
];

function isHealthRelated(claim: string): { relevant: boolean; reason: string } {
  const lowerClaim = claim.toLowerCase();
  
  // Check single keywords
  for (const keyword of HEALTH_KEYWORDS) {
    if (lowerClaim.includes(keyword)) {
      return { relevant: true, reason: `matched keyword: ${keyword}` };
    }
  }
  
  // Check multi-word phrases
  for (const phrase of HEALTH_PHRASES) {
    if (lowerClaim.includes(phrase)) {
      return { relevant: true, reason: `matched phrase: ${phrase}` };
    }
  }
  
  // Check for question patterns common in health queries
  const questionPatterns = [
    /does .* (cure|prevent|treat|help|reduce|lower|improve)/i,
    /can .* (cause|lead to|result in|prevent|treat|cure)/i,
    /is .* (good for|bad for|safe for|effective for)/i,
    /what (should|can|do) i (eat|take|do) for/i,
    /how to (treat|prevent|cure|reduce|lower)/i
  ];
  
  for (const pattern of questionPatterns) {
    if (pattern.test(lowerClaim)) {
      return { relevant: true, reason: `matched question pattern` };
    }
  }
  
  return { relevant: false, reason: "no health indicators found" };
}

// RELIABLE MODELS - sorted by reliability
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
      console.log(`AI attempt ${attempt}/${maxRetries} using ${model}`);
      
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
          model: model,
          messages: messages,
          max_tokens: maxTokens,
          temperature: 0.2, // Lower = more consistent
          top_p: 0.9,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP ${response.status}: ${errorText}`);
        throw new Error(`API returned ${response.status}`);
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      if (!content) {
        throw new Error("Empty response from AI");
      }
      
      // Clean the response
      const cleaned = content
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/`/g, "")
        .replace(/#{1,6}\s/g, "")
        .trim();
      
      console.log(`✅ AI call successful on attempt ${attempt}`);
      return cleaned;
      
    } catch (err) {
      console.error(`Attempt ${attempt} failed:`, err.message);
      lastError = err;
      
      if (attempt < maxRetries) {
        const delay = 1000 * attempt; // 1s, 2s, 3s
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error("All AI attempts failed");
}

// PARSE AI RESPONSE ROBUSTLY
function parseAIResponse(text: string, claim: string) {
  // Default values
  let verdict = "MISLEADING";
  let explanation = "";
  let source = "";
  let whatsapp = "";
  
  // Try to extract sections with multiple patterns
  const patterns = {
    verdict: [/VERDICT:\s*(SUPPORTED|MISLEADING|UNSUPPORTED)/i, /VERDICT[:\s]+(SUPPORTED|MISLEADING|UNSUPPORTED)/i],
    explanation: [/EXPLANATION:\s*(.+?)(?=SOURCE:|VERDICT:|WHATSAPP:|$)/is, /EXPLANATION[:\s]+(.+?)(?=SOURCE:|$)/is],
    source: [/SOURCE:\s*(.+?)(?=WHATSAPP:|EXPLANATION:|VERDICT:|$)/is, /SOURCE[:\s]+(.+?)(?=WHATSAPP:|$)/is],
    whatsapp: [/WHATSAPP:\s*(.+?)(?=SOURCE:|EXPLANATION:|VERDICT:|$)/is, /WHATSAPP[:\s]+(.+?)$/is, /SHAREABLE REPLY:\s*(.+?)$/is]
  };
  
  // Extract verdict
  for (const pattern of patterns.verdict) {
    const match = text.match(pattern);
    if (match) {
      verdict = match[1].toUpperCase();
      break;
    }
  }
  
  // Extract explanation
  for (const pattern of patterns.explanation) {
    const match = text.match(pattern);
    if (match && match[1]) {
      explanation = match[1].trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
      break;
    }
  }
  
  // Extract source
  for (const pattern of patterns.source) {
    const match = text.match(pattern);
    if (match && match[1]) {
      source = match[1].trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
      break;
    }
  }
  
  // Extract whatsapp
  for (const pattern of patterns.whatsapp) {
    const match = text.match(pattern);
    if (match && match[1]) {
      whatsapp = match[1].trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
      break;
    }
  }
  
  // Fallbacks and cleanup
  if (!explanation || explanation.length < 20) {
    explanation = `Based on available evidence, this claim about "${claim.substring(0, 50)}" requires careful evaluation.`;
  }
  
  if (!source || source.length < 3 || source === "WHO" || source === "World Health Organization") {
    // Smart source suggestions based on claim content
    const lowerClaim = claim.toLowerCase();
    if (lowerClaim.includes('probiotic')) source = "International Scientific Association for Probiotics and Prebiotics (ISAPP)";
    else if (lowerClaim.includes('vaccine')) source = "Centers for Disease Control and Prevention (CDC)";
    else if (lowerClaim.includes('diabetes')) source = "American Diabetes Association (ADA)";
    else if (lowerClaim.includes('heart') || lowerClaim.includes('blood pressure')) source = "American Heart Association (AHA)";
    else if (lowerClaim.includes('cancer')) source = "American Cancer Society (ACS)";
    else source = "National Institutes of Health (NIH)";
  }
  
  if (!whatsapp || whatsapp.length < 20) {
    whatsapp = `${explanation.substring(0, 150)} (${source})`;
  }
  
  return { verdict, explanation, source, whatsapp };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  
  try {
    const { claim, language = "English" } = await req.json();
    
    // Validate input
    if (!claim || typeof claim !== 'string' || claim.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Please enter a health claim or question" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const trimmedClaim = claim.trim().substring(0, 500);
    console.log(`📝 Processing: "${trimmedClaim}"`);
    console.log(`🌐 Language: ${language}`);
    
    // STEP 1: Fast keyword-based relevance check (no AI)
    const relevance = isHealthRelated(trimmedClaim);
    console.log(`🔍 Relevance check: ${relevance.relevant ? 'PASS ✅' : 'FAIL ❌'} - ${relevance.reason}`);
    
    if (!relevance.relevant) {
      return new Response(
        JSON.stringify({ 
          offTopic: true,
          message: "This tool only covers health-related claims and questions." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // STEP 2: Build the prompt
    const systemPrompt = `You are InfoCure, a health verification tool. Respond in ${language} using ONLY plain text (no markdown, no asterisks).

Format EXACTLY as:
VERDICT: [SUPPORTED/MISLEADING/UNSUPPORTED]
EXPLANATION: [2-3 sentences]
SOURCE: [Specific organization - NEVER default to WHO alone]
WHATSAPP: [Conversational summary for sharing]`;

    const userPrompt = `Claim: "${trimmedClaim}"\n\nProvide health analysis with specific source.`;
    
    // STEP 3: Call AI with retry logic
    console.log("🤖 Calling AI for analysis...");
    let aiResponse: string;
    try {
      aiResponse = await callAIWithRetry([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]);
      console.log(`📄 AI Response: ${aiResponse.substring(0, 200)}...`);
    } catch (aiError) {
      console.error("AI call failed:", aiError);
      // Return graceful fallback
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
    
    // STEP 4: Parse response
    const result = parseAIResponse(aiResponse, trimmedClaim);
    console.log(`✅ Final result - Verdict: ${result.verdict}, Source: ${result.source}`);
    
    // STEP 5: Return response
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (err) {
    console.error("💥 Fatal error:", err);
    return new Response(
      JSON.stringify({ 
        error: "Service error. Please try again.",
        verdict: "MISLEADING",
        explanation: "An error occurred while processing your request.",
        source: "System",
        whatsapp: "Please try again in a moment."
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});