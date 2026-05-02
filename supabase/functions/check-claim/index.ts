import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { claim, language } = await req.json();

    const prompt = `You are a health fact-checker for NGO community health workers. Respond in plain text only. No markdown. No asterisks. No bold text.

Respond in ${language}. Use EXACTLY these labels in English.

Input: "${claim}"

VERDICT: [write only SUPPORTED or MISLEADING or UNSUPPORTED]

EXPLANATION:
[3 plain sentences in ${language} explaining the facts clearly. Reference actual medical evidence.]

SOURCE:
[Write the name of the SPECIFIC health authority whose research directly supports your answer. Choose carefully:
- Vaccine claims → Centers for Disease Control (CDC)
- Heart/blood pressure claims → American Heart Association (AHA)  
- Diabetes claims → American Diabetes Association (ADA)
- Cancer claims → American Cancer Society (ACS)
- Nutrition claims → World Health Organization (WHO) or National Institutes of Health (NIH)
- General medical research → National Institutes of Health (NIH)
- WHO only for global health policy
Pick ONE most relevant authority. Write only the name.]

WHATSAPP REPLY:
[2-3 warm friendly sentences in ${language} for a community WhatsApp group. Do not repeat the explanation word for word. End with the source name in parentheses in English.]`;

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
        max_tokens: 600,
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    const rawText = data.choices?.[0]?.message?.content || "";

    const cleaned = rawText.replace(/\*\*/g, "").replace(/\*/g, "").trim();
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
    if (!source) source = "Centers for Disease Control (CDC)";

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