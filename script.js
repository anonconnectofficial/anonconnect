import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-auth.js";

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyBAcMFyEYqptJpoZiNqF67gGrqXXwiEFH0",
  authDomain: "anonconnect-14b47.firebaseapp.com",
  projectId: "anonconnect-14b47",
  storageBucket: "anonconnect-14b47.firebasestorage.app",
  messagingSenderId: "850807807314",
  appId: "1:850807807314:web:95a2cd8451e017b11b2e8b",
  measurementId: "G-HJNS7HTRWN"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// --- SERVER URL ---
const BACKEND_URL = "https://anonconnect-mnr4.onrender.com"; 
const socket = io(BACKEND_URL);

// --- DOM ELEMENTS ---
const navLinks = { 
    home: document.getElementById('nav-home'), 
    blog: document.getElementById('nav-blog'), 
    about: document.getElementById('nav-about'), 
    support: document.getElementById('nav-support') 
};
const homeFlowContainer = document.getElementById('home-flow-container');
const pageBlog = document.getElementById('page-blog');
const pageAbout = document.getElementById('page-about');
const pageSupport = document.getElementById('page-support');
const pageChat = document.getElementById('page-chat');
const waitingScreen = document.getElementById('waiting-screen');
const chatScreen = document.getElementById('chat-screen');
const messagesDiv = document.getElementById('messages');
const statusText = document.getElementById('status-text');
const nicknameInput = document.getElementById('nickname-input');
const msgInput = document.getElementById('msg-input');
const btnMale = document.getElementById('btn-male');
const btnFemale = document.getElementById('btn-female');
const btnRandom = document.getElementById('btn-random');
const premiumStatusBadge = document.getElementById('premium-status-badge');
const overlay = document.getElementById('premium-overlay');
const modalLogin = document.getElementById('modal-login');
const modalPricing = document.getElementById('modal-pricing');
const notifSound = document.getElementById('notif-sound');

let currentRoom = null;
let typingTimeout = null;
let myCountryFlag = "🌐";
let isPremium = false;
let selectedPartnerGender = 'random';
let myGender = 'male';
let userEmail = null;
let isMuted = false;

// ============================================
// 🔥 AUTO-LOGIN CHECK (NEW FEATURE)
// ============================================

// Check if user is already logged in when page loads
onAuthStateChanged(auth, (user) => {
    if (user) {
        userEmail = user.email;
        console.log("🔐 User already logged in:", userEmail);
        
        // Automatically check premium status from database
        checkDatabaseStatus(userEmail);
    } else {
        console.log("👤 No user logged in");
    }
});

// --- BAD WORD FILTER ---
const badWords = ["fuck", "sex", "porn", "dick", "pussy", "nude", "horny", "bitch", "randi", "chut", "lund"];
function filterMessage(text) {
    let cleanText = text;
    badWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        cleanText = cleanText.replace(regex, "***");
    });
    return cleanText;
}

// --- BLOG LOGIC ---
const blogPosts = [
    {
        title: "5 Tips to Stay Safe",
        desc: "Learn how to protect your identity.",
        date: "Today",
        color: "linear-gradient(45deg, #ff9a9e 0%, #fad0c4 99%)",
        content: `<h2>Safety First!</h2><p>Never share your phone number or click on suspicious links.</p>`
    },
    {
        title: "Why Anonymous Chat is Viral?",
        desc: "The psychology behind talking to strangers.",
        date: "Yesterday",
        color: "linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)",
        content: `<h2>The Thrill</h2><p>Spontaneity is key. You never know who you will meet next.</p>`
    }
];

function renderBlogs() {
    const grid = document.getElementById('blog-grid');
    if(!grid) return;
    grid.innerHTML = '';
    blogPosts.forEach((post, index) => {
        grid.innerHTML += `
            <div class="blog-card-new" onclick="window.openBlogPost(${index})">
                <div class="blog-cover" style="background: ${post.color};"></div>
                <div class="blog-info">
                    <span class="blog-date">${post.date}</span>
                    <h3>${post.title}</h3>
                    <p>${post.desc}</p>
                    <div class="read-more">Read Article ➝</div>
                </div>
            </div>`;
    });
}

window.openBlogPost = function(index) {
    document.getElementById('full-blog-content').innerHTML = blogPosts[index].content;
    document.getElementById('blog-grid-view').classList.add('hidden');
    document.getElementById('blog-full-view').classList.remove('hidden');
}

