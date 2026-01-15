import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-auth.js";

// FIREBASE CONFIG
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

// SERVER URL - CHANGE THIS if running locally
const BACKEND_URL = "https://api.render.com/deploy/srv-d5gj1mnpm1nc73e85ui0?key=kuVHs9_3z0E";
// For local testing use: const BACKEND_URL = "http://localhost:3000";

const socket = io(BACKEND_URL);

// STATE VARIABLES
let currentRoom = null;
let typingTimeout = null;
let myCountryFlag = "🌐";
let isPremium = false;
let selectedPartnerGender = 'random';
let myGender = 'male';
let userEmail = null;
let isGuest = false;
let isMuted = false;

// DOM ELEMENTS - With null checks
const getEl = (id) => document.getElementById(id);

const stepRegister = getEl('step-register');
const homeFlowContainer = getEl('home-flow-container');
const pageBlog = getEl('page-blog');
const pageAbout = getEl('page-about');
const pageSupport = getEl('page-support');
const pageChat = getEl('page-chat');
const waitingScreen = getEl('waiting-screen');
const chatScreen = getEl('chat-screen');
const messagesDiv = getEl('messages');
const statusText = getEl('status-text');
const nicknameInput = getEl('nickname-input');
const msgInput = getEl('msg-input');
const premiumStatusBadge = getEl('premium-status-badge');
const overlay = getEl('premium-overlay');
const modalPricing = getEl('modal-pricing');
const notifSound = getEl('notif-sound');

// Registration elements
const btnRegisterGoogle = getEl('btn-register-google');
const btnRegisterAnonymous = getEl('btn-register-anonymous');
const btnContinueToSafety = getEl('btn-continue-to-safety');
const userStatusCard = getEl('user-status-card');
const loginOptions = getEl('login-options');
const loggedUserEmail = getEl('logged-user-email');
const loggedUserStatus = getEl('logged-user-status');
const prefUserEmail = getEl('pref-user-email');
const prefUserStatus = getEl('pref-user-status');

// Gender buttons
const btnMale = getEl('btn-male');
const btnFemale = getEl('btn-female');
const btnRandom = getEl('btn-random');
const btnIamMale = getEl('iam-male');
const btnIamFemale = getEl('iam-female');

// ============================================
// REGISTRATION LOGIC
// ============================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        userEmail = user.email;
        isGuest = false;
        console.log("✅ Auto-logged in:", userEmail);
        updateRegistrationUI(userEmail, false);
        checkDatabaseStatus(userEmail);
    }
});

if (btnRegisterGoogle) {
    btnRegisterGoogle.addEventListener('click', () => {
        signInWithPopup(auth, provider)
            .then((result) => {
                userEmail = result.user.email;
                isGuest = false;
                console.log("✅ Google Login:", userEmail);
                updateRegistrationUI(userEmail, false);
                checkDatabaseStatus(userEmail);
            })
            .catch((error) => {
                console.error("❌ Login Error:", error);
                alert("Login Failed: " + error.message);
            });
    });
}

if (btnRegisterAnonymous) {
    btnRegisterAnonymous.addEventListener('click', () => {
        userEmail = 'guest_' + Date.now() + '@anon.local';
        isGuest = true;
        isPremium = false;
        console.log("👻 Guest login");
        updateRegistrationUI(userEmail, true);
    });
}

if (btnContinueToSafety) {
    btnContinueToSafety.addEventListener('click', () => {
        if (stepRegister) stepRegister.classList.add('hidden');
        if (homeFlowContainer) homeFlowContainer.classList.remove('hidden');
        updatePreferencesUI();
    });
}

function updateRegistrationUI(email, isGuestMode) {
    if (loginOptions) loginOptions.classList.add('hidden');
    if (userStatusCard) userStatusCard.classList.remove('hidden');
    if (btnContinueToSafety) btnContinueToSafety.classList.remove('hidden');
    
    if (loggedUserEmail) {
        loggedUserEmail.textContent = isGuestMode ? 'Guest Mode' : email;
    }
    
    if (loggedUserStatus) {
        if (isGuestMode) {
            loggedUserStatus.innerHTML = '🎭 Random Chat Only';
            loggedUserStatus.style.color = '#ff9f43';
        } else {
            loggedUserStatus.innerHTML = '⏳ Checking status...';
            loggedUserStatus.style.color = '#888';
        }
    }
}

