require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth');

const app = express();
app.use(cors());
app.use(express.json());

// --- SECURITY LOCK ---
// This requires a password for /admin.html and /api/history
const adminLock = basicAuth({
    users: { [process.env.ADMIN_USERNAME || 'admin']: process.env.ADMIN_PASSWORD || 'password123' },
    challenge: true,
    realm: 'Secure Admin Area'
});

// Protect the HTML page
app.get('/admin.html', adminLock, (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

// Protect the API data
app.use('/api/history', adminLock);
// ---------------------

// Serve all other public files normally
app.use(express.static('public'));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB!'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Define Database Schema
const HistorySchema = new mongoose.Schema({
    prompt: String,
    title: String,
    url: String,
    date: { type: Date, default: Date.now }
});
const History = mongoose.model('History', HistorySchema);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function searchWebForAgent(query) {
    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,
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
        const searchResults = await searchWebForAgent(task);
        const liveContext = searchResults.results.map(r => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`).join('\n\n');

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: `You are a Senior Research Analyst at EchoSphere, an enterprise intelligence platform. You have just retrieved the following live data from the internet. Your task is to produce a deep, professional, multi-paragraph analysis report.

Live Data:
${liveContext}

Respond ONLY in valid JSON using this exact schema:
{
  "icon": "A single relevant emoji that represents the topic",
  "title": "A concise, professional title of no more than 10 words",
  "desc": "Write a detailed analysis of 2 to 3 paragraphs separated by \\n\\n. Paragraph 1: Summarize the key findings, background context, and the most important facts from the live data. Paragraph 2: Analyze the implications, notable trends, specific statistics, or data points found in the sources. Paragraph 3 (optional): Provide actionable insights, recommendations, or a forward-looking conclusion. Each paragraph should be 3 to 5 sentences long.",
  "metrics": ["Specific data point 1 such as a dollar figure", "Specific data point 2 such as a percentage change", "Specific data point 3 such as a date or timeframe", "Specific data point 4 such as a count or ranking"],
  "primaryAction": "A descriptive label for the primary source link",
  "secondaryAction": "Dismiss",
  "realUrl": "The exact URL of the most relevant source from the live data"
}`
                },
                { role: "user", content: task }
            ],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const agentResponse = JSON.parse(completion.choices[0].message.content);
        
        // Save to Database
        try {
            const newHistory = new History({
                prompt: task,
                title: agentResponse.title,
                url: agentResponse.realUrl
            });
            await newHistory.save();
        } catch (dbErr) {
            console.error("Could not save history:", dbErr);
        }

        res.json(agentResponse);

    } catch (error) {
        console.error("Agent Error:", error);
        res.status(500).json({ error: "Agent node failed." });
    }
});

app.get('/api/history', async (req, res) => {
    try {
        const history = await History.find().sort({ date: -1 }).limit(50);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch history" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 EchoSphere running on port ${PORT}`));
