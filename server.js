import express from "express";
import fetch from "node-fetch";
import { WebSocketServer } from "ws";
import webpush from "web-push";

const app = express();
app.use(express.json());

// بيانات VAPID لمصادقة Push (أنشئها مرة واحدة)
const publicVapidKey = process.env.VAPID_PUBLIC;
const privateVapidKey = process.env.VAPID_PRIVATE;
webpush.setVapidDetails(
  "mailto:you@example.com",
  publicVapidKey,
  privateVapidKey
);

// تخزين اشتراكات Push
const pushSubscriptions = [];

// الحالة العامة (في التطبيق الفعلي ستأتي من قاعدة بيانات)
globalThis.cafeState = { sales: [], ingredients: {} };

// API لإرجاع بيانات المالك
app.get("/api/owner-data", (req, res) => {
  const state = globalThis.cafeState;
  const todayStr = new Date().toDateString();
  const todaySales = state.sales.filter(s => new Date(s.time).toDateString() === todayStr);
  const totalSales = todaySales.reduce((sum, s) => sum + s.total, 0);
  const orders = todaySales.length;
  const avg = orders ? totalSales / orders : 0;
  const lowItems = Object.values(state.ingredients).filter(x => x.qty <= x.low);

  res.json({
    kpis: { sales: totalSales, orders, avg, low: lowItems.length },
    sales: todaySales.slice(-5).reverse(),
    alerts: lowItems.map(ing => `🚨 ${ing.name}: ${ing.qty}${ing.unit} متبقية`)
  });
});

// API لتسجيل اشتراك Push
app.post("/api/subscribe", (req, res) => {
  const subscription = req.body;
  pushSubscriptions.push(subscription);
  res.status(201).json({});
});

// خادم HTTP
const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Server running...");
});

// WebSocket Server
const wss = new WebSocketServer({ server });

function broadcastUpdate(message = "تحديث جديد") {
  // إرسال عبر WebSocket
  const payload = JSON.stringify({ type: "update" });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(payload);
  });

  // إرسال إشعار Push
  pushSubscriptions.forEach(sub => {
    webpush.sendNotification(sub, JSON.stringify({ title: "📊 لوحة المالك", body: message }))
      .catch(err => console.error("Push error:", err));
  });
}

// مثال: Endpoint لتسجيل عملية بيع
app.post("/api/sale", (req, res) => {
  const sale = req.body;
  globalThis.cafeState.sales.push(sale);
  broadcastUpdate(`💰 بيع جديد: ${sale.total} MAD`);
  res.json({ ok: true });
});

// مثال: Endpoint لتحديث المخزون
app.post("/api/update-stock", (req, res) => {
  const { id, qty } = req.body;
  if (globalThis.cafeState.ingredients[id]) {
    globalThis.cafeState.ingredients[id].qty = qty;
    broadcastUpdate(`⚠️ تحديث مخزون: ${globalThis.cafeState.ingredients[id].name}`);
  }
  res.json({ ok: true });
});