function updatePreferencesUI() {
    if (prefUserEmail) {
        prefUserEmail.textContent = isGuest ? 'Guest Mode' : (userEmail || 'Anonymous');
    }
    if (prefUserStatus) {
        prefUserStatus.textContent = isGuest ? 'Limited features' : (isPremium ? 'Premium 👑' : 'Free');
    }
    if (premiumStatusBadge) {
        premiumStatusBadge.innerText = isGuest ? "Guest 🎭" : "Free";
        premiumStatusBadge.style.color = isGuest ? "#ff9f43" : "#ffd700";
    }
}

// ============================================
// DATABASE & PAYMENT
// ============================================

async function checkDatabaseStatus(email) {
    try {
        const res = await fetch(`${BACKEND_URL}/check-status`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ email })
        });
        
        const data = await res.json();
        
        if (data.isPremium) { 
            isPremium = true; 
            updatePremiumUI();
            
            if (loggedUserStatus) {
                loggedUserStatus.innerHTML = `✅ Premium • ${data.daysRemaining} days`;
                loggedUserStatus.style.color = '#00f2ea';
            }
        } else {
            if (loggedUserStatus) {
                loggedUserStatus.innerHTML = '💎 Free • Upgrade available';
                loggedUserStatus.style.color = '#888';
            }
        }
    } catch(e) { 
        console.error("❌ Status check failed:", e);
    }
}

function updatePremiumUI() {
    if (premiumStatusBadge) {
        premiumStatusBadge.innerText = "PREMIUM 👑";
        premiumStatusBadge.style.color = "#00f2ea";
    }
    
    document.querySelectorAll('.premium-lock').forEach(lock => {
        lock.style.display = 'none';
    });
}

window.initiatePayment = async function(plan, amount) {
    if (!userEmail || isGuest) { 
        alert("Please login with Google to purchase!"); 
        return; 
    }
    
    try {
        const orderResponse = await fetch(`${BACKEND_URL}/create-order`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ amount })
        });
        
        const order = await orderResponse.json();
        
        const options = {
            "key": "rzp_test_S1af2JV9L5Vlw5",
            "amount": order.amount, 
            "currency": "INR", 
            "name": "AnonConnect Premium", 
            "description": `${plan} - 1 Month`,
            "order_id": order.id,
            "handler": async function (response) {
                const verifyResponse = await fetch(`${BACKEND_URL}/verify-payment`, {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: userEmail,
                        plan,
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature
                    })
                });
                
                const verifyData = await verifyResponse.json();
                
                if (verifyData.success) {
                    alert('🎉 Payment Successful! Premium activated!');
                    isPremium = true; 
                    updatePremiumUI();
                    closePremiumModal();
                }
            },
            "prefill": { "email": userEmail },
            "theme": { "color": "#00f2ea" }
        };
        
        const rzp = new Razorpay(options);
        rzp.open();
        
    } catch(error) {
        console.error("❌ Payment Error:", error);
        alert("Payment Error: " + error.message);
    }
}

// ============================================
// GENDER SELECTION
// ============================================

window.setMyGender = function(gender) {
    myGender = gender;
    if (btnIamMale) btnIamMale.classList.remove('active');
    if (btnIamFemale) btnIamFemale.classList.remove('active');
    const activeBtn = getEl('iam-' + gender);
    if (activeBtn) activeBtn.classList.add('active');
}

// Add click handlers with null checks
if (btnIamMale) btnIamMale.addEventListener('click', () => setMyGender('male'));
if (btnIamFemale) btnIamFemale.addEventListener('click', () => setMyGender('female'));

if (btnRandom) btnRandom.addEventListener('click', () => selectPartner('random', btnRandom));
if (btnMale) btnMale.addEventListener('click', () => checkPremiumAccess('male', btnMale));
if (btnFemale) btnFemale.addEventListener('click', () => checkPremiumAccess('female', btnFemale));

