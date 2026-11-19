// AI-hulp in het klaslokaal via OpenAI.
// Instellen in Vercel: OPENAI_API_KEY. Optioneel: OPENAI_MODEL (standaard gpt-5.4-mini).
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

async function openai(system, user, maxTokens) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_completion_tokens: maxTokens + 4000,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || "AI-fout " + r.status);
  return String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "").trim();
}

// All classroom AI runs on OpenAI (single key: OPENAI_API_KEY).
async function claude(system, user, maxTokens) {
  return openai(system, user, maxTokens);
}

function parseJSON(t) {
  const m = t.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : t);
}

const SORT_SYSTEM = `Je bent een assistent voor een docent Nederlands als tweede taal (NT2).
Je sorteert Nederlandse woorden naar woordsoort en geeft de vormen die een NT2-leerling moet leren.
Antwoord ALLEEN met geldige JSON, zonder uitleg, in precies deze vorm:
{"werkwoorden":[{"infinitief":"","verleden":"ik-vorm verleden tijd, meervoud","hulpwerkwoord":"hebben of zijn of hebben/zijn","voltooid":"voltooid deelwoord","onregelmatig":true,"betekenis":""}],
 "zelfstandig":[{"woord":"","lidwoord":"de of het","meervoud":"","betekenis":""}],
 "bijvoeglijk":[{"woord":"","vergrotend":"","overtreffend":"","betekenis":""}],
 "overig":[{"woord":"","soort":"precies een van: bijwoord, voorzetsel, voegwoord, uitdrukking, voorbeeldzin, overig","betekenis":""}]}
Regels: zet werkwoorden in de infinitief, zelfstandig naamwoorden in het enkelvoud en bijvoeglijk naamwoorden in de basisvorm (mooie → mooi). Bijwoorden (vaak, morgen), voorzetsels (naar, op) en voegwoorden (omdat, maar) gaan naar overig met die soort. Laat namen en dubbele woorden weg.
"betekenis" is een korte Engelse vertaling (1 tot 4 woorden). Als de docent al een uitleg gaf, gebruik die.
Bij een vaste uitdrukking (bijvoorbeeld "zin hebben in", "ik heb honger"): zet die bij overig met soort "uitdrukking".
Bij een korte, nuttige voorbeeldzin (bijvoorbeeld "Hoe gaat het?"): zet die bij overig met soort "voorbeeldzin", precies zoals geschreven.`;
// v43: one entry per word (across all groups) and one fixed word class per 'overig' item, so the canvas can group them
const SOORT = [['bijwoord', /bijwoord|adverb|adv[ée]rbio|adverbe/i], ['voorzetsel', /voorzetsel|preposi/i], ['voegwoord', /voegwoord|conjun|conjon|konjunktion/i],
  ['uitdrukking', /uitdrukking|expression|express[ãa]o|expresi[óo]n|ausdruck|idiom/i], ['voorbeeldzin', /zin|sentence|frase|phrase|satz/i]];
function normalizeSort(result) {
  const seen = new Set();
  const keyOf = (w) => String(w.infinitief || w.woord || '').trim().toLowerCase();
  for (const k of ['werkwoorden', 'zelfstandig', 'bijvoeglijk', 'overig']) result[k] = result[k].filter((w) => { const key = keyOf(w || {}); if (!key || seen.has(key)) return false; seen.add(key); return true; });
  result.overig = result.overig.map((w) => { const hit = SOORT.find(([, re]) => re.test(String(w.soort || ''))); return { ...w, soort: hit ? hit[0] : 'overig' }; });
  return result;
}
// v40: conjugations and comparisons only from A2; at A0/A1 the learner first needs the base form
function trimForLevel(result, level) {
  if (!/^A[01]$/.test(level)) return result;
  result.werkwoorden = result.werkwoorden.map((w) => ({ ...w, verleden: "", hulpwerkwoord: "", voltooid: "" }));
  result.bijvoeglijk = result.bijvoeglijk.map((w) => ({ ...w, vergrotend: "", overtreffend: "" }));
  return result;
}

const REPORT_SYSTEM = `Je schrijft namens Scip, een vriendelijke docent Nederlands, een kort lesverslag voor WhatsApp aan een leerling.
Schrijf in eenvoudig Nederlands dat past bij het niveau van de leerling (bij A0/A1 heel eenvoudige korte zinnen, met een Engelse vertaling tussen haakjes bij moeilijke woorden).
Opbouw: begroeting met de naam, wat we vandaag deden (2 tot 4 korte punten), de nieuwe woorden (maximaal 10, met betekenis), het huiswerk, een korte positieve afsluiting. Onderteken met "Scip".
Gebruik geen gedachtestreepjes (geen — of –). Gebruik geen markdown-koppen, alleen eenvoudige opsommingstekens zoals "-" aan het begin van een regel. Verzin niets wat niet in de notities staat.`;

