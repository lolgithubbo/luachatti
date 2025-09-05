// api/chat.js - Vercel Serverless Function
import fetch from 'node-fetch';

// Simulierte Lua Code Datenbank (in der Realität würdest du echte APIs nutzen)
const luaCodeDatabase = [
  {
    title: "Table Utilities",
    keywords: ["table", "array", "list", "utilities"],
    code: `-- Tabellen-Hilfsfunktionen
function table.clone(orig)
    local copy = {}
    for orig_key, orig_value in pairs(orig) do
        copy[orig_key] = orig_value
    end
    return copy
end

function table.length(t)
    local count = 0
    for _ in pairs(t) do 
        count = count + 1 
    end
    return count
end

function table.contains(t, value)
    for _, v in pairs(t) do
        if v == value then
            return true
        end
    end
    return false
end`
  },
  {
    title: "String Functions", 
    keywords: ["string", "text", "split", "trim"],
    code: `-- String-Hilfsfunktionen
function string.split(str, delimiter)
    local result = {}
    local pattern = string.format("([^%s]+)", delimiter or "%s")
    for match in str:gmatch(pattern) do
        table.insert(result, match)
    end
    return result
end

function string.trim(str)
    return str:match("^%s*(.-)%s*$")
end

function string.startswith(str, prefix)
    return str:sub(1, #prefix) == prefix
end`
  },
  {
    title: "File Operations",
    keywords: ["file", "io", "read", "write", "filesystem"],
    code: `-- Datei-Operationen
function readFile(filename)
    local file = io.open(filename, "r")
    if not file then
        return nil, "Datei nicht gefunden"
    end
    local content = file:read("*all")
    file:close()
    return content
end

function writeFile(filename, content)
    local file = io.open(filename, "w")
    if not file then
        return false, "Kann Datei nicht erstellen"
    end
    file:write(content)
    file:close()
    return true
end

function fileExists(filename)
    local file = io.open(filename, "r")
    if file then
        file:close()
        return true
    end
    return false
end`
  },
  {
    title: "Math Utilities",
    keywords: ["math", "numbers", "calculations", "round"],
    code: `-- Mathematische Hilfsfunktionen
function math.round(num, decimals)
    local mult = 10^(decimals or 0)
    return math.floor(num * mult + 0.5) / mult
end

function math.clamp(value, min, max)
    return math.max(min, math.min(max, value))
end

function math.lerp(a, b, t)
    return a + (b - a) * t
end

function math.distance(x1, y1, x2, y2)
    return math.sqrt((x2-x1)^2 + (y2-y1)^2)
end`
  },
  {
    title: "JSON Handler",
    keywords: ["json", "parse", "encode", "decode", "data"],
    code: `-- Einfacher JSON Handler
local json = {}

function json.encode(obj)
    if type(obj) == "table" then
        local result = "{"
        local first = true
        for k, v in pairs(obj) do
            if not first then result = result .. "," end
            result = result .. '"' .. k .. '":' .. json.encode(v)
            first = false
        end
        return result .. "}"
    elseif type(obj) == "string" then
        return '"' .. obj .. '"'
    elseif type(obj) == "number" then
        return tostring(obj)
    elseif type(obj) == "boolean" then
        return obj and "true" or "false"
    else
        return "null"
    end
end

return json`
  }
];

