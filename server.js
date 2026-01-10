const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, { cors: { origin: "*" } });
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

app.use(cors({ origin: "*" }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ================== RAZORPAY CONFIG ==================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ================== ROUTES ==================

// SEO
app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send("User-agent: *\nAllow: /");
});

// ✅ CREATE ORDER
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: "Amount required" });

    const order = await razorpay.orders.create({
      amount: amount * 100, // paise
      currency: "INR",
      receipt: "order_" + Date.now(),
    });

    res.json(order);
  } catch (err) {
    console.error("Create Order Error:", err);
    res.status(500).json({ error: "Order creation failed" });
  }
});

// ✅ VERIFY PAYMENT (REAL SIGNATURE CHECK)
app.post("/verify-payment", (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      // 👉 Future: DB में premium=true save करना
      return res.json({ success: true, isPremium: true });
    } else {
      return res.status(400).json({ success: false });
    }
  } catch (err) {
    console.error("Verify Error:", err);
    res.status(500).json({ success: false });
  }
});

// ✅ PREMIUM STATUS CHECK (Dummy – Future DB)
app.post("/check-status", (req, res) => {
  res.json({ isPremium: false });
});

// ================== CHAT SOCKET ==================
let queue = [];

io.on("connection", (socket) => {
  socket.lastMsgTime = 0;

  socket.on("find_partner", (userInfo) => {
    socket.userInfo =
      userInfo || { nickname: "Stranger", myGender: "male", partnerGender: "random" };

    queue = queue.filter((s) => s.id !== socket.id);

    const matchIndex = queue.findIndex((waiting) => {
      const me = socket.userInfo;
      const them = waiting.userInfo;
      return (
        (me.partnerGender === "random" || me.partnerGender === them.myGender) &&
        (them.partnerGender === "random" || them.partnerGender === me.myGender)
      );
    });

    if (matchIndex > -1) {
      const partner = queue.splice(matchIndex, 1)[0];
      const room = socket.id + "#" + partner.id;
      socket.join(room);
      partner.join(room);
      socket.emit("chat_start", { room, country: partner.userInfo.country, nickname: partner.userInfo.nickname });
      partner.emit("chat_start", { room, country: socket.userInfo.country, nickname: socket.userInfo.nickname });
    } else {
      queue.push(socket);
      socket.emit("waiting");
    }
  });

  socket.on("send_message", (data) => {
    const now = Date.now();
    if (now - socket.lastMsgTime < 500) return;
    socket.lastMsgTime = now;
    socket.to(data.room).emit("receive_message", data.message);
  });

  socket.on("typing_start", (room) => socket.to(room).emit("partner_typing"));
  socket.on("typing_stop", (room) => socket.to(room).emit("partner_stopped_typing"));

  socket.on("skip_chat", (room) => {
    socket.to(room).emit("partner_left");
    socket.leave(room);
    queue = queue.filter((s) => s.id !== socket.id);
  });

  socket.on("disconnect", () => {
    queue = queue.filter((s) => s.id !== socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log("Server running on", PORT));