if(document.getElementById('back-to-blog')) {
    document.getElementById('back-to-blog').addEventListener('click', () => {
        document.getElementById('blog-full-view').classList.add('hidden');
        document.getElementById('blog-grid-view').classList.remove('hidden');
    });
}

// ============================================
// 🔥 DATABASE & PAYMENT LOGIC
// ============================================

// Check Premium Status from Database
async function checkDatabaseStatus(email) {
    try {
        console.log("🔍 Checking premium status for:", email);
        const res = await fetch(`${BACKEND_URL}/check-status`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ email: email })
        });
        
        if (!res.ok) {
            console.error("❌ Status check failed:", res.status);
            return;
        }
        
        const data = await res.json();
        console.log("📊 Status response:", data);
        
        if (data.isPremium) { 
            isPremium = true; 
            updatePremiumUI();
            
            // Show expiry info
            if (data.daysRemaining) {
                console.log(`✅ PREMIUM ACTIVE - ${data.daysRemaining} days remaining`);
                premiumStatusBadge.title = `Premium expires in ${data.daysRemaining} days`;
            }
        } else if (data.expired) {
            console.log("⏰ Premium expired on:", data.expiryDate);
            showExpiryNotification();
        }
    } catch(e) { 
        console.error("❌ DB Check Failed:", e); 
    }
}

function updatePremiumUI() {
    premiumStatusBadge.innerText = "Status: PREMIUM 👑";
    premiumStatusBadge.style.color = "#00f2ea";
    premiumStatusBadge.style.fontWeight = "bold";
    
    // Unlock gender filters
    const maleLock = document.querySelector('#btn-male i.fa-lock');
    const femaleLock = document.querySelector('#btn-female i.fa-lock');
    if(maleLock) maleLock.style.display = 'none';
    if(femaleLock) femaleLock.style.display = 'none';
    
    console.log("✨ Premium UI unlocked!");
}

function showExpiryNotification() {
    premiumStatusBadge.innerText = "Status: EXPIRED ⏰";
    premiumStatusBadge.style.color = "#ff4757";
    
    // Optional: Show renewal popup
    // alert("Your premium subscription has expired. Renew now!");
}

// Google Login Handler
document.getElementById('btn-google-login').addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then((result) => {
            userEmail = result.user.email;
            console.log("✅ Logged in as:", userEmail);
            
            checkDatabaseStatus(userEmail);
            modalLogin.classList.add('hidden'); 
            modalPricing.classList.remove('hidden');
        })
        .catch((error) => {
            console.error("❌ Login Error:", error);
            alert("Login Failed: " + error.message);
        });
});

// ✅ PAYMENT FUNCTION
window.initiatePayment = async function(plan, amount) {
    if(!userEmail) { 
        alert("Please Login First"); 
        return; 
    }
    
    try {
        console.log("🔄 Creating order for ₹" + amount);
        
        // Step 1: Create Order
        const orderResponse = await fetch(`${BACKEND_URL}/create-order`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ amount: amount })
        });
        
        if (!orderResponse.ok) {
            throw new Error("Failed to create order. Status: " + orderResponse.status);
        }
        
        const order = await orderResponse.json();
        console.log("✅ Order created:", order);
        
        // Step 2: Open Razorpay Checkout
        const options = {
            "key": "rzp_test_S1af2JV9L5Vlw5",
            "amount": order.amount, 
            "currency": "INR", 
            "name": "AnonConnect Premium", 
            "description": `${plan} Plan - 1 Month Access`,
            "order_id": order.id,
            "handler": async function (response) {
                console.log("💳 Payment Response:", response);
                
                // Step 3: Verify Payment Signature
                try {
                    console.log("🔐 Verifying payment...");
                    
                    const verifyResponse = await fetch(`${BACKEND_URL}/verify-payment`, {
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: userEmail,
                            plan: plan,
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature
                        })
                    });
                    
                    if (!verifyResponse.ok) {
                        throw new Error("Verification failed. Status: " + verifyResponse.status);
                    }
                    
                    const verifyData = await verifyResponse.json();
                    console.log("📦 Verification response:", verifyData);
                    
                    if (verifyData.success) {
                        console.log("✅ Payment Verified & Saved to Database!");
                        alert(`🎉 Payment Successful!\n\nYou now have PREMIUM access for 1 month!\nExpires: ${new Date(verifyData.expiryDate).toLocaleDateString()}`);
                        
                        isPremium = true; 
                        updatePremiumUI(); 
                        closePremiumModal();
                    } else {
                        console.error("❌ Payment verification failed");
                        alert("Payment verification failed. Please contact support.");
                    }
                    
                } catch(verifyError) {
                    console.error("❌ Verification Error:", verifyError);
                    alert("Payment verification error: " + verifyError.message);
                }
            },
            "prefill": {
                "email": userEmail
            },
            "theme": { 
                "color": "#00f2ea" 
            },
            "modal": {
                "ondismiss": function() {
                    console.log("⚠️ Payment popup closed by user");
                }
            }
        };
        
        const rzp = new Razorpay(options);
        
        rzp.on('payment.failed', function (response) {
            console.error("❌ Payment Failed:", response.error);
            alert("Payment Failed: " + response.error.description);
        });
        
        rzp.open();
        
    } catch(error) {
        console.error("❌ Payment Error:", error);
        alert("Payment Error: " + error.message);
    }
}