function selectPartner(type, btn) {
    selectedPartnerGender = type;
    [btnMale, btnFemale, btnRandom].forEach(b => {
        if (b) b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
}

function checkPremiumAccess(type, btn) {
    if (isGuest) {
        alert('🎭 Guest Mode: Filters locked!\n\nLogin with Google to unlock.');
        return;
    }
    
    if (isPremium) {
        selectPartner(type, btn);
    } else { 
        alert('🔒 Premium Feature\n\nUpgrade to unlock Male/Female filters!');
        if (overlay) overlay.classList.remove('hidden'); 
        if (modalPricing) modalPricing.classList.remove('hidden'); 
    }
}

window.closePremiumModal = function() { 
    if (overlay) overlay.classList.add('hidden'); 
}

// ============================================
// BAD WORD FILTER
// ============================================

const badWords = ["fuck", "sex", "porn", "dick", "pussy", "nude", "horny", "bitch", "randi", "chut", "lund"];
function filterMessage(text) {
    let clean = text;
    badWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        clean = clean.replace(regex, "***");
    });
    return clean;
}

// ============================================
// BLOG LOGIC
// ============================================

const blogPosts = [
    {
        title: "10 Safety Tips for Anonymous Chatting",
        desc: "Essential guidelines to protect yourself while meeting strangers online.",
        date: "Jan 10, 2026",
        color: "linear-gradient(45deg, #ff9a9e 0%, #fad0c4 99%)",
        content: `
            <h2>🛡️ Stay Safe While Chatting with Strangers</h2>
            <p>Anonymous chatting can be fun and exciting, but safety should always come first. Here are 10 essential tips:</p>
            <h3>1. Never Share Personal Information</h3>
            <p>Avoid sharing your full name, phone number, address, school, or workplace with strangers.</p>
            <h3>2. Use a Nickname</h3>
            <p>Always use a pseudonym instead of your real name to maintain anonymity.</p>
            <h3>3. Trust Your Instincts</h3>
            <p>If something feels off, skip the chat immediately. Your safety is more important than any conversation.</p>
            <h3>4. Report Inappropriate Behavior</h3>
            <p>Use our report feature if someone is being abusive, harassing, or sharing inappropriate content.</p>
            <h3>5. Don't Click Suspicious Links</h3>
            <p>Never click on links sent by strangers—they could be phishing attempts or malware.</p>
        `
    },
    {
        title: "Why Anonymous Chat is Going Viral in 2026",
        desc: "The psychology behind the random chat phenomenon and why millions are joining.",
        date: "Jan 8, 2026",
        color: "linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)",
        content: `
            <h2>📈 The Rise of Anonymous Chat Platforms</h2>
            <p>In an era dominated by curated social media profiles, anonymous chat platforms like AnonConnect are experiencing explosive growth. Here's why:</p>
            <h3>Authenticity Over Perfection</h3>
            <p>People are tired of fake Instagram lives. Anonymous chat allows genuine, unfiltered conversations without the pressure of maintaining a perfect image.</p>
            <h3>The Thrill of the Unknown</h3>
            <p>There's something exciting about not knowing who you'll meet next. This element of surprise keeps users coming back.</p>
            <h3>Breaking Social Barriers</h3>
            <p>Anonymity removes social hierarchies, allowing people to connect based purely on personality and conversation—not looks, status, or followers.</p>
        `
    },
    {
        title: "Premium Features: Are They Worth It?",
        desc: "A detailed breakdown of AnonConnect Premium benefits and who should upgrade.",
        date: "Jan 5, 2026",
        color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        content: `
            <h2>👑 Should You Upgrade to Premium?</h2>
            <p>AnonConnect's premium plans offer advanced features for users who want more control over their chat experience.</p>
            <h3>What You Get with Premium</h3>
            <ul>
                <li><strong>Gender Filters:</strong> Choose to chat specifically with males or females instead of random matching.</li>
                <li><strong>Priority Matching:</strong> Get connected faster with shorter wait times.</li>
                <li><strong>Ad-Free Experience:</strong> No interruptions while chatting (Plus Plan).</li>
                <li><strong>Premium Support:</strong> Get help faster with priority customer service.</li>
            </ul>
            <h3>Who Should Upgrade?</h3>
            <p>If you're a frequent user who values having control over who you match with, Premium is definitely worth it. The gender filter alone can save you hours of skipping through random matches.</p>
        `
    }
];

function renderBlogs() {
    const grid = getEl('blog-grid');
    if (!grid) return;
    grid.innerHTML = blogPosts.map((post, i) => `
        <div class="blog-card-new" onclick="openBlogPost(${i})">
            <div class="blog-cover" style="background: ${post.color};"></div>
            <div class="blog-info">
                <span class="blog-date">${post.date}</span>
                <h3>${post.title}</h3>
                <p>${post.desc}</p>
                <div class="read-more">Read →</div>
            </div>
        </div>
    `).join('');
}

