const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, { 
  cors: { 
    origin: [
      "https://anonconnect-14b47.web.app",
      "https://anonconnect-14b47.firebaseapp.com",
      "https://anonchatrandom.in",
      "https://www.anonchatrandom.in",
      "http://localhost:3000",
      "http://localhost:5000"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const { MongoClient, ServerApiVersion } = require('mongodb');

// ============================================
// MONGODB CONNECTION
// ============================================

const MONGO_URI = process.env.MONGO_URI || "your_mongodb_connection_string_here";
const client = new MongoClient(MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;
let usersCollection;

// Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB!");
    
    db = client.db("anonconnect");
    usersCollection = db.collection("users");
    
    // Create index on email
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    // Don't exit - continue without DB for testing
  }
}

connectDB();

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors({
  origin: [
    "https://anonconnect-14b47.web.app",
    "https://anonconnect-14b47.firebaseapp.com",
    "https://anonchatrandom.in",
    "https://www.anonchatrandom.in",
    "http://localhost:3000",
    "http://localhost:5000"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options("*", cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ================== RAZORPAY CONFIG ==================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_S1af2JV9L5Vlw5",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "your_razorpay_secret_here",
});

// ================== ROUTES ==================

app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send("User-agent: *\nAllow: /");
});

app.get("/", (req, res) => {
  res.json({ 
    status: "Server is running", 
    timestamp: new Date(),
    database: db ? "Connected" : "Disconnected",
    allowedOrigins: [
      "https://anonconnect-14b47.web.app",
      "https://anonchatrandom.in",
      "https://www.anonchatrandom.in"
    ]
  });
});

// CREATE ORDER
app.post("/create-order", async (req, res) => {
  try {
    console.log("📦 Create Order Request:", req.body);
    
    const { amount } = req.body;
    
    if (!amount) {
      return res.status(400).json({ error: "Amount required" });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "order_" + Date.now(),
    });

    console.log("✅ Order Created:", order.id);
    res.json(order);
    
  } catch (err) {
    console.error("❌ Create Order Error:", err);
    res.status(500).json({ 
      error: "Order creation failed", 
      details: err.message 
    });
  }
});

// VERIFY PAYMENT
app.post("/verify-payment", async (req, res) => {
  try {
    console.log("🔐 Verify Payment Request");
    
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      email,
      plan
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing payment details" 
      });
    }

    if (!email || email.startsWith('guest_')) {
      return res.status(400).json({
        success: false,
        error: "Guest accounts cannot purchase premium"
      });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "your_secret")
      .update(body)
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      console.log("✅ Payment Verified for:", email);
      
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 1);
      
      if (usersCollection) {
        await usersCollection.updateOne(
          { email: email },
          { 
            $set: { 
              isPremium: true,
              plan: plan,
              paymentId: razorpay_payment_id,
              orderId: razorpay_order_id,
              purchaseDate: new Date(),
              expiryDate: expiryDate,
              lastUpdated: new Date()
            }
          },
          { upsert: true }
        );
        
        console.log("💾 Saved to database");
      }
      
      return res.json({ 
        success: true, 
        isPremium: true,
        expiryDate: expiryDate,
        message: "Payment verified!" 
      });
      
    } else {
      console.error("❌ Signature Mismatch");
      return res.status(400).json({ 
        success: false,
        error: "Invalid signature" 
      });
    }
    
  } catch (err) {
    console.error("❌ Verify Error:", err);
    res.status(500).json({ 
      success: false,
      error: "Verification failed"
    });
  }
});

// CHECK PREMIUM STATUS
app.post("/check-status", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.json({ isPremium: false });
    }

    if (email.startsWith('guest_')) {
      return res.json({ 
        isPremium: false,
        isGuest: true
      });
    }
    
    if (!usersCollection) {
      return res.json({ isPremium: false });
    }
    
    const user = await usersCollection.findOne({ email: email });
    
    if (!user) {
      return res.json({ isPremium: false });
    }
    
    const now = new Date();
    const isExpired = user.expiryDate && new Date(user.expiryDate) < now;
    
    if (isExpired) {
      await usersCollection.updateOne(
        { email: email },
        { $set: { isPremium: false, lastUpdated: new Date() } }
      );
      
      return res.json({ 
        isPremium: false,
        expired: true,
        expiryDate: user.expiryDate 
      });
    }
    
    return res.json({ 
      isPremium: user.isPremium || false,
      plan: user.plan,
      expiryDate: user.expiryDate,
      daysRemaining: Math.ceil((new Date(user.expiryDate) - now) / (1000 * 60 * 60 * 24))
    });
    
  } catch (err) {
    console.error("❌ Status Check Error:", err);
    res.json({ isPremium: false });
  }
});

// ================== CHAT SOCKET ==================
let queue = [];

io.on("connection", (socket) => {
  console.log("🔌 New connection:", socket.id);
  socket.lastMsgTime = 0;

  socket.on("find_partner", async (userInfo) => {
    socket.userInfo = userInfo || { 
      nickname: "Stranger", 
      myGender: "male", 
      partnerGender: "random"
    };

    // SERVER-SIDE VALIDATION
    if (userInfo.partnerGender !== 'random') {
      if (userInfo.isGuest || !userInfo.email || userInfo.email.startsWith('guest_')) {
        socket.userInfo.partnerGender = 'random';
        socket.emit('premium_required', { 
          message: 'Gender filters require Google login & Premium' 
        });
      } else if (!userInfo.isPremium && usersCollection) {
        try {
          const user = await usersCollection.findOne({ email: userInfo.email });
          
          if (!user || !user.isPremium) {
            socket.userInfo.partnerGender = 'random';
            socket.emit('premium_required', { 
              message: 'Premium subscription required for filters' 
            });
          }
        } catch (err) {
          socket.userInfo.partnerGender = 'random';
        }
      }
    }

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
      
      socket.emit("chat_start", { 
        room, 
        country: partner.userInfo.country || "🌐", 
        nickname: partner.userInfo.nickname || "Stranger"
      });
      
      partner.emit("chat_start", { 
        room, 
        country: socket.userInfo.country || "🌐", 
        nickname: socket.userInfo.nickname || "Stranger"
      });
      
      console.log("✅ Match found:", socket.id, "↔", partner.id);
    } else {
      queue.push(socket);
      socket.emit("waiting");
      console.log("⏳ User waiting:", socket.id);
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
    console.log("❌ Disconnected:", socket.id);
  });
});

// ================== GRACEFUL SHUTDOWN ==================
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down...');
  if (client) await client.close();
  process.exit(0);
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
  console.log("🔑 Razorpay:", process.env.RAZORPAY_KEY_ID ? "Set ✅" : "Not Set ⚠️");
  console.log("🗄️  MongoDB:", db ? "Connected ✅" : "Not Connected ⚠️");
  console.log("🌐 CORS enabled for:");
  console.log("   - https://anonconnect-14b47.web.app");
  console.log("   - https://anonchatrandom.in");
  console.log("   - https://www.anonchatrandom.in");
});