// ============================================
// UI & NAVIGATION
// ============================================

window.setMyGender = function(gender) {
    myGender = gender;
    document.getElementById('iam-male').classList.remove('active');
    document.getElementById('iam-female').classList.remove('active');
    document.getElementById('iam-' + gender).classList.add('active');
}

btnRandom.addEventListener('click', () => selectPartner('random', btnRandom));
btnMale.addEventListener('click', () => checkPremium('male', btnMale));
btnFemale.addEventListener('click', () => checkPremium('female', btnFemale));

function selectPartner(type, btn) {
    selectedPartnerGender = type;
    document.querySelectorAll('.gender-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function checkPremium(type, btn) {
    if(isPremium) {
        selectPartner(type, btn);
    } else { 
        overlay.classList.remove('hidden'); 
        modalLogin.classList.remove('hidden'); 
        modalPricing.classList.add('hidden'); 
    }
}

window.closePremiumModal = function() { 
    overlay.classList.add('hidden'); 
}

// NAV
function hideAllPages() { 
    homeFlowContainer.classList.add('hidden'); 
    pageBlog.classList.add('hidden'); 
    pageAbout.classList.add('hidden'); 
    pageSupport.classList.add('hidden'); 
    pageChat.classList.add('hidden'); 
}

navLinks.home.addEventListener('click', () => { hideAllPages(); homeFlowContainer.classList.remove('hidden'); });
navLinks.blog.addEventListener('click', () => { hideAllPages(); pageBlog.classList.remove('hidden'); renderBlogs(); });
navLinks.about.addEventListener('click', () => { hideAllPages(); pageAbout.classList.remove('hidden'); });
navLinks.support.addEventListener('click', () => { hideAllPages(); pageSupport.classList.remove('hidden'); });

const btnSafetyContinue = document.getElementById('btn-safety-continue');
const checks = [document.getElementById('check-age'), document.getElementById('check-rules'), document.getElementById('check-terms')];
if(checks[0]) checks.forEach(check => check.addEventListener('change', () => btnSafetyContinue.disabled = !(checks[0].checked && checks[1].checked && checks[2].checked)));

btnSafetyContinue.addEventListener('click', () => { document.getElementById('step-safety').classList.add('hidden'); document.getElementById('step-landing').classList.remove('hidden'); });
document.getElementById('btn-lets-chat').addEventListener('click', () => { document.getElementById('step-landing').classList.add('hidden'); document.getElementById('step-prefs').classList.remove('hidden'); });
document.getElementById('btn-start-final').addEventListener('click', () => {
    homeFlowContainer.classList.add('hidden');
    document.getElementById('main-nav').classList.add('hidden'); 
    pageChat.classList.remove('hidden'); 
    waitingScreen.classList.remove('hidden'); 
    chatScreen.classList.add('hidden'); 
    findPartner();
});

// Country Flag Fetch
fetch('https://ipwho.is/')
    .then(res => res.json())
    .then(data => {
        if (data.country_code) {
            const codePoints = data.country_code.toUpperCase().split('').map(char => 127397 + char.charCodeAt());
            myCountryFlag = String.fromCodePoint(...codePoints);
        }
    })
    .catch(e => {
        console.log("Flag fetch failed, using default.");
        myCountryFlag = "🌐"; 
    });

// Mute & Report
const muteBtn = document.getElementById('mute-btn');
const reportBtn = document.getElementById('report-btn');
if(muteBtn) {
    muteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        muteBtn.innerHTML = isMuted ? "🔇" : "🔊";
        muteBtn.style.color = isMuted ? "#ff4757" : "#aaa";
    });
}
if(reportBtn) {
    reportBtn.addEventListener('click', () => {
        if(!currentRoom) return alert("Not connected!");
        if(confirm("Report this user?")) {
            alert("Reported."); 
            socket.emit('skip_chat', currentRoom);
            messagesDiv.innerHTML = ''; 
            findPartner();
        }
    });
}

