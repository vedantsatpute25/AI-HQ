const roles = {
  "Project Manager": "You are a pragmatic software project manager. Break work into milestones, dependencies, risks and clear next actions.",
  "Researcher": "You are a technical researcher. Compare options, state assumptions, and suggest verifiable next steps.",
  "Software Developer": "You are a senior software developer. Propose architecture, explain implementation and provide small, safe code examples when useful.",
  "Debugger": "You are a debugging specialist. Ask for missing error details, isolate likely causes, and propose reproducible fixes.",
  "QA Engineer": "You are a QA engineer. Create test scenarios, edge cases, acceptance criteria and regression checks.",
  "Code Reviewer": "You are a careful code reviewer. Prioritize correctness, security, maintainability and accessibility.",
  "Release Engineer": "You are a release engineer. Plan deployment, configuration, rollback, monitoring and release verification."
};
const cors = { "Content-Type":"application/json", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff" };
function json(status, body) { return new Response(JSON.stringify(body), { status, headers:cors }); }
export default async (req) => {
  if (req.method !== "POST") return json(405, { error:"Use POST for AI requests." });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json(503, { error:"AI is not configured yet. Add OPENAI_API_KEY in Netlify environment variables and redeploy." });
  let body;
  try { body = await req.json(); } catch { return json(400, { error:"Request body must be valid JSON." }); }
  const action = String(body.action || "");
  const userText = action === "plan" ? String(body.task || "") : String(body.message || "");
  if (!["plan","agent"].includes(action)) return json(400,{error:"Unknown action."});
  if (!userText.trim()) return json(400,{error:"Please provide a project task or message."});
  if (userText.length > 10000) return json(413,{error:"Please keep your request under 10,000 characters."});
  const role = action === "plan" ? "Project Manager" : String(body.role || "Project Manager");
  const system = roles[role] || roles["Project Manager"];
  const projectName = String(body.projectName || "Untitled project").slice(0,120);
  const prompt = action === "plan"
    ? "Create a practical project plan for: "+projectName+"\nUser request: "+userText+"\nReturn sections: Goal, assumptions, MVP features, recommended stack, milestones, file/module outline, test plan, risks, and next action. Be honest about what remains unimplemented."
    : "Project: "+projectName+"\nUser message: "+userText+"\nGive a useful, direct answer. Do not claim you executed code, accessed private repositories, or deployed anything unless tools actually did so.";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method:"POST",
      headers:{ "Authorization":"Bearer "+apiKey, "Content-Type":"application/json" },
      body:JSON.stringify({ model:process.env.OPENAI_MODEL || "gpt-4.1-mini", instructions:system, input:prompt, max_output_tokens:1200 })
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) {
      const msg = response.status === 401 ? "OpenAI rejected the API key. Check that OPENAI_API_KEY is correct." :
        response.status === 429 ? "OpenAI rate limit or API quota reached. Check API usage and billing." :
        "OpenAI request failed with status "+response.status+".";
      return json(response.status === 401 ? 502 : response.status, { error:msg });
    }
    const result = data.output?.flatMap(item => item.content || []).filter(item => item.type === "output_text").map(item => item.text).join("\n") || "The model returned no text. Please try again.";
    return json(200,{ result, role, projectName });
  } catch {
    return json(502,{error:"Could not reach OpenAI from the serverless function. Try again shortly."});
  }
};
