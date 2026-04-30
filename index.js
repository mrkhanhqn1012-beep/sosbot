require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const OpenAI = require("openai");

// ===== WEB SERVER (Render) =====
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(3000, () => {
  console.log("Web server đang chạy");
});

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

  // ===== RESET CHAT (luôn hoạt động) =====
  if (
    message.content.toLowerCase() === "reset" ||
    message.content.toLowerCase() === "!new" ||
    (message.mentions.has(client.user) && message.content.toLowerCase().includes("new"))
  ) {
    conversations.delete(userId);
    activeUsers.delete(userId);

    return message.reply("Đã reset cuộc trò chuyện 🆕");
  }

  const isMention = message.mentions.has(client.user);

  // bật chat khi tag
  if (isMention) {
    activeUsers.set(userId, Date.now());
  }

  // chưa bật chat thì bỏ
  if (!isMention && !activeUsers.has(userId)) return;

  // timeout 2 phút
  const lastActive = activeUsers.get(userId);
  if (Date.now() - lastActive > 2 * 60 * 1000) {
    activeUsers.delete(userId);
    conversations.delete(userId);
    return;
  }

  activeUsers.set(userId, Date.now());

  // lấy nội dung
  let prompt = message.content
    .replace(`<@${client.user.id}>`, "")
    .replace(`<@!${client.user.id}>`, "")
    .trim();

  // lấy ảnh
  let imageUrl = null;
  if (message.attachments.size > 0) {
    imageUrl = message.attachments.first().url;
  }

  if (!prompt && !imageUrl) return;

  if (!prompt && imageUrl) {
    prompt = "Mô tả ảnh này";
  }

  // ===== HISTORY =====
  if (!conversations.has(userId)) {
    conversations.set(userId, [
      {
        role: "system",
        content: "Bạn là một AI thân thiện, trả lời ngắn gọn, dễ hiểu."
      }
    ]);
  }

  const history = conversations.get(userId);

  history.push({ role: "user", content: prompt });

  if (history.length > 10) history.splice(1, 1);

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
