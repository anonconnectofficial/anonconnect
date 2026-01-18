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
let paymentsCollection;

async function connectDB() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB!");
    
    db = client.db("anonconnect");
    usersCollection = db.collection("users");
    paymentsCollection = db.collection("payments");
    
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await paymentsCollection.createIndex({ transactionId: 1 }, { unique: true });
    
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
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
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, "public")));

// ============================================
// BASIC ROUTES
// ============================================

app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send("User-agent: *\nAllow: /");
});

app.get("/", (req, res) => {
  res.json({ 
    status: "Server is running", 
    timestamp: new Date(),
    database: db ? "Connected" : "Disconnected",
    paymentSystem: "WhatsApp UPI Verification"
  });
});

// ============================================
// 🔥 WHATSAPP-ONLY PAYMENT ROUTES
// ============================================

// Submit payment proof
app.post("/submit-payment", async (req, res) => {
  try {
    const { email, transactionId, plan, amount, screenshot } = req.body;
    
    console.log("💳 Payment submission:");
    console.log("Email:", email);
    console.log("Transaction ID:", transactionId);
    console.log("Plan:", plan);
    console.log("Amount:", amount);
    
    if (!email || email.startsWith('guest_')) {
      return res.status(400).json({ 
        success: false,
        error: "Login with Google required" 
      });
    }

    if (!transactionId || !plan || !amount) {
      return res.status(400).json({ 
        success: false,
        error: "Missing required fields" 
      });
    }

    // Store in database
    if (paymentsCollection) {
      try {
        await paymentsCollection.insertOne({
          email: email,
          transactionId: transactionId,
          plan: plan,
          amount: amount,
          screenshot: screenshot,
          status: 'pending',
          submittedAt: new Date()
        });
        
        console.log("✅ Payment stored");
      } catch (dbError) {
        if (dbError.code === 11000) {
          return res.status(400).json({
            success: false,
            error: "Transaction ID already submitted"
          });
        }
        throw dbError;
      }
    }
    
    res.json({ 
      success: true,
      message: "Payment submitted! Check WhatsApp." 
    });

  } catch (err) {
    console.error("❌ Submit Error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// ============================================
// 🔥 WHATSAPP COMMAND API - Activate Premium
// ============================================

// Endpoint to activate premium (you'll call this via WhatsApp bot or manually via URL)
app.post("/activate-premium", async (req, res) => {
  try {
    const { transactionId, secret } = req.body;
    
    // 🔒 SECRET KEY - CHANGE THIS!
    const SECRET_KEY = "my_whatsapp_secret_2026";
    
    if (secret !== SECRET_KEY) {
      return res.status(403).json({ 
        success: false,
        error: "Unauthorized" 
      });
    }

    if (!transactionId) {
      return res.status(400).json({ 
        success: false,
        error: "Transaction ID required" 
      });
    }

    if (!paymentsCollection || !usersCollection) {
      return res.status(500).json({ 
        success: false,
        error: "Database not connected" 
      });
    }

    // Find payment
    const payment = await paymentsCollection.findOne({ 
      transactionId: transactionId 
    });

    if (!payment) {
      return res.status(404).json({ 
        success: false,
        error: "Payment not found with this Transaction ID" 
      });
    }

    if (payment.status === 'verified') {
      return res.json({ 
        success: true,
        message: "Already activated",
        email: payment.email 
      });
    }

    // Activate premium - 30 days
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 1);
    
    await usersCollection.updateOne(
      { email: payment.email },
      { 
        $set: { 
          isPremium: true,
          plan: payment.plan,
          transactionId: transactionId,
          purchaseDate: new Date(),
          expiryDate: expiryDate,
          lastUpdated: new Date()
        }
      },
      { upsert: true }
    );

    // Mark as verified
    await paymentsCollection.updateOne(
      { transactionId: transactionId },
      { 
        $set: { 
          status: 'verified',
          verifiedAt: new Date()
        }
      }
    );

    console.log(`✅ PREMIUM ACTIVATED: ${payment.email}`);
    
    res.json({ 
      success: true,
      message: "Premium activated!",
      email: payment.email,
      plan: payment.plan,
      expiryDate: expiryDate
    });

  } catch (err) {
    console.error("❌ Activation Error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// Check premium status
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

// ============================================
// 📱 SIMPLE ACTIVATION PAGE (For WhatsApp)
// ============================================

app.get("/activate", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Activate Premium</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: system-ui; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          padding: 40px;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 { color: #667eea; margin-bottom: 30px; text-align: center; }
        input {
          width: 100%;
          padding: 15px;
          border: 2px solid #e0e0e0;
          border-radius: 10px;
          font-size: 1rem;
          margin-bottom: 20px;
          transition: all 0.3s;
        }
        input:focus {
          outline: none;
          border-color: #667eea;
        }
        button {
          width: 100%;
          padding: 15px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 1.1rem;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s;
        }
        button:hover {
          transform: translateY(-2px);
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .result {
          margin-top: 20px;
          padding: 15px;
          border-radius: 10px;
          text-align: center;
          font-weight: bold;
          display: none;
        }
        .success { background: #d4edda; color: #155724; display: block; }
        .error { background: #f8d7da; color: #721c24; display: block; }
        .info {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 10px;
          margin-top: 20px;
          font-size: 0.85rem;
          color: #666;
          line-height: 1.6;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>👑 Activate Premium</h1>
        
        <input 
          type="text" 
          id="txnId" 
          placeholder="Enter Transaction ID"
          autocomplete="off"
        >
        
        <input 
          type="password" 
          id="secret" 
          placeholder="Enter Secret Key"
          value="my_whatsapp_secret_2026"
          style="display:none"
        >
        
        <button onclick="activate()">Activate Premium</button>
        
        <div id="result" class="result"></div>
        
        <div class="info">
          <strong>📌 Instructions:</strong><br>
          1. Verify payment in your UPI app<br>
          2. Enter the Transaction ID above<br>
          3. Click "Activate Premium"<br>
          4. User will get premium instantly!
        </div>
      </div>
      
      <script>
        async function activate() {
          const txnId = document.getElementById('txnId').value.trim();
          const secret = document.getElementById('secret').value;
          const resultDiv = document.getElementById('result');
          
          if (!txnId) {
            resultDiv.className = 'result error';
            resultDiv.textContent = '⚠️ Please enter Transaction ID';
            return;
          }
          
          const btn = document.querySelector('button');
          btn.disabled = true;
          btn.textContent = 'Processing...';
          
          try {
            const res = await fetch('/activate-premium', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transactionId: txnId, secret: secret })
            });
            
            const data = await res.json();
            
            if (data.success) {
              resultDiv.className = 'result success';
              resultDiv.innerHTML = '✅ Premium Activated!<br>Email: ' + data.email;
              document.getElementById('txnId').value = '';
            } else {
              resultDiv.className = 'result error';
              resultDiv.textContent = '❌ ' + data.error;
            }
            
          } catch (err) {
            resultDiv.className = 'result error';
            resultDiv.textContent = '❌ Error: ' + err.message;
          }
          
          btn.disabled = false;
          btn.textContent = 'Activate Premium';
        }
        
        document.getElementById('txnId').addEventListener('keypress', (e) => {
          if (e.key === 'Enter') activate();
        });
      </script>
    </body>
    </html>
  `);
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

    if (userInfo.partnerGender !== 'random') {
      if (userInfo.isGuest || !userInfo.email || userInfo.email.startsWith('guest_')) {
        socket.userInfo.partnerGender = 'random';
        socket.emit('premium_required', { message: 'Gender filters require Google login & Premium' });
      } else if (!userInfo.isPremium && usersCollection) {
        try {
          const user = await usersCollection.findOne({ email: userInfo.email });
          
          if (!user || !user.isPremium) {
            socket.userInfo.partnerGender = 'random';
            socket.emit('premium_required', { message: 'Premium subscription required for filters' });
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
  console.log("💳 Payment: WhatsApp UPI Verification");
  console.log("🗄️  MongoDB:", db ? "Connected ✅" : "Not Connected ⚠️");
  console.log("📱 Activation Page: /activate");
  console.log("🔐 Secret Key: my_whatsapp_secret_2026");
});
