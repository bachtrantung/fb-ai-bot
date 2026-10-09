const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_INSTRUCTION = `
Bạn là trợ lý Fanpage hỗ trợ khách hàng.
Nhiệm vụ: Trả lời bình luận ngắn gọn (1-2 câu), lịch sự, tự nhiên.
Nếu khách hỏi giá hoặc mua hàng, chào khách và nhắc họ kiểm tra tin nhắn Messenger của Page.
`;

// Xác thực Webhook với Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Nhận bình luận mới
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry) {
      if (!entry.changes) continue;

      for (const change of entry.changes) {
        if (change.field === 'feed' && change.value.item === 'comment' && change.value.verb === 'add') {
          const commentId = change.value.comment_id;
          const userMessage = change.value.message;
          const senderId = change.value.from.id;

          if (senderId === entry.id) continue;

          handleComment(commentId, userMessage);
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

async function handleComment(commentId, text) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_INSTRUCTION 
    });

    const result = await model.generateContent(text);
    const reply = result.response.text() || 'Cảm ơn bạn đã quan tâm đến bài viết!';

    await axios.post(`https://graph.facebook.com/v19.0/${commentId}/comments`, {
      message: reply,
      access_token: PAGE_ACCESS_TOKEN
    });

    console.log(`Đã trả lời bình luận ${commentId}: ${reply}`);
  } catch (err) {
    console.error('Lỗi phản hồi:', err.response ? err.response.data : err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server chạy trên port ${PORT}`));
