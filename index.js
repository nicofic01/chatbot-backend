import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 📌 Funzione per inizializzare il database SQLite
async function initDB() {
    const db = await open({
        filename: "./chatbot.db",
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_message TEXT,
            ai_response TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    return db;
}

// 📌 Inizializziamo il database
let db;
initDB().then(database => {
    db = database;
    console.log("📌 Database inizializzato");
});

// 📌 Endpoint per gestire le chat
app.post("/chat", async (req, res) => {
    const userMessage = req.body.message;
    if (!userMessage) {
        return res.status(400).json({ error: "Messaggio non valido" });
    }

    try {
        // Chiamata all'API di OpenAI
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: "Sei un assistente esperto nel creare purpose aziendali." },
                    { role: "user", content: userMessage }
                ],
                max_tokens: 300
            })
        });

        const data = await response.json();
        const aiResponse = data.choices[0].message.content;

        // 📌 Salviamo la conversazione nel database
        await db.run(`INSERT INTO conversations (user_message, ai_response) VALUES (?, ?)`, [userMessage, aiResponse]);

        res.json({ reply: aiResponse });
    } catch (error) {
        console.error("Errore durante la richiesta a OpenAI:", error);
        res.status(500).json({ error: "Errore nel server" });
    }
});

// 📌 Endpoint per recuperare le conversazioni salvate
app.get("/conversations", async (req, res) => {
    try {
        const conversations = await db.all("SELECT * FROM conversations ORDER BY timestamp DESC");
        res.json(conversations);
    } catch (error) {
        console.error("Errore nel recupero delle conversazioni:", error);
        res.status(500).json({ error: "Errore nel server" });
    }
});

// Avviamo il server
app.listen(PORT, () => {
    console.log(`🚀 Server attivo su http://localhost:${PORT}`);
});

app.delete("/conversations/:id", async (req, res) => {
    const conversationId = req.params.id;

    try {
        await db.run("DELETE FROM conversations WHERE id = ?", conversationId);
        res.json({ success: true, message: "Conversazione eliminata" });
    } catch (error) {
        res.status(500).json({ success: false, error: "Errore durante l'eliminazione" });
    }
});

import fs from "fs";
import { Parser } from "json2csv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.get("/download-csv", async (req, res) => {
    try {
        const conversations = await db.all("SELECT * FROM conversations");

        if (conversations.length === 0) {
            return res.status(404).json({ success: false, message: "Nessuna conversazione trovata" });
        }

        const fields = ["id", "timestamp", "user_message", "ai_response"];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(conversations);

        // Percorso del file temporaneo
        const filePath = path.join(__dirname, "conversations.csv");
        fs.writeFileSync(filePath, csv);

        // Invio del file al client
        res.download(filePath, "conversations.csv", (err) => {
            if (err) {
                console.error("Errore nel download:", err);
                res.status(500).json({ success: false, error: "Errore nel download del file" });
            }

            // Cancella il file dopo il download per evitare accumulo di file inutili
            setTimeout(() => {
                fs.unlinkSync(filePath);
            }, 5000);
        });
    } catch (error) {
        console.error("Errore nella generazione del CSV:", error);
        res.status(500).json({ success: false, error: "Errore nel generare il CSV" });
    }
});
