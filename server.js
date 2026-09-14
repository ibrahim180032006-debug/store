import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@tursodatabase/serverless/compat';
import path from 'path';
import { fileURLToPath } from 'url';

// إعداد متغيرات المسارات (مطلوبة لأنك تستخدم نظام ES Modules / import)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إضافة رادار الأخطاء الشامل لالتقاط أي مشكلة مخفية في النظام
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

// 🌟 إخبار السيرفر بمكان ملفات واجهة الموقع (HTML, CSS, JS)
// افترضنا أنك ستضع ملفات الموقع داخل مجلد باسم "public"
app.use(express.static(path.join(__dirname, 'public')));

// فحص وتطهير المتغيرات البيئية
const cleanUrl = process.env.TURSO_DATABASE_URL?.trim();
const cleanToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!cleanUrl || !cleanToken) {
  console.error('🚨 [تحذير هام]: المتغيرات البيئية TURSO_DATABASE_URL أو TURSO_AUTH_TOKEN مفقودة أو غير مقروءة!');
} else {
  console.log('🔗 يتم الآن تحضير الاتصال بقاعدة البيانات...');
}

// الاتصال بقاعدة بيانات Turso
const db = createClient({
  url: cleanUrl,
  authToken: cleanToken,
});

// 🌟 الرابط الرئيسي للموقع: الآن سيقوم بعرض صفحة المتجر بدلاً من رسالة الفحص
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🌟 رابط فرعي مخصص لفحص حالة قاعدة البيانات
// يمكنك زيارة https://your-app-name.onrender.com/api/status للتأكد من عمل القاعدة
app.get('/api/status', async (req, res) => {
  try {
    console.log("⏳ جاري محاولة الاتصال بقاعدة البيانات وتنفيذ استعلام...");
    const result = await db.execute("SELECT 1;");
    console.log("✅ نجح الاتصال بقاعدة البيانات!");
    res.json({ message: "الخادم يعمل ومتصل بقاعدة بيانات Turso بنجاح!", result });
  } catch (error) {
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

// Render يقدم البورت تلقائياً
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});