// v27: besides the old classroom password, accept a logged-in TeachyRooms
// teacher (Supabase session token). The role is read from the database with
// the user's own token, so RLS applies.
async function isSupabaseTeacher(req) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return false;
  try {
    const { createClient } = require("@supabase/supabase-js");
    const db = createClient(url, key, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user } } = await db.auth.getUser(token);
    if (!user) return false;
    const { data } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    return !!data && (data.role === "teacher" || data.role === "admin");
  } catch (e) { return false; }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const p = process.env.KLAS_PASSWORD;
  const passOk = !!p && req.headers["x-klas-pass"] === p;
  if (!passOk && !(await isSupabaseTeacher(req))) return res.status(401).json({ error: "wachtwoord" });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "AI staat nog niet aan: zet OPENAI_API_KEY in Vercel" });
  if (req.method !== "POST") return res.status(405).json({ error: "methode niet toegestaan" });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const level = String(b.level || "A2").slice(0, 3);
    const languages = {nl:'Dutch',pt:'Brazilian Portuguese',en:'English',es:'Spanish',fr:'French',de:'German'};
    const lessonLanguage = languages[b.lessonLanguage] || 'Dutch';
    if (b.task === "sort") {
      let input = "";
      if (Array.isArray(b.words) && b.words.length) {
        input = "Woorden (met uitleg van de docent als die er is):\n" +
          b.words.slice(0, 80).map((w) => "- " + String(w.nl || "").slice(0, 60) + (w.uit ? " = " + String(w.uit).slice(0, 60) : "")).join("\n");
      } else if (b.text) {
        input = "Haal uit deze lestekst de woorden die de leerling (niveau " + level + ") moet leren, maximaal 40, en sorteer ze:\n\n" + String(b.text).slice(0, 8000);
      } else return res.status(400).json({ error: "geen woorden" });
      const system = lessonLanguage === 'Dutch' ? SORT_SYSTEM : `You are a language teacher specializing in ${lessonLanguage}. Sort the supplied vocabulary into grammatical categories. Reply ONLY as JSON with these exact keys: werkwoorden (array of objects with infinitief, verleden, hulpwerkwoord, voltooid, onregelmatig, betekenis), zelfstandig (array of objects with woord, lidwoord, meervoud, betekenis), bijvoeglijk (array of objects with woord, vergrotend, overtreffend, betekenis), overig (array of objects with woord, soort, betekenis). Use grammar appropriate to ${lessonLanguage}: verbs in the infinitive, nouns in the singular with the definite article of ${lessonLanguage} (empty if the language has none), adjectives in their base form. Adverbs go to overig with soort "bijwoord", prepositions with soort "voorzetsel", conjunctions with soort "voegwoord"; fixed expressions go to overig with soort "uitdrukking", short useful example sentences to overig with soort "voorbeeldzin" exactly as written. Never list the same word twice. Where a field is not relevant, use an empty string. For betekenis give a short English translation. Do not invent vocabulary.`;
      const out = await claude(system, input, 3000);
      const result = parseJSON(out);
      ["werkwoorden", "zelfstandig", "bijvoeglijk", "overig"].forEach((k) => { if (!Array.isArray(result[k])) result[k] = []; });
      return res.status(200).json({ result: trimForLevel(normalizeSort(result), level) });
    }
    if (b.task === "report") {
      const words = (Array.isArray(b.words) ? b.words : []).slice(0, 30).map((w) => w.nl + (w.uit ? " = " + w.uit : "")).join("\n");
      const input = [
        "Naam leerling: " + String(b.name || "").slice(0, 40),
        "Niveau: " + level,
        b.goal ? "Doel: " + String(b.goal).slice(0, 200) : "",
        "Notities van de docent:\n" + (String(b.notes || "").slice(0, 3000) || "(geen)"),
        "Nieuwe woorden:\n" + (words || "(geen)"),
        "Huiswerk:\n" + (String(b.hw || "").slice(0, 1000) || "(geen)"),
        "Tekst uit het gedeelde canvas van de les:\n" + (String(b.canvas || "").slice(0, 6000) || "(leeg)"),
      ].filter(Boolean).join("\n\n");
      const system = lessonLanguage === 'Dutch' ? REPORT_SYSTEM : `Write a friendly, concise WhatsApp lesson report on behalf of Scip, a ${lessonLanguage} teacher. Write in ${lessonLanguage}, at the student's proficiency level. Include a greeting, what was covered, up to 10 vocabulary items with translations, homework, and a positive closing signed Scip. Use only supplied facts; do not invent activities. Avoid markdown headings.`;
      const out = await claude(system, input, 1200);
      return res.status(200).json({ result: out.replace(/[—–]/g, ",") });
    }
    return res.status(400).json({ error: "onbekende taak" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
