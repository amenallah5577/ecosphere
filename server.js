require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const groq = new Groq({ apiKey: "const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });" });

// Helper function to search the real web using Tavily
async function searchWebForAgent(query) {
    console.log(`Agent is searching the live web for: "${query}"...`);
    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,,
            query: query,
            search_depth: "advanced",
            include_answer: true,
            max_results: 3
        })
    });
    const data = await response.json();
    return data;
}
app.post('/api/dispatch', async (req, res) => {
    try {
        const { task } = req.body;

        // 1. The Agent searches the LIVE INTERNET first
        const searchResults = await searchWebForAgent(task);
        const liveContext = searchResults.results.map(r => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`).join('\n\n');

        // 2. The Agent analyzes the real data and builds the response
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: `You are the EchoSphere Node Agent. You have just searched the live internet for the user's request.
                    Here is the REAL data you found: 
                    ${liveContext}
                    
                    Based ONLY on this real data, build your response. 
                    Respond ONLY in valid JSON format with these keys:
                    {
                      "icon": "emoji",
                      "title": "Short action title based on real data",
                      "desc": "Explain what you found and summarize the best real option.",
                      "metrics": ["Price/Salary/Detail", "Real Source Name"],
                      "primaryAction": "Go to Real Link",
                      "secondaryAction": "Dismiss",
                      "realUrl": "The exact URL of the best result you found"
                    }`
                },
                { role: "user", content: task }
            ],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const agentResponse = JSON.parse(completion.choices[0].message.content);
        res.json(agentResponse);

    } catch (error) {
        console.error("Agent Error:", error);
        res.status(500).json({ error: "Agent node failed to process request." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`EchoSphere Node running on port ${PORT} with Live Web Access`));
