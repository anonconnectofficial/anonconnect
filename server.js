const express = require("express");
const app = express();
const http = require("http").createServer(app);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const compression = require("compression");
const io = require("socket.io")(http, { 
  cors: { 
    origin: [
      "https://anonconnect-14b47.web.app",
      "https://anonconnect-14b47.firebaseapp.com",
      "https://anonchatrandom.in",
      "https://www.anonchatrandom.in",
      process.env.NODE_ENV === 'development' && "http://localhost:3000",
      process.env.NODE_ENV === 'development' && "http://localhost:5000"
    ].filter(Boolean),
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const { MongoClient, ServerApiVersion } = require('mongodb');

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com", "https://cdn.socket.io", "https://www.gstatic.com", "https://pagead2.googlesyndication.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://anonconnect-mnr4.onrender.com", "wss://anonconnect-mnr4.onrender.com", "https://ipwho.is", "https://identitytoolkit.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "https://assets.mixkit.co"],
      frameSrc: ["'self'", "https://checkout.razorpay.com"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 payment attempts per hour
  message: "Too many payment attempts, please try again later.",
  skipSuccessfulRequests: true
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts, please try again later.",
});

app.use('/api/', apiLimiter);
app.use('/create-order', paymentLimiter);
app.use('/check-status', authLimiter);

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Compression
app.use(compression());

// CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      "https://anonconnect-14b47.web.app",
      "https://anonconnect-14b47.firebaseapp.com",
      "https://anonchatrandom.in",
      "https://www.anonchatrandom.in"
    ];
    
    if (process.env.NODE_ENV === 'development') {
      allowedOrigins.push("http://localhost:3000", "http://localhost:5000");
    }
    
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options("*", cors());
app.use(bodyParser.json({ limit: '10kb' })); // Prevent large payload attacks
app.use(express.static(path.join(__dirname, "public")));

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// ============================================
// MONGODB CONNECTION
// ============================================

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI not set in environment variables!");
}

const client = new MongoClient(MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 10,
  minPoolSize: 2,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
});

let db;
let usersCollection;

async function connectDB() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB!");
    
    db = client.db("anonconnect");
    usersCollection = db.collection("users");
    
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.createIndex({ expiryDate: 1 });
    await usersCollection.createIndex({ isPremium: 1 });
    
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    setTimeout(connectDB, 5000); // Retry connection
  }
}

connectDB();

// ============================================
// RAZORPAY CONFIG
// ============================================

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error("❌ Razorpay credentials not set!");
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// ============================================
// ROUTES
// ============================================

app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send(`User-agent: *
Allow: /
Sitemap: https://anonchatrandom.in/sitemap.xml

User-agent: AdsBot-Google
Allow: /

User-agent: Googlebot-Image
Allow: /`);
});

