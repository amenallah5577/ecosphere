require('dotenv').config();
const express = require('express');
const cors = require('cors');
const basicAuth = require('express-basic-auth');
const Groq = require('groq-sdk');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const adminAuth = basicAuth({
    users: {
        [process.env.ADMIN_USERNAME || 'admin']: process.env.ADMIN_PASSWORD || 'supersecret'
    },
    challenge: true,
    realm: 'EchoSphere Admin Area'
});

// Protect /admin.html before express.static can serve it
app.get('/admin.html', adminAuth, (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

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
                    content: `You are the EchoSphere Node Agent. You just searched the live internet.
                    Real data: ${liveContext}
                    Respond ONLY in valid JSON:
                    {"icon": "emoji", "title": "Short title", "desc": "Summary", "metrics": ["Detail1", "Detail2"], "primaryAction": "Go to Link", "secondaryAction": "Dismiss", "realUrl": "Exact URL"}`
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

app.get('/api/history', adminAuth, async (req, res) => {
    try {
        const history = await History.find().sort({ date: -1 }).limit(50);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch history" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 EchoSphere running on port ${PORT}`));
