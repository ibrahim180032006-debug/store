import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

// 1. إضافة رادار الأخطاء الشامل لالتقاط أي مشكلة مخفية في النظام
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 [تفاصيل الخطأ المخفي - Unhandled Rejection]:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('🚨 [خطأ حرج في النظام - Uncaught Exception]:', error);
});

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// فحص سريع للتأكد من أن Render يقرأ المتغيرات بشكل صحيح
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error('🚨 [تحذير هام]: المتغيرات البيئية TURSO_DATABASE_URL أو TURSO_AUTH_TOKEN مفقودة أو غير مقروءة!');
}

// الاتصال بقاعدة بيانات Turso عبر المتغيرات البيئية
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// تجربة الاتصال بقاعدة البيانات عند فتح الصفحة الرئيسية للخادم
app.get('/', async (req, res) => {
  try {
    console.log("⏳ جاري محاولة الاتصال بقاعدة البيانات وتنفيذ استعلام...");
    const result = await db.execute("SELECT 1;");
    console.log("✅ نجح الاتصال بقاعدة البيانات!");
    res.json({ message: "الخادم يعمل ومتصل بقاعدة بيانات Turso بنجاح!", result });
  } catch (error) {
    // 2. طباعة تفاصيل الخطأ الدقيقة في سجلات Render
    console.error("❌ فشل الاتصال بقاعدة البيانات. السبب الحقيقي هو:", error.message);
    if (error.cause) console.error("🔍 السبب الجذري (Cause):", error.cause);
    console.error("📋 تفاصيل الخطأ الكاملة:", error);

    res.status(500).json({ 
      error: "فشل الاتصال بقاعدة البيانات", 
      details: error.message,
      hint: "تم طباعة التفاصيل الدقيقة في سجلات Render (Logs)"
    });
  }
});

// Render يقدم البورت تلقائياً عبر process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
