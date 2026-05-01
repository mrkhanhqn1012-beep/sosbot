require("dotenv").config();

const express = require("express");
const axios = require("axios");
const { Client, GatewayIntentBits } = require("discord.js");
const OpenAI = require("openai");

// ===== WEB SERVER =====
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Web server đang chạy tại port", PORT);
});

// ===== AUTO PING =====
const URL = process.env.RENDER_URL;

if (URL) {
  setInterval(async () => {
    try {
      await axios.get(URL);
      console.log("Ping giữ bot sống");
    } catch (err) {}
  }, 5 * 60 * 1000);
}

// ===== DISCORD =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== OPENROUTER =====
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

// ===== MEMORY =====
const activeUsers = new Map();
const conversations = new Map();
const userLang = new Map();

// ===== READY =====
client.on("clientReady", () => {
  console.log(`Bot online: ${client.user.tag}`);
});

// ===== AI =====
async function askAI(history, imageUrl = null) {
  let messages = [...history];

  if (imageUrl) {
    const last = messages.pop();
    messages.push({
      role: "user",
      content: [
        { type: "text", text: last.content },
        { type: "image_url", image_url: { url: imageUrl } }
      ]
    });
  }

  const response = await openai.chat.completions.create({
    model: "openai/gpt-4o-mini",
    messages: messages
  });

  return response.choices[0].message.content;
}

// ===== MESSAGE =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const content = message.content.toLowerCase();

  // ===== ĐỔI NGÔN NGỮ =====
  if (content === "!vi") {
    userLang.set(userId, "vi");
    return message.reply("Đã chuyển sang tiếng Việt 🇻🇳");
  }

  if (content === "!en") {
    userLang.set(userId, "en");
    return message.reply("Switched to English 🇺🇸");
  }

  if (content === "!cn") {
    userLang.set(userId, "cn");
    return message.reply("已切换到中文 🇨🇳");
  }

  // ===== RESET =====
  if (
    content === "reset" ||
    content === "!new" ||
    (message.mentions.has(client.user) && content.includes("new"))
  ) {
    conversations.delete(userId);
    activeUsers.delete(userId);
    return message.reply("Đã reset 🆕");
  }

  const isMention = message.mentions.has(client.user);

  if (isMention) {
    activeUsers.set(userId, Date.now());
  }

  if (!isMention && !activeUsers.has(userId)) return;

  const lastActive = activeUsers.get(userId);

  if (Date.now() - lastActive > 10 * 60 * 1000) {
    activeUsers.delete(userId);
    conversations.delete(userId);
    return;
  }

  activeUsers.set(userId, Date.now());

  let prompt = message.content
    .replace(`<@${client.user.id}>`, "")
    .replace(`<@!${client.user.id}>`, "")
    .trim();

  let imageUrl = null;
  if (message.attachments.size > 0) {
    imageUrl = message.attachments.first().url;
  }

  if (!prompt && !imageUrl) return;

  if (!prompt && imageUrl) {
    prompt = "Mô tả ảnh này";
  }

  // ===== NGÔN NGỮ + PROMPT XỊN =====
  const lang = userLang.get(userId) || "vi";

  let systemPrompt = `
Bạn là một AI nói chuyện tự nhiên như người thật.

- Không trả lời máy móc
- Không nói kiểu sách giáo khoa
- Trả lời giống chat đời thường
- Có thể thêm cảm xúc nhẹ 😄😅😎
- Nếu hợp lý, hỏi lại để tiếp tục câu chuyện
- Không nói "tôi là AI"

Ngôn ngữ: ${
    lang === "vi"
      ? "Tiếng Việt"
      : lang === "en"
      ? "English"
      : "中文"
  }
`;

  // ===== HISTORY =====
  if (!conversations.has(userId)) {
    conversations.set(userId, [
      {
        role: "system",
        content: systemPrompt
      }
    ]);
  }

  const history = conversations.get(userId);

  history.push({
    role: "user",
    content: `Người dùng nói: ${prompt}`
  });

  // tăng memory
  if (history.length > 20) history.splice(1, 1);

  try {
    await message.channel.sendTyping();

    const reply = await askAI(history, imageUrl);

    history.push({ role: "assistant", content: reply });

    message.reply(reply);

  } catch (err) {
    console.error(err);

    if (err.status === 429) {
      message.reply("Đang bị giới hạn 😢");
    } else {
      message.reply("Lỗi rồi 😵");
    }
  }
});

// ===== LOGIN =====
client.login(process.env.TOKEN);
