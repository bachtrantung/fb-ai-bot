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

// Đường dẫn kiểm tra máy chủ
app.get('/', (req, res) => {
  res.status(200).send('Server AI Bot đang hoạt động bình thường!');
});

// Xác thực Webhook với Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

// Nhận sự kiện từ Meta
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server chạy trên port ${PORT}`);
});