app.get("/sitemap.xml", (req, res) => {
  res.type("application/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://anonchatrandom.in/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://anonchatrandom.in/#blog</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://anonchatrandom.in/#about</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://anonchatrandom.in/#support</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>`);
});

app.get("/", (req, res) => {
  res.json({ 
    status: "Server is running", 
    timestamp: new Date(),
    database: db ? "Connected" : "Disconnected",
    environment: process.env.NODE_ENV || 'production',
    version: "2.0.0"
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "healthy",
    uptime: process.uptime(),
    database: db ? "connected" : "disconnected",
    memory: process.memoryUsage()
  });
});

// CREATE ORDER
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || typeof amount !== 'number' || amount < 1) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    if (amount > 10000) {
      return res.status(400).json({ error: "Amount exceeds maximum limit" });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "order_" + Date.now(),
      notes: {
        timestamp: new Date().toISOString()
      }
    });

    console.log("✅ Order Created:", order.id);
    res.json(order);
    
  } catch (err) {
    console.error("❌ Create Order Error:", err);
    res.status(500).json({ 
      error: "Order creation failed", 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// VERIFY PAYMENT
app.post("/verify-payment", async (req, res) => {
  try {
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

    const sanitizedEmail = sanitizeInput(email);
    
    if (!sanitizedEmail || !validateEmail(sanitizedEmail)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email address"
      });
    }

    if (sanitizedEmail.startsWith('guest_')) {
      return res.status(400).json({
        success: false,
        error: "Guest accounts cannot purchase premium"
      });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.error("❌ Signature Mismatch");
      return res.status(400).json({ 
        success: false,
        error: "Invalid signature" 
      });
    }

    console.log("✅ Payment Verified for:", sanitizedEmail);
    
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 1);
    
    if (usersCollection) {
      await usersCollection.updateOne(
        { email: sanitizedEmail },
        { 
          $set: { 
            isPremium: true,
            plan: sanitizeInput(plan),
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
    
    const sanitizedEmail = sanitizeInput(email);
    
    if (!sanitizedEmail || !validateEmail(sanitizedEmail)) {
      return res.json({ isPremium: false });
    }

    if (sanitizedEmail.startsWith('guest_')) {
      return res.json({ 
        isPremium: false,
        isGuest: true
      });
    }
    
    if (!usersCollection) {
      return res.json({ isPremium: false });
    }
    
    const user = await usersCollection.findOne({ email: sanitizedEmail });
    
    if (!user) {
      return res.json({ isPremium: false });
    }
    
    const now = new Date();
    const isExpired = user.expiryDate && new Date(user.expiryDate) < now;
    
    if (isExpired && user.isPremium) {
      await usersCollection.updateOne(
        { email: sanitizedEmail },
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
      daysRemaining: user.expiryDate ? Math.ceil((new Date(user.expiryDate) - now) / (1000 * 60 * 60 * 24)) : 0
    });
    
  } catch (err) {
    console.error("❌ Status Check Error:", err);
    res.json({ isPremium: false });
  }
});

// ============================================
// SOCKET.IO CHAT WITH SECURITY
// ============================================

let queue = [];
const activeSockets = new Map();
const MESSAGE_RATE_LIMIT = 500; // ms between messages
const MAX_MESSAGE_LENGTH = 500;

// Bad words filter (enhanced)
const badWords = [
  "fuck", "sex", "porn", "dick", "pussy", "nude", "horny", 
  "bitch", "randi", "chut", "lund", "boobs", "ass", "cock"
];

function filterMessage(text) {
  if (typeof text !== 'string') return '';
  
  let clean = sanitizeInput(text);
  clean = clean.substring(0, MAX_MESSAGE_LENGTH);
  
  badWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    clean = clean.replace(regex, "***");
  });
  
  return clean;
}

io.use((socket, next) => {
  const origin = socket.handshake.headers.origin;
  const allowedOrigins = [
    "https://anonconnect-14b47.web.app",
    "https://anonconnect-14b47.firebaseapp.com",
    "https://anonchatrandom.in",
    "https://www.anonchatrandom.in"
  ];
  
  if (process.env.NODE_ENV === 'development') {
    allowedOrigins.push("http://localhost:3000", "http://localhost:5000");
  }
  
  if (!origin || allowedOrigins.includes(origin)) {
    next();
  } else {
    next(new Error('Origin not allowed'));
  }
});

io.on("connection", (socket) => {
  console.log("🔌 New connection:", socket.id);
  
  socket.lastMsgTime = 0;
  socket.messageCount = 0;
  socket.joinTime = Date.now();
  
  activeSockets.set(socket.id, {
    joinTime: Date.now(),
    messageCount: 0
  });

  socket.on("find_partner", async (userInfo) => {
    try {
      socket.userInfo = {
        nickname: sanitizeInput(userInfo?.nickname || "Stranger").substring(0, 12),
        myGender: ['male', 'female'].includes(userInfo?.myGender) ? userInfo.myGender : 'male',
        partnerGender: ['male', 'female', 'random'].includes(userInfo?.partnerGender) ? userInfo.partnerGender : 'random',
        country: sanitizeInput(userInfo?.country || "🌐"),
        email: sanitizeInput(userInfo?.email),
        isPremium: Boolean(userInfo?.isPremium),
        isGuest: Boolean(userInfo?.isGuest)
      };

      // SERVER-SIDE VALIDATION
      if (socket.userInfo.partnerGender !== 'random') {
        if (socket.userInfo.isGuest || !socket.userInfo.email || socket.userInfo.email.startsWith('guest_')) {
          socket.userInfo.partnerGender = 'random';
          socket.emit('premium_required', { 
            message: 'Gender filters require Google login & Premium' 
          });
        } else if (!socket.userInfo.isPremium && usersCollection) {
          try {
            const user = await usersCollection.findOne({ 
              email: socket.userInfo.email 
            });
            
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

      queue = queue.filter((s) => s.connected && s.id !== socket.id);

      const matchIndex = queue.findIndex((waiting) => {
        if (!waiting.connected || !waiting.userInfo) return false;
        
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
        
        socket.currentRoom = room;
        partner.currentRoom = room;
        
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
        
        console.log("✅ Match:", socket.id, "↔", partner.id);
      } else {
        queue.push(socket);
        socket.emit("waiting");
      }
    } catch (err) {
      console.error("❌ Find Partner Error:", err);
    }
  });

  socket.on("send_message", (data) => {
    try {
      const now = Date.now();
      
      if (now - socket.lastMsgTime < MESSAGE_RATE_LIMIT) {
        return; // Rate limit
      }
      
      socket.lastMsgTime = now;
      socket.messageCount++;
      
      if (socket.messageCount > 100) {
        socket.disconnect();
        return;
      }
      
      if (!data?.room || !data?.message) return;
      
      const cleanMessage = filterMessage(data.message);
      
      if (cleanMessage.length === 0) return;
      
      socket.to(data.room).emit("receive_message", cleanMessage);
    } catch (err) {
      console.error("❌ Send Message Error:", err);
    }
  });

  socket.on("typing_start", (room) => {
    if (room) socket.to(room).emit("partner_typing");
  });
  
  socket.on("typing_stop", (room) => {
    if (room) socket.to(room).emit("partner_stopped_typing");
  });

  socket.on("skip_chat", (room) => {
    try {
      if (room) {
        socket.to(room).emit("partner_left");
        socket.leave(room);
      }
      queue = queue.filter((s) => s.id !== socket.id);
    } catch (err) {
      console.error("❌ Skip Error:", err);
    }
  });

  socket.on("disconnect", () => {
    try {
      queue = queue.filter((s) => s.id !== socket.id);
      activeSockets.delete(socket.id);
      
      if (socket.currentRoom) {
        socket.to(socket.currentRoom).emit("partner_left");
      }
      
      console.log("❌ Disconnected:", socket.id);
    } catch (err) {
      console.error("❌ Disconnect Error:", err);
    }
  });
});

// Cleanup inactive sockets every 5 minutes
setInterval(() => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes
  
  activeSockets.forEach((data, socketId) => {
    if (now - data.joinTime > timeout) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect();
      }
      activeSockets.delete(socketId);
    }
  });
}, 5 * 60 * 1000);

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
  console.error("❌ Error:", err);
  res.status(err.status || 500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  console.log('🛑 Shutting down gracefully...');
  
  try {
    // Stop accepting new connections
    http.close(() => {
      console.log('✅ HTTP server closed');
    });
    
    // Close database connection
    if (client) {
      await client.close();
      console.log('✅ MongoDB connection closed');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
}

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
  console.log("🔑 Razorpay:", process.env.RAZORPAY_KEY_ID ? "Set ✅" : "Not Set ⚠️");
  console.log("🗄️  MongoDB:", db ? "Connected ✅" : "Not Connected ⚠️");
  console.log("🌍 Environment:", process.env.NODE_ENV || 'production');
  console.log("🔒 Security: Helmet, Rate Limiting, XSS Protection Enabled");
});
