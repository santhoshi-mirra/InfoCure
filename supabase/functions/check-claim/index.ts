import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callAI(prompt: string, maxTokens: number = 500) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`,
      "HTTP-Referer": "https://infocure.app",
      "X-Title": "InfoCure",
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { claim, language } = await req.json();

    // Step 1 — relevance check
    const relevanceCheck = await callAI(
      `Is the following specifically about health, medicine, nutrition, disease, or medical treatment? Reply YES or NO only.\n"${claim}"`,
      5
    );

    if (!relevanceCheck.trim().toUpperCase().startsWith("YES")) {
      return new Response(JSON.stringify({ offTopic: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2 — analyze
    const prompt = `You are a health fact-checker for NGO community health workers. Respond in plain text only. No markdown. No asterisks. No bold text.

Respond in ${language}. Use EXACTLY these labels in English.

Input: "${claim}"

VERDICT: [write only SUPPORTED or MISLEADING or UNSUPPORTED]

EXPLANATION:
[3 plain sentences in ${language} explaining the facts clearly. No jargon.]

SOURCE:
[Write the name of the most relevant and credible health authority or research institution for this specific claim. This can be any recognized organization — CDC, NIH, WHO, AHA, ADA, ACS, Mayo Clinic, Harvard Medical School, UNICEF, peer-reviewed journals, or any other credible medical source. Pick the single most relevant one. Write the name only.]

WHATSAPP REPLY:
[2-3 warm friendly sentences in ${language}. Do not repeat explanation word for word. Be conversational. End with source in parentheses in English.]`;

    const text = await callAI(prompt, 500);

    const cleaned = text.replace(/\*\*/g, "").replace(/\*/g, "").trim();
    const lines = cleaned.split("\n").map((l: string) => l.trim()).filter(Boolean);

    let verdict = "MISLEADING";
    let explanation = "";
    let source = "";
    let whatsapp = "";
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
      } else if (low.startsWith("whatsapp reply:")) {
        section = "wa";
        const rest = line.slice(15).trim();
        if (rest) whatsapp += rest + " ";
      } else {
        if (section === "exp") explanation += line + " ";
        else if (section === "src") source += line + " ";
        else if (section === "wa") whatsapp += line + " ";
      }
    }

    explanation = explanation.trim();
    source = source.trim();
    whatsapp = whatsapp.trim();

    if (!explanation) explanation = cleaned.slice(0, 400);
    if (!whatsapp) whatsapp = explanation.slice(0, 200);
    if (!source) source = "World Health Organization (WHO)";

    return new Response(JSON.stringify({ verdict, explanation, source, whatsapp }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});