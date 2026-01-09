const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const path = require('path');
const Razorpay = require('razorpay'); // NEW
const bodyParser = require('body-parser'); // NEW

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// --- 🔴 IMPORTANT: APNI RAZORPAY KEYS YAHAN DALO ---
const razorpay = new Razorpay({
    key_id: 'rzp_test_S1af2JV9L5Vlw5', // Razorpay Dashboard se milega
    key_secret: '83lLuGYa0C5UG9UEwtsnNuWk'
});

// SEO Routes
app.get('/robots.txt', (req, res) => { res.type('text/plain'); res.send("User-agent: *\nAllow: /\nSitemap: http://localhost:3000/sitemap.xml"); });
app.get('/sitemap.xml', (req, res) => { res.type('application/xml'); res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://localhost:3000/</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod></url></urlset>`); });

// --- REAL PAYMENT API ---
app.post('/create-order', async (req, res) => {
    try {
        const options = {
            amount: req.body.amount * 100, // Amount in paise (199 * 100)
            currency: "INR",
            receipt: "order_rcptid_" + Date.now()
        };
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        res.status(500).send(error);
    }
});

// --- CHAT LOGIC ---
let queue = []; 

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    socket.lastMsgTime = 0;

    socket.on('find_partner', (userInfo) => { 
        socket.userInfo = userInfo || { country: "🌐", nickname: "Stranger", myGender: "male", partnerGender: "random" };
        queue = queue.filter(s => s.id !== socket.id);

        const matchIndex = queue.findIndex(waitingSocket => {
            const me = socket.userInfo;
            const them = waitingSocket.userInfo;
            const condition1 = (me.partnerGender === 'random') || (me.partnerGender === them.myGender);
            const condition2 = (them.partnerGender === 'random') || (them.partnerGender === me.myGender);
            return condition1 && condition2;
        });

        if (matchIndex > -1) {
            const partner = queue.splice(matchIndex, 1)[0];
            const roomID = socket.id + '#' + partner.id;
            socket.join(roomID); partner.join(roomID);
            io.to(partner.id).emit('chat_start', { room: roomID, country: socket.userInfo.country, nickname: socket.userInfo.nickname, gender: socket.userInfo.myGender });
            io.to(socket.id).emit('chat_start', { room: roomID, country: partner.userInfo.country, nickname: partner.userInfo.nickname, gender: partner.userInfo.myGender });
        } else {
            queue.push(socket);
            socket.emit('waiting');
        }
    });

    socket.on('send_message', (data) => {
        const now = Date.now();
        if (now - socket.lastMsgTime < 800) return;
        socket.lastMsgTime = now;
        socket.to(data.room).emit('receive_message', data.message);
    });

    socket.on('typing_start', (room) => socket.to(room).emit('partner_typing'));
    socket.on('typing_stop', (room) => socket.to(room).emit('partner_stopped_typing'));
    
    socket.on('skip_chat', (roomID) => {
        if(roomID) { socket.to(roomID).emit('partner_left'); socket.leave(roomID); }
        queue = queue.filter(s => s.id !== socket.id);
    });

    socket.on('disconnect', () => { queue = queue.filter(s => s.id !== socket.id); });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running at: http://localhost:3000`));