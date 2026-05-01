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
  console.log("Web server chạy tại port", PORT);
});

// ===== AUTO PING =====
const URL = process.env.RENDER_URL;

if (URL) {
  setInterval(async () => {
    try {
      await axios.get(URL);
      console.log("Ping giữ bot sống");
    } catch {}
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
const translateMode = new Map(); // 🔥 chế độ dịch

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

  // ===== NGÔN NGỮ =====
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

  // ===== CHẾ ĐỘ DỊCH =====
  if (content === "!dichcn") {
    translateMode.set(userId, "cn");
    return message.reply("Đã bật dịch sang tiếng Trung 🇨🇳");
  }

  if (content === "!dichen") {
    translateMode.set(userId, "en");
    return message.reply("Đã bật dịch sang tiếng Anh 🇺🇸");
  }

  if (content === "!dichvn") {
    translateMode.set(userId, "vi");
    return message.reply("Đã bật dịch sang tiếng Việt 🇻🇳");
  }

  if (content === "!tatdich") {
    translateMode.delete(userId);
    return message.reply("Đã tắt chế độ dịch ❌");
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

  // ===== ƯU TIÊN CHẾ ĐỘ DỊCH =====
  if (translateMode.has(userId)) {
    const lang = translateMode.get(userId);

    let targetLang =
      lang === "vi" ? "Tiếng Việt" :
      lang === "en" ? "English" :
      "中文";

    try {
      await message.channel.sendTyping();

      const res = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Bạn là công cụ dịch. Chỉ dịch, không giải thích."
          },
          {
            role: "user",
            content: `Dịch sang ${targetLang}: ${message.content}`
          }
        ]
      });

      return message.reply(res.choices[0].message.content);

    } catch (err) {
      console.error(err);
      return message.reply("Lỗi dịch 😢");
    }
  }

  // ===== CHAT AI =====
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

  const lang = userLang.get(userId) || "vi";

  let systemPrompt = `
Bạn là một AI nói chuyện tự nhiên như người thật.

- Trả lời giống chat đời thường
- Không máy móc
- Không sách giáo khoa
- Có thể thêm cảm xúc 😄😅😎
- Nếu hợp lý, hỏi lại
- Trả lời đúng ngôn ngữ

Ngôn ngữ: ${
    lang === "vi"
      ? "Tiếng Việt"
      : lang === "en"
      ? "English"
      : "中文"
  }
`;

  if (!conversations.has(userId)) {
    conversations.set(userId, []);
  }

  const history = conversations.get(userId);

  history[0] = {
    role: "system",
    content: systemPrompt
  };

  history.push({
    role: "user",
    content: `Người dùng nói: ${prompt}`
  });

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
