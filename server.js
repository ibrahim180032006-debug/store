import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@tursodatabase/serverless/compat';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 🌟 إخبار السيرفر بمكان ملفات واجهة الموقع
app.use(express.static(path.join(__dirname, 'public')));

// التحقق من المتغيرات البيئية
const cleanUrl = process.env.TURSO_DATABASE_URL?.trim();
const cleanToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!cleanUrl || !cleanToken) {
  console.error('🚨 [تحذير هام]: المتغيرات البيئية TURSO_DATABASE_URL أو TURSO_AUTH_TOKEN مفقودة!');
} else {
  console.log('🔗 يتم الآن تحضير الاتصال بقاعدة البيانات...');
}

// الاتصال بقاعدة بيانات Turso
const db = createClient({
  url: cleanUrl,
  authToken: cleanToken,
});

// 🌟 دالة لإنشاء الجداول تلقائيًا
async function initializeDatabase() {
  try {
    console.log('⏳ جاري إنشاء الجداول إن لم تكن موجودة...');
    
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        phone2 TEXT,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'customer',
        wilaya TEXT,
        baladiya TEXT,
        address TEXT,
        shipping_wilaya TEXT,
        shipping_baladiya TEXT,
        shipping_address TEXT,
        avatar_url TEXT,
        total_orders INTEGER DEFAULT 0,
        total_spent REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        icon TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        old_price REAL,
        stock INTEGER DEFAULT 0,
        category_id INTEGER,
        image_url TEXT,
        video_url TEXT,
        rating REAL DEFAULT 0,
        reviews_count INTEGER DEFAULT 0,
        is_featured INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )`,
      `CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        subtotal REAL NOT NULL,
        shipping_cost REAL DEFAULT 0,
        total REAL NOT NULL,
        shipping_full_name TEXT,
        shipping_phone TEXT,
        shipping_wilaya TEXT,
        shipping_baladiya TEXT,
        shipping_address TEXT,
        payment_method TEXT DEFAULT 'cod',
        payment_status TEXT DEFAULT 'unpaid',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        product_image TEXT,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )`,
      `CREATE TABLE IF NOT EXISTS order_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        link TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT,
        is_approved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`
    ];

    for (const sql of tables) {
      await db.execute(sql);
    }

    // إضافة إعدادات افتراضية إذا كان الجدول فارغًا
    const settingsCount = await db.execute("SELECT COUNT(*) as count FROM settings");
    if (settingsCount.rows[0].count === 0) {
      await db.execute("INSERT INTO settings (key, value) VALUES ('store_name', 'متجري')");
      await db.execute("INSERT INTO settings (key, value) VALUES ('phone', '+213 550 000 000')");
      await db.execute("INSERT INTO settings (key, value) VALUES ('email', 'info@mystore.dz')");
      await db.execute("INSERT INTO settings (key, value) VALUES ('address', 'الجزائر العاصمة')");
      await db.execute("INSERT INTO settings (key, value) VALUES ('shipping', '500')");
      await db.execute("INSERT INTO settings (key, value) VALUES ('free_shipping', '5000')");
      console.log('✅ تم إضافة الإعدادات الافتراضية');
    }

    console.log('✅ تم إنشاء جميع الجداول بنجاح!');
  } catch (error) {
    console.error('❌ فشل إنشاء الجداول:', error.message);
  }
}

// تشغيل دالة إنشاء الجداول
initializeDatabase();

// 🌟 الرابط الرئيسي للموقع
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🌟 رابط فحص حالة قاعدة البيانات
app.get('/api/status', async (req, res) => {
  try {
    const result = await db.execute("SELECT 1;");
    res.json({ message: "الخادم يعمل ومتصل بقاعدة بيانات Turso بنجاح!", result });
  } catch (error) {
    res.status(500).json({ error: "فشل الاتصال بقاعدة البيانات", details: error.message });
  }
});
// ============ API للمنتجات ============
app.get('/api/products', async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM products WHERE is_active = 1");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, description, price, oldPrice, stock, categoryId, imageUrl, videoUrl, isFeatured } = req.body;
    const result = await db.execute({
      sql: `INSERT INTO products (name, description, price, old_price, stock, category_id, image_url, video_url, is_featured) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [name, description, price, oldPrice, stock, categoryId, imageUrl, videoUrl, isFeatured ? 1 : 0]
    });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ API للطلبات ============