window.openBlogPost = function(index) {
    const content = getEl('full-blog-content');
    const gridView = getEl('blog-grid-view');
    const fullView = getEl('blog-full-view');
    
    if (content) content.innerHTML = blogPosts[index].content;
    if (gridView) gridView.classList.add('hidden');
    if (fullView) fullView.classList.remove('hidden');
}

const backToBlog = getEl('back-to-blog');
if (backToBlog) {
    backToBlog.addEventListener('click', () => {
        const gridView = getEl('blog-grid-view');
        const fullView = getEl('blog-full-view');
        if (fullView) fullView.classList.add('hidden');
        if (gridView) gridView.classList.remove('hidden');
    });
}

// ============================================
// NAVIGATION
// ============================================

function hideAll() {
    [stepRegister, homeFlowContainer, pageBlog, pageAbout, pageSupport, pageChat].forEach(el => {
        if (el) el.classList.add('hidden');
    });
}

const navHome = getEl('nav-home');
const navBlog = getEl('nav-blog');
const navAbout = getEl('nav-about');
const navSupport = getEl('nav-support');

if (navHome) navHome.addEventListener('click', () => { 
    hideAll(); 
    if (!userEmail) {
        if (stepRegister) stepRegister.classList.remove('hidden');
    } else {
        if (homeFlowContainer) homeFlowContainer.classList.remove('hidden');
    }
});

if (navBlog) navBlog.addEventListener('click', () => { hideAll(); if (pageBlog) pageBlog.classList.remove('hidden'); renderBlogs(); });
if (navAbout) navAbout.addEventListener('click', () => { hideAll(); if (pageAbout) pageAbout.classList.remove('hidden'); });
if (navSupport) navSupport.addEventListener('click', () => { hideAll(); if (pageSupport) pageSupport.classList.remove('hidden'); });

// Safety checkboxes
const checkAge = getEl('check-age');
const checkRules = getEl('check-rules');
const checkTerms = getEl('check-terms');
const btnSafetyContinue = getEl('btn-safety-continue');

[checkAge, checkRules, checkTerms].forEach(check => {
    if (check) check.addEventListener('change', () => {
        if (btnSafetyContinue) {
            btnSafetyContinue.disabled = !(checkAge?.checked && checkRules?.checked && checkTerms?.checked);
        }
    });
});

const btnLetsChat = getEl('btn-lets-chat');
const btnStartFinal = getEl('btn-start-final');

if (btnSafetyContinue) {
    btnSafetyContinue.addEventListener('click', () => {
        getEl('step-safety')?.classList.add('hidden');
        getEl('step-landing')?.classList.remove('hidden');
    });
}

if (btnLetsChat) {
    btnLetsChat.addEventListener('click', () => {
        getEl('step-landing')?.classList.add('hidden');
        getEl('step-prefs')?.classList.remove('hidden');
    });
}

if (btnStartFinal) {
    btnStartFinal.addEventListener('click', () => {
        if (homeFlowContainer) homeFlowContainer.classList.add('hidden');
        getEl('main-nav')?.classList.add('hidden');
        if (pageChat) pageChat.classList.remove('hidden');
        if (waitingScreen) waitingScreen.classList.remove('hidden');
        if (chatScreen) chatScreen.classList.add('hidden');
        findPartner();
    });
}

// ============================================
// CHAT LOGIC
// ============================================

fetch('https://ipwho.is/')
    .then(res => res.json())
    .then(data => {
        if (data.country_code) {
            const codes = data.country_code.toUpperCase().split('').map(c => 127397 + c.charCodeAt());
            myCountryFlag = String.fromCodePoint(...codes);
        }
    })
    .catch(() => {});

function findPartner() {
    if (statusText) statusText.innerText = "🟡 Searching...";
    socket.emit('find_partner', { 
        country: myCountryFlag, 
        nickname: nicknameInput?.value.trim() || "Stranger", 
        myGender, 
        partnerGender: selectedPartnerGender, 
        email: userEmail,
        isPremium,
        isGuest
    });
}

