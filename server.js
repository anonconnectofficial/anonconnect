const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, { 
  cors: { 
    origin: "*",
    methods: ["GET", "POST"]
  } 
});
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const { MongoClient, ServerApiVersion } = require('mongodb');

// ============================================
// 🔥 MONGODB CONNECTION
// ============================================

const MONGO_URI = process.env.MONGO_URI;
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
    
    // Create index on email for faster queries
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1);
  }
}

connectDB();

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors({
  origin: "*",
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
  key_secret: process.env.RAZORPAY_KEY_SECRET,
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
    database: db ? "Connected" : "Disconnected"
  });
});

// ✅ CREATE ORDER
app.post("/create-order", async (req, res) => {
  try {
    console.log("📦 Create Order Request:", req.body);
    
    const { amount } = req.body;
    
    if (!amount) {
      return res.status(400).json({ error: "Amount required" });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error("❌ RAZORPAY_KEY_SECRET not set");
      return res.status(500).json({ error: "Payment gateway not configured" });
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

// ✅ VERIFY PAYMENT & SAVE TO DATABASE
app.post("/verify-payment", async (req, res) => {
  try {
    console.log("🔐 Verify Payment Request:", req.body);
    
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

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: "Email required" 
      });
    }

    // 🔥 Prevent guest users from upgrading
    if (email.startsWith('guest_')) {
      return res.status(400).json({
        success: false,
        error: "Guest accounts cannot purchase premium. Please login with Google."
      });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      console.log("✅ Payment Verified for:", email);
      
      // Calculate expiry date (1 month from now)
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 1);
      
      // Save/Update user in database
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
        { upsert: true } // Create if doesn't exist
      );
      
      console.log("💾 Saved to database:", email, "Plan:", plan, "Expires:", expiryDate);
      
      return res.json({ 
        success: true, 
        isPremium: true,
        expiryDate: expiryDate,
        message: "Payment verified & premium activated!" 
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
      error: "Verification failed",
      details: err.message
    });
  }
});

// ✅ CHECK PREMIUM STATUS FROM DATABASE
app.post("/check-status", async (req, res) => {
  try {
    console.log("📊 Status Check Request:", req.body);
    
    const { email } = req.body;
    
    if (!email) {
      return res.json({ isPremium: false });
    }

    // 🔥 Guest users are never premium
    if (email.startsWith('guest_')) {
      return res.json({ 
        isPremium: false,
        isGuest: true,
        message: "Guest mode - limited features"
      });
    }
    
    // Find user in database
    const user = await usersCollection.findOne({ email: email });
    
    if (!user) {
      console.log("❌ User not found:", email);
      return res.json({ isPremium: false });
    }
    
    // Check if premium is expired
    const now = new Date();
    const isExpired = user.expiryDate && new Date(user.expiryDate) < now;
    
    if (isExpired) {
      console.log("⏰ Premium expired for:", email);
      
      // Update database to mark as expired
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
    
    console.log("✅ Premium active for:", email, "Expires:", user.expiryDate);
    
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

// ✅ GET ALL PREMIUM USERS (Admin Only)
app.get("/admin/users", async (req, res) => {
  try {
    const users = await usersCollection.find({ isPremium: true }).toArray();
    res.json({ 
      total: users.length,
      users: users 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
      partnerGender: "random",
      isPremium: false,
      isGuest: true
    };

    // 🔥 SERVER-SIDE PREMIUM VALIDATION
    // Only allow non-random gender filters if user has premium
    if (userInfo.partnerGender !== 'random') {
      // Check if it's a guest
      if (userInfo.isGuest || !userInfo.email || userInfo.email.startsWith('guest_')) {
        console.log("⚠️ Guest attempted gender filter:", socket.id);
        socket.userInfo.partnerGender = 'random'; // Force random
        socket.emit('premium_required', { 
          message: 'Gender filters require Google login & Premium subscription' 
        });
      } 
      // Check if user has valid premium status
      else if (!userInfo.isPremium) {
        // Double-check with database
        try {
          const user = await usersCollection.findOne({ email: userInfo.email });
          
          if (!user || !user.isPremium) {
            console.log("⚠️ Non-premium user attempted gender filter:", userInfo.email);
            socket.userInfo.partnerGender = 'random'; // Force random
            socket.emit('premium_required', { 
              message: 'Premium subscription required for Male/Female filters' 
            });
          } else {
            console.log("✅ Premium validated for:", userInfo.email);
          }
        } catch (err) {
          console.error("❌ Database check failed:", err);
          socket.userInfo.partnerGender = 'random';
        }
      } else {
        console.log("✅ Premium user using gender filter:", userInfo.email);
      }
    }

    // Remove from queue if already waiting
    queue = queue.filter((s) => s.id !== socket.id);

    // Try to find a match
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
        country: partner.userInfo.country, 
        nickname: partner.userInfo.nickname 
      });
      
      partner.emit("chat_start", { 
        room, 
        country: socket.userInfo.country, 
        nickname: socket.userInfo.nickname 
      });
      
      console.log("✅ Match found:", socket.id, "↔", partner.id);
      console.log("   User 1:", socket.userInfo.email || 'guest', "(", socket.userInfo.partnerGender, ")");
      console.log("   User 2:", partner.userInfo.email || 'guest', "(", partner.userInfo.partnerGender, ")");
    } else {
      queue.push(socket);
      socket.emit("waiting");
      console.log("⏳ User waiting:", socket.id, "(", socket.userInfo.partnerGender, ")");
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
  console.log('🛑 Shutting down gracefully...');
  await client.close();
  process.exit(0);
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
  console.log("🔑 Razorpay Key ID:", process.env.RAZORPAY_KEY_ID ? "Set ✅" : "Missing ❌");
  console.log("🔒 Razorpay Secret:", process.env.RAZORPAY_KEY_SECRET ? "Set ✅" : "Missing ❌");
  console.log("🗄️  MongoDB:", MONGO_URI ? "Configured ✅" : "Missing ❌");
});
