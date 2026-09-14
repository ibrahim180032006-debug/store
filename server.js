import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { createClient } from '@tursodatabase/serverless/compat';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// رادار الأخطاء
process.on('unhandledRejection', (reason) => console.error('🚨 Unhandled:', reason));
process.on('uncaughtException', (error) => console.error('🚨 Uncaught:', error));

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 🌟 إخبار السيرفر بمكان ملفات واجهة الموقع
app.use(express.static(path.join(__dirname, 'public')));

// التحقق من المتغيرات البيئية
const cleanUrl = process.env.TURSO_DATABASE_URL?.trim();
const cleanToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!cleanUrl || !cleanToken) {
  console.error('🚨 المتغيرات البيئية TURSO_DATABASE_URL أو TURSO_AUTH_TOKEN مفقودة!');
} else {
  console.log('🔗 يتم الآن تحضير الاتصال بقاعدة البيانات...');
}

// الاتصال بقاعدة بيانات Turso
const db = createClient({
  url: cleanUrl,
  authToken: cleanToken,
});

/* ============================================================
   إنشاء الجداول + حساب الأدمن
   ============================================================ */
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        product_image TEXT,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS order_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`
    ];

    for (const sql of tables) {
      await db.execute(sql);
    }

    // الإعدادات الافتراضية
    const settingsCount = await db.execute("SELECT COUNT(*) as count FROM settings");
    if (settingsCount.rows[0].count === 0) {
      const defaults = [
        ['store_name', 'متجري'],
        ['phone', '+213 550 000 000'],
        ['email', 'info@mystore.dz'],
        ['address', 'الجزائر العاصمة'],
        ['description', 'متجرك الإلكتروني الموثوق'],
        ['shipping', '500'],
        ['free_shipping', '5000']
      ];
      for (const [k, v] of defaults) {
        await db.execute({ sql: "INSERT INTO settings (key, value) VALUES (?, ?)", args: [k, v] });
      }
      console.log('✅ تم إضافة الإعدادات الافتراضية');
    }

    // الفئات الافتراضية
    const catCount = await db.execute("SELECT COUNT(*) as count FROM categories");
    if (catCount.rows[0].count === 0) {
      const cats = [
        ['إلكترونيات', '📱'], ['أزياء', '👕'], ['عطور', '🌸'],
        ['منزل ومطبخ', '🏠'], ['رياضة', '⚽']
      ];
      for (const [n, i] of cats) {
        await db.execute({ sql: "INSERT INTO categories (name, icon) VALUES (?, ?)", args: [n, i] });
      }
      console.log('✅ تم إضافة الفئات الافتراضية');
    }

    // 🌟 إنشاء حساب الأدمن الافتراضي
    const adminCount = await db.execute("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
    if (adminCount.rows[0].count === 0) {
      const hashed = await bcrypt.hash('admin123', 10);
      await db.execute({
        sql: `INSERT INTO users (full_name, phone, password, role, wilaya, baladiya)
              VALUES (?, ?, ?, 'admin', ?, ?)`,
        args: ['المدير', '0550000000', hashed, '16 - الجزائر', 'الجزائر الوسطى']
      });
      console.log('✅ تم إنشاء حساب الأدمن: 0550000000 / admin123');
    }

    console.log('✅ تم إنشاء جميع الجداول بنجاح!');
  } catch (error) {
    console.error('❌ فشل إنشاء الجداول:', error.message);
  }
}

initializeDatabase();

/* ============================================================
   الصفحات الأساسية
   ============================================================ */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

/* ============================================================
   فحص الحالة
   ============================================================ */
app.get('/api/status', async (req, res) => {
  try {
    const result = await db.execute("SELECT 1;");
    res.json({ message: "الخادم يعمل ومتصل بقاعدة بيانات Turso بنجاح!", result });
  } catch (error) {
    res.status(500).json({ error: "فشل الاتصال بقاعدة البيانات", details: error.message });
  }
});

/* ============================================================
   API المصادقة
   ============================================================ */

// تسجيل حساب جديد
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, phone, phone2, password, wilaya, baladiya } = req.body;

    if (!fullName || !phone || !password || !wilaya || !baladiya) {
      return res.status(400).json({ error: 'جميع الحقول المطلوبة يجب تعبئتها' });
    }

    const cleanPhone = phone.replace(/\s/g, '').replace('+213', '0');

    // التحقق من أن الرقم غير مستخدم
    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE phone = ?",
      args: [cleanPhone]
    });
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'هذا الرقم مسجل بالفعل' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.execute({
      sql: `INSERT INTO users (full_name, phone, phone2, password, role, wilaya, baladiya)
            VALUES (?, ?, ?, ?, 'customer', ?, ?)`,
      args: [fullName, cleanPhone, phone2 || null, hashedPassword, wilaya, baladiya]
    });

    // إشعار للأدمن
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

// تسجيل الدخول
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
   API البروفايل
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
});

/* ============================================================
   API الإحصائيات (Dashboard)
   ============================================================ */
app.get('/api/stats/dashboard', async (req, res) => {
  try {
    const sales = await db.execute("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status != 'cancelled'");
    const orders = await db.execute("SELECT COUNT(*) as count FROM orders");
    const customers = await db.execute("SELECT COUNT(*) as count FROM users WHERE role = 'customer'");
    const products = await db.execute("SELECT COUNT(*) as count FROM products WHERE is_active = 1");
    const pending = await db.execute("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
    const unread = await db.execute("SELECT COUNT(*) as count FROM notifications WHERE is_read = 0");

    res.json({
      totalSales: sales.rows[0].total || 0,
      totalOrders: orders.rows[0].count || 0,
      totalCustomers: customers.rows[0].count || 0,
      totalProducts: products.rows[0].count || 0,
      pendingOrders: pending.rows[0].count || 0,
      unreadNotifications: unread.rows[0].count || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   API المنتجات
   ============================================================ */
app.get('/api/products', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT p.*, c.name as category_name, c.icon as category_icon
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, description, price, oldPrice, stock, categoryId, imageUrl, videoUrl, isFeatured } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'الاسم والسعر مطلوبان' });

    const result = await db.execute({
      sql: `INSERT INTO products (name, description, price, old_price, stock, category_id, image_url, video_url, is_featured, rating)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 5.0)`,
      args: [name, description || null, price, oldPrice || null, stock || 0, categoryId || null, imageUrl || null, videoUrl || null, isFeatured ? 1 : 0]
    });

    await db.execute({
      sql: "INSERT INTO notifications (type, title, message) VALUES ('alert', ?, ?)",
      args: ['منتج جديد', `تم إضافة "${name}"`]
    });

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { name, description, price, oldPrice, stock, categoryId, imageUrl, videoUrl, isActive } = req.body;
    await db.execute({
      sql: `UPDATE products SET name = ?, description = ?, price = ?, old_price = ?, stock = ?,
            category_id = ?, image_url = ?, video_url = ?, is_active = ? WHERE id = ?`,
      args: [name, description, price, oldPrice || null, stock, categoryId, imageUrl, videoUrl, isActive ? 1 : 0, req.params.id]
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await db.execute({ sql: "DELETE FROM products WHERE id = ?", args: [req.params.id] });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   API الفئات
   ============================================================ */
app.get('/api/categories', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT c.*, (SELECT COUNT(*) FROM products WHERE category_id = c.id) as products_count
      FROM categories c ORDER BY c.name
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });

    const exists = await db.execute({ sql: "SELECT id FROM categories WHERE name = ?", args: [name] });
    if (exists.rows.length > 0) return res.status(400).json({ error: 'الفئة موجودة' });

    const result = await db.execute({
      sql: "INSERT INTO categories (name, icon) VALUES (?, ?)",
      args: [name, icon || '📦']
    });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const products = await db.execute({
      sql: "SELECT COUNT(*) as count FROM products WHERE category_id = ?",
      args: [req.params.id]
    });
    if (products.rows[0].count > 0) {
      return res.status(400).json({ error: 'لا يمكن حذف فئة تحتوي على منتجات' });
    }
    await db.execute({ sql: "DELETE FROM categories WHERE id = ?", args: [req.params.id] });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   API الطلبات
   ============================================================ */
app.get('/api/orders', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT o.*, u.full_name as customer_name, u.phone as customer_phone,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await db.execute({ sql: "SELECT * FROM orders WHERE id = ?", args: [req.params.id] });
    if (order.rows.length === 0) return res.status(404).json({ error: 'غير موجود' });

    const items = await db.execute({ sql: "SELECT * FROM order_items WHERE order_id = ?", args: [req.params.id] });
    const tracking = await db.execute({
      sql: "SELECT * FROM order_tracking WHERE order_id = ? ORDER BY created_at DESC",
      args: [req.params.id]
    });

    res.json({ order: order.rows[0], items: items.rows, tracking: tracking.rows });
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

/* ============================================================
   API العملاء
   ============================================================ */
app.get('/api/customers', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT id, full_name, phone, phone2, wilaya, baladiya, address, avatar_url,
             total_orders, total_spent, created_at
      FROM users WHERE role = 'customer'
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/customers/:id', async (req, res) => {
  try {
    const customer = await db.execute({
      sql: "SELECT * FROM users WHERE id = ? AND role = 'customer'",
      args: [req.params.id]
    });
    if (customer.rows.length === 0) return res.status(404).json({ error: 'غير موجود' });

    const orders = await db.execute({
      sql: "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
      args: [req.params.id]
    });

    res.json({ customer: customer.rows[0], orders: orders.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   API المدفوعات
   ============================================================ */
app.get('/api/payments', async (req, res) => {
  try {
    const paid = await db.execute("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = 'delivered'");
    const pending = await db.execute("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status IN ('pending', 'confirmed', 'shipped')");
    const cancelled = await db.execute("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = 'cancelled'");

    const payments = await db.execute(`
      SELECT o.id, o.order_number, o.total, o.status, o.payment_method, o.payment_status, o.created_at,
             u.full_name as customer_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `);

    res.json({
      summary: {
        paid: paid.rows[0].total || 0,
        pending: pending.rows[0].total || 0,
        cancelled: cancelled.rows[0].total || 0
      },
      payments: payments.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   API التقييمات
   ============================================================ */
app.get('/api/reviews', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT r.*, u.full_name as customer_name, p.name as product_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN products p ON r.product_id = p.id
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/reviews/:id/approve', async (req, res) => {
  try {
    await db.execute({ sql: "UPDATE reviews SET is_approved = 1 WHERE id = ?", args: [req.params.id] });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/reviews/:id', async (req, res) => {
  try {
    await db.execute({ sql: "DELETE FROM reviews WHERE id = ?", args: [req.params.id] });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   API الإشعارات
   ============================================================ */
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
    await db.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE id = ?", args: [req.params.id] });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/notifications/read-all', async (req, res) => {
  try {
    await db.execute("UPDATE notifications SET is_read = 1");
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   API الإعدادات
   ============================================================ */
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

app.put('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
      await db.execute({
        sql: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        args: [key, String(value)]
      });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   API التحليلات
   ============================================================ */
app.get('/api/analytics/top-products', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT p.id, p.name, p.price, p.image_url, p.reviews_count,
             COALESCE(SUM(oi.quantity), 0) as sales_count,
             COALESCE(SUM(oi.quantity * oi.price), 0) as revenue
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      GROUP BY p.id
      ORDER BY sales_count DESC
      LIMIT 5
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   تشغيل الخادم
   ============================================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
