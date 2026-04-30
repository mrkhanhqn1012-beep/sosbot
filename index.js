require("dotenv").config();
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(3000, () => {
  console.log("Web server đang chạy");
});

const { Client, GatewayIntentBits } = require("discord.js");
const OpenAI = require("openai");

// ===== DISCORD =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== OPENROUTER (FREE) =====
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

// ===== BOT READY =====
client.on("clientReady", () => {
  console.log(`Bot đã đăng nhập: ${client.user.tag}`);
});

// ===== HÀM GỌI AI =====
async function askAI(prompt) {
  const response = await openai.chat.completions.create({
    model: "openai/gpt-3.5-turbo", // model free
    messages: [
      { role: "user", content: prompt }
    ]
  });

  return response.choices[0].message.content;
}

// ===== LẮNG NGHE TIN NHẮN =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // check nếu có tag bot
  if (message.mentions.has(client.user)) {
    // lấy nội dung sau khi tag bot
    const prompt = message.content.replace(`<@${client.user.id}>`, "").trim();

    if (!prompt) {
      return message.reply("Bạn cần hỏi gì đó 😅");
    }

    try {
      const reply = await askAI(prompt);
      message.reply(reply);
    } catch (err) {
      console.error(err);

      if (err.status === 429) {
        message.reply("Đang bị rate limit, thử lại sau 😢");
      } else {
        message.reply("Lỗi API rồi 😵");
      }
    }
  }
});

// ===== LOGIN =====
client.login(process.env.TOKEN);