app.get('/api/orders', async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM orders ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { status, note } = req.body;
    await db.execute({
      sql: "UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      args: [status, req.params.id]
    });
    await db.execute({
      sql: "INSERT INTO order_tracking (order_id, status, note) VALUES (?, ?, ?)",
      args: [req.params.id, status, note || null]
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ API للعملاء ============
app.get('/api/users', async (req, res) => {
  try {
    const result = await db.execute("SELECT id, full_name, phone, wilaya, total_orders, total_spent, created_at FROM users WHERE role = 'customer'");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ API للإشعارات ============
app.get('/api/notifications', async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    await db.execute({
      sql: "UPDATE notifications SET is_read = 1 WHERE id = ?",
      args: [req.params.id]
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ API للتقييمات ============
app.get('/api/reviews', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT r.*, u.full_name as customer_name, p.name as product_name 
      FROM reviews r 
      JOIN users u ON r.user_id = u.id 
      JOIN products p ON r.product_id = p.id 
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/reviews/:id/approve', async (req, res) => {
  try {
    await db.execute({
      sql: "UPDATE reviews SET is_approved = 1 WHERE id = ?",
      args: [req.params.id]
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ API للإعدادات ============
app.get('/api/settings', async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM settings");
    const settings = {};
    result.rows.forEach(row => { settings[row.key] = row.value; });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
/* ============================================================
   API التسجيل - إنشاء حساب جديد
   ============================================================ */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, phone, phone2, password, wilaya, baladiya } = req.body;

    if (!fullName || !phone || !password || !wilaya || !baladiya) {
      return res.status(400).json({ error: 'جميع الحقول المطلوبة يجب تعبئتها' });
    }

    // التحقق من أن الرقم غير مستخدم
    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE phone = ?",
      args: [phone]
    });
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'هذا الرقم مسجل بالفعل' });
    }

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);

    // إضافة المستخدم
    const result = await db.execute({
      sql: `INSERT INTO users (full_name, phone, phone2, password, role, wilaya, baladiya)
            VALUES (?, ?, ?, ?, 'customer', ?, ?)`,
      args: [fullName, phone, phone2 || null, hashedPassword, wilaya, baladiya]
    });

    // إنشاء إشعار للأدمن
    await db.execute({
      sql: "INSERT INTO notifications (type, title, message) VALUES ('user', ?, ?)",
      args: ['عميل جديد', `${fullName} أنشأ حساباً جديداً`]
    });

    res.json({
      success: true,
      userId: result.lastInsertRowid,
      message: 'تم إنشاء الحساب بنجاح'
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   API تسجيل الدخول (للزبائن والأدمن)
   ============================================================ */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'البيانات مطلوبة' });
    }

    const cleanPhone = phone.replace(/\s/g, '').replace('+213', '0');

    const result = await db.execute({
      sql: "SELECT * FROM users WHERE phone = ? LIMIT 1",
      args: [cleanPhone]
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        fullName: user.full_name,
        phone: user.phone,
        phone2: user.phone2,
        role: user.role,
        wilaya: user.wilaya,
        baladiya: user.baladiya,
        avatarUrl: user.avatar_url,
        totalOrders: user.total_orders,
        totalSpent: user.total_spent
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   API البروفايل - جلب بيانات المستخدم
   ============================================================ */
app.get('/api/profile/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: "SELECT id, full_name, phone, phone2, role, wilaya, baladiya, address, shipping_wilaya, shipping_baladiya, shipping_address, avatar_url, total_orders, total_spent, created_at FROM users WHERE id = ?",
      args: [req.params.id]
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   API تعديل البروفايل
   ============================================================ */
app.put('/api/profile/:id', async (req, res) => {
  try {
    const { fullName, phone2, wilaya, baladiya, address,
            shippingWilaya, shippingBaladiya, shippingAddress, avatarUrl } = req.body;

    await db.execute({
      sql: `UPDATE users SET
              full_name = ?,
              phone2 = ?,
              wilaya = ?,
              baladiya = ?,
              address = ?,
              shipping_wilaya = ?,
              shipping_baladiya = ?,
              shipping_address = ?,
              avatar_url = ?
            WHERE id = ?`,
      args: [
        fullName, phone2 || null, wilaya, baladiya, address || null,
        shippingWilaya || wilaya, shippingBaladiya || baladiya, shippingAddress || null,
        avatarUrl || null, req.params.id
      ]
    });

    res.json({ success: true, message: 'تم تحديث البيانات' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   API تغيير كلمة المرور
   ============================================================ */
app.put('/api/profile/:id/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'كلمتا المرور مطلوبتان' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة قصيرة' });
    }

    const user = await db.execute({
      sql: "SELECT password FROM users WHERE id = ?",
      args: [req.params.id]
    });

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const valid = await bcrypt.compare(currentPassword, user.rows[0].password);
    if (!valid) {
      return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.execute({
      sql: "UPDATE users SET password = ? WHERE id = ?",
      args: [hashed, req.params.id]
    });

    res.json({ success: true, message: 'تم تغيير كلمة المرور' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   API طلبات المستخدم
   ============================================================ */
app.get('/api/profile/:id/orders', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT o.*,
              (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
            FROM orders o
            WHERE o.user_id = ?
            ORDER BY o.created_at DESC`,
      args: [req.params.id]
    });
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