// Funktion zum Suchen von relevantem Code
function searchLuaCode(query) {
  const queryLower = query.toLowerCase();
  const results = [];
  
  for (const snippet of luaCodeDatabase) {
    const score = snippet.keywords.reduce((acc, keyword) => {
      if (queryLower.includes(keyword.toLowerCase())) {
        return acc + 1;
      }
      return acc;
    }, 0);
    
    if (score > 0 || snippet.title.toLowerCase().includes(queryLower)) {
      results.push({
        ...snippet,
        relevanceScore: score
      });
    }
  }
  
  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// OpenAI API Call
async function callOpenAI(messages) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API Key nicht konfiguriert');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 1500,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API Fehler: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

export default async function handler(req, res) {
  // CORS Headers für Frontend
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Nur POST Methode erlaubt',
      success: false 
    });
  }

  try {
    const { message, searchForCode = false } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Nachricht darf nicht leer sein',
        success: false 
      });
    }

    let response = '';
    let foundCode = null;
    let combinedCode = null;

    if (searchForCode) {
      // Suche nach relevantem Code
      console.log('🔍 Suche Code für:', message);
      const codeResults = searchLuaCode(message);
      
      if (codeResults.length > 0) {
        // Kombiniere gefundenen Code mit KI
        const codeSnippets = codeResults.slice(0, 3); // Max 3 relevante Snippets
        const combinedSnippets = codeSnippets.map(s => s.code).join('\n\n-- ---\n\n');
        
        const combinePrompt = `Als Lua-Experte, analysiere und kombiniere den folgenden Code basierend auf der Benutzeranfrage.

Benutzeranfrage: "${message}"

Verfügbare Code-Snippets:
${combinedSnippets}

Aufgaben:
1. Wähle die relevantesten Teile aus
2. Kombiniere sie zu einer zusammenhängenden Lösung
3. Füge fehlende Funktionalität hinzu
4. Optimiere für Lesbarkeit und Performance
5. Füge deutsche Kommentare hinzu
6. Stelle sicher, dass der Code funktionsfähig ist

Gib NUR den finalen, lauffähigen Lua-Code zurück (ohne Erklärungen davor oder danach):`;

        try {
          combinedCode = await callOpenAI([
            {
              role: "system",
              content: "Du bist ein Experte für Lua-Programmierung. Du antwortest NUR mit sauberem, gut dokumentiertem Lua-Code ohne zusätzliche Erklärungen."
            },
            {
              role: "user",
              content: combinePrompt
            }
          ]);

          response = `Ich habe ${codeResults.length} relevante Code-Snippets gefunden und für dich optimiert kombiniert! 🚀`;
          foundCode = combinedCode;

        } catch (aiError) {
          console.error('KI-Fehler:', aiError);
          // Fallback: Gib einfach den besten gefundenen Code zurück
          foundCode = codeResults[0].code;
          response = `Hier ist ein passender Code-Snippet für deine Anfrage (KI-Optimierung nicht verfügbar):`;
        }
        
      } else {
        response = "Leider konnte ich keine passenden Lua-Code-Snippets in meiner Datenbank finden. Lass mich dir stattdessen beim Erstellen von eigenem Code helfen! 💡";
      }
    } else {
      // Normale Chat-Antwort mit KI
      try {
        const aiResponse = await callOpenAI([
          {
            role: "system",
            content: `Du bist ein hilfsreicher KI-Assistent, der sich auf Lua-Programmierung spezialisiert hat. 

Deine Fähigkeiten:
- Lua-Code erklären, schreiben und debuggen  
- Code-Snippets aus verschiedenen Quellen kombinieren
- Best Practices für Lua empfehlen
- Bei Lua-Projekten und Problemen helfen
- Performance-Optimierung von Lua-Code

Antworte IMMER auf Deutsch und sei hilfsbereit und freundlich. Wenn du Code schreibst, füge deutsche Kommentare hinzu.`
          },
          {
            role: "user",
            content: message
          }
        ]);

        response = aiResponse;

      } catch (aiError) {
        console.error('KI-Fehler:', aiError);
        response = "Entschuldigung, ich kann gerade nicht auf die KI zugreifen. Aber ich kann dir trotzdem bei grundlegenden Lua-Fragen helfen! Was möchtest du wissen?";
      }
    }

    // Erfolgreiche Antwort
    res.status(200).json({
      success: true,
      response: response,
      code: foundCode,
      searchPerformed: searchForCode,
      timestamp: new Date().toISOString(),
      codeFound: !!foundCode
    });

  } catch (error) {
    console.error('API Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Entschuldigung, es gab einen internen Serverfehler. Versuche es bitte erneut.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
        }