function playNotif() { 
    if (!isMuted && notifSound) notifSound.play().catch(e=>{}); 
}

// Message handling
document.getElementById('emoji-btn').addEventListener('click', () => document.getElementById('emoji-picker').classList.toggle('hidden'));
document.querySelectorAll('#emoji-picker span').forEach(span => span.addEventListener('click', () => { msgInput.value += span.innerText; msgInput.focus(); }));
msgInput.addEventListener('input', () => { 
    if(currentRoom) { 
        socket.emit('typing_start', currentRoom); 
        clearTimeout(typingTimeout); 
        typingTimeout = setTimeout(() => socket.emit('typing_stop', currentRoom), 1000); 
    }
});

document.getElementById('send-btn').addEventListener('click', sendMessage);
msgInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendMessage(); });
document.getElementById('back-home-btn').addEventListener('click', () => { 
    if(currentRoom) socket.emit('skip_chat', currentRoom); 
    location.reload(); 
});

document.getElementById('skip-btn').addEventListener('click', () => { 
    if(currentRoom) { 
        socket.emit('skip_chat', currentRoom); 
        currentRoom = null; 
    } 
    messagesDiv.innerHTML = ''; 
    waitingScreen.classList.remove('hidden'); 
    chatScreen.classList.add('hidden'); 
    statusText.innerText = "🔴 Offline"; 
    findPartner(); 
});

function findPartner() {
    statusText.innerText = "🟡 Searching..."; 
    socket.emit('find_partner', { 
        country: myCountryFlag, 
        nickname: nicknameInput.value.trim() || "Stranger", 
        myGender: myGender, 
        partnerGender: selectedPartnerGender, 
        email: userEmail 
    });
}

function sendMessage() {
    const rawMsg = msgInput.value.trim();
    if (rawMsg && currentRoom) { 
        const cleanMsg = filterMessage(rawMsg);
        addMessage(cleanMsg, 'my-msg'); 
        socket.emit('send_message', { room: currentRoom, message: cleanMsg }); 
        msgInput.value = ''; 
        socket.emit('typing_stop', currentRoom); 
        document.getElementById('emoji-picker').classList.add('hidden'); 
    }
}

function addMessage(msg, type) {
    const div = document.createElement('div'); 
    div.classList.add('message', type);
    div.innerHTML = `${msg} <span class="msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
    messagesDiv.appendChild(div); 
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemBlock(country, nickname) {
    const connectDiv = document.createElement('div'); 
    connectDiv.classList.add('sys-connect');
    connectDiv.innerHTML = `<div class="sys-connect-pill">Connected • ${nickname} ${country}</div>`;
    messagesDiv.appendChild(connectDiv);
    
    const safetyDiv = document.createElement('div'); 
    safetyDiv.classList.add('sys-safety-box');
    safetyDiv.innerHTML = `<h4>⚠️ Safety Notice</h4><ul><li>No illegal discussions</li><li>No sexual solicitation</li></ul><div style="font-size:0.8rem; text-align:center;">Chat responsibly.</div>`;
    messagesDiv.appendChild(safetyDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Socket events
socket.on('chat_start', (data) => { 
    currentRoom = data.room; 
    statusText.innerText = "🟢 Connected"; 
    waitingScreen.classList.add('hidden'); 
    chatScreen.classList.remove('hidden'); 
    messagesDiv.innerHTML = ''; 
    addSystemBlock(data.country, data.nickname); 
    playNotif(); 
});

socket.on('receive_message', (msg) => { 
    addMessage(msg, 'stranger-msg'); 
    playNotif(); 
});

socket.on('partner_typing', () => document.getElementById('typing-status').innerText = "Stranger is typing...");
socket.on('partner_stopped_typing', () => document.getElementById('typing-status').innerText = "");

socket.on('partner_left', () => {
    statusText.innerText = "🔴 Partner Left";
    const div = document.createElement('div'); 
    div.classList.add('sys-connect'); 
    div.innerHTML = `<span style="color:#ff4757; font-size:0.8rem;">Disconnected.</span>`;
    messagesDiv.appendChild(div); 
    messagesDiv.scrollTop = messagesDiv.scrollHeight; 
    currentRoom = null;
    
    if(document.getElementById('auto-skip-toggle').checked) {
        setTimeout(() => { 
            if(document.getElementById('auto-skip-toggle').checked) { 
                messagesDiv.innerHTML = ''; 
                findPartner(); 
            }
        }, 1500);
    }
});
