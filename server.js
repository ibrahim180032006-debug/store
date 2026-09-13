import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// الاتصال بقاعدة بيانات Turso عبر المتغيرات البيئية
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// تجربة الاتصال بقاعدة البيانات عند فتح الصفحة الرئيسية للخادم
app.get('/', async (req, res) => {
  try {
    const result = await db.execute("SELECT 1;");
    res.json({ message: "الخادم يعمل ومتصل بقاعدة بيانات Turso بنجاح!", result });
  } catch (error) {
    res.status(500).json({ error: "فشل الاتصال بقاعدة البيانات", details: error.message });
  }
});

// Render يقدم البورت تلقائياً عبر process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