function sendMessage() {
    const raw = msgInput?.value.trim();
    if (raw && currentRoom) { 
        const clean = filterMessage(raw);
        addMessage(clean, 'my-msg'); 
        socket.emit('send_message', { room: currentRoom, message: clean }); 
        if (msgInput) msgInput.value = ''; 
        socket.emit('typing_stop', currentRoom); 
        getEl('emoji-picker')?.classList.add('hidden');
    }
}

function addMessage(msg, type) {
    if (!messagesDiv) return;
    const div = document.createElement('div'); 
    div.classList.add('message', type);
    div.innerHTML = `${msg} <span class="msg-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>`;
    messagesDiv.appendChild(div); 
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemBlock(country, nickname) {
    if (!messagesDiv) return;
    messagesDiv.innerHTML += `
        <div class="sys-connect">
            <div class="sys-connect-pill">Connected • ${nickname} ${country}</div>
        </div>
        <div class="sys-safety-box">
            <h4>⚠️ Safety Notice</h4>
            <ul><li>No illegal content</li><li>Be respectful</li></ul>
        </div>
    `;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Event listeners
const emojiBtn = getEl('emoji-btn');
const emojiPicker = getEl('emoji-picker');
const sendBtn = getEl('send-btn');
const skipBtn = getEl('skip-btn');
const backHomeBtn = getEl('back-home-btn');

if (emojiBtn && emojiPicker) {
    emojiBtn.addEventListener('click', () => emojiPicker.classList.toggle('hidden'));
    document.querySelectorAll('#emoji-picker span').forEach(span => {
        span.addEventListener('click', () => { 
            if (msgInput) {
                msgInput.value += span.innerText; 
                msgInput.focus();
            }
        });
    });
}

if (msgInput) {
    msgInput.addEventListener('input', () => { 
        if (currentRoom) { 
            socket.emit('typing_start', currentRoom); 
            clearTimeout(typingTimeout); 
            typingTimeout = setTimeout(() => socket.emit('typing_stop', currentRoom), 1000); 
        }
    });
    msgInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
}

if (sendBtn) sendBtn.addEventListener('click', sendMessage);
if (backHomeBtn) backHomeBtn.addEventListener('click', () => { 
    if (currentRoom) socket.emit('skip_chat', currentRoom); 
    location.reload(); 
});

if (skipBtn) {
    skipBtn.addEventListener('click', () => { 
        if (currentRoom) { 
            socket.emit('skip_chat', currentRoom); 
            currentRoom = null; 
        } 
        if (messagesDiv) messagesDiv.innerHTML = ''; 
        if (waitingScreen) waitingScreen.classList.remove('hidden'); 
        if (chatScreen) chatScreen.classList.add('hidden'); 
        if (statusText) statusText.innerText = "🔴 Offline"; 
        findPartner(); 
    });
}

// Socket events
socket.on('chat_start', (data) => { 
    currentRoom = data.room; 
    if (statusText) statusText.innerText = "🟢 Connected"; 
    if (waitingScreen) waitingScreen.classList.add('hidden'); 
    if (chatScreen) chatScreen.classList.remove('hidden'); 
    if (messagesDiv) messagesDiv.innerHTML = ''; 
    addSystemBlock(data.country, data.nickname); 
    if (notifSound) notifSound.play().catch(() => {});
});

socket.on('receive_message', (msg) => { 
    addMessage(msg, 'stranger-msg'); 
    if (notifSound) notifSound.play().catch(() => {});
});

const typingStatus = getEl('typing-status');
socket.on('partner_typing', () => {
    if (typingStatus) typingStatus.innerText = "typing...";
});
socket.on('partner_stopped_typing', () => {
    if (typingStatus) typingStatus.innerText = "";
});

socket.on('partner_left', () => {
    if (statusText) statusText.innerText = "🔴 Left";
    if (messagesDiv) {
        messagesDiv.innerHTML += '<div class="sys-connect"><span style="color:#ff4757">Disconnected</span></div>';
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    currentRoom = null;
    
    const autoSkip = getEl('auto-skip-toggle');
    if (autoSkip?.checked) {
        setTimeout(() => { 
            if (messagesDiv) messagesDiv.innerHTML = ''; 
            findPartner(); 
        }, 1500);
    }
});

socket.on('premium_required', (data) => {
    alert('⚠️ ' + data.message);
    selectPartner('random', btnRandom);
    if (!isGuest) {
        if (overlay) overlay.classList.remove('hidden');
        if (modalPricing) modalPricing.classList.remove('hidden');
    }
});


