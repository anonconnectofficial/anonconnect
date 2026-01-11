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
const stepRegister = document.getElementById('step-register');
const homeFlowContainer = document.getElementById('home-flow-container');
const navLinks = { 
    home: document.getElementById('nav-home'), 
    blog: document.getElementById('nav-blog'), 
    about: document.getElementById('nav-about'), 
    support: document.getElementById('nav-support') 
};
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
const modalPricing = document.getElementById('modal-pricing');
const notifSound = document.getElementById('notif-sound');

// 🔥 NEW: Registration page elements
const btnRegisterGoogle = document.getElementById('btn-register-google');
const btnRegisterAnonymous = document.getElementById('btn-register-anonymous');
const btnContinueToSafety = document.getElementById('btn-continue-to-safety');
const userStatusCard = document.getElementById('user-status-card');
const loginOptions = document.getElementById('login-options');
const loggedUserEmail = document.getElementById('logged-user-email');
const loggedUserStatus = document.getElementById('logged-user-status');
const prefUserEmail = document.getElementById('pref-user-email');
const prefUserStatus = document.getElementById('pref-user-status');

let currentRoom = null;
let typingTimeout = null;
let myCountryFlag = "🌐";
let isPremium = false;
let selectedPartnerGender = 'random';
let myGender = 'male';
let userEmail = null;
let isGuest = false;
let isMuted = false;

// ============================================
// 🔥 REGISTRATION & AUTO-LOGIN LOGIC
// ============================================

// Check if user is already logged in when page loads
onAuthStateChanged(auth, (user) => {
    if (user) {
        userEmail = user.email;
        isGuest = false;
        console.log("🔐 User already logged in:", userEmail);
        
        // Update UI on registration page
        updateRegistrationUI(userEmail, false);
        
        // Check premium status
        checkDatabaseStatus(userEmail);
    } else {
        console.log("👤 No user logged in - showing registration page");
    }
});

// 🔥 Google Login Handler
if (btnRegisterGoogle) {
    btnRegisterGoogle.addEventListener('click', () => {
        signInWithPopup(auth, provider)
            .then((result) => {
                userEmail = result.user.email;
                isGuest = false;
                console.log("✅ Logged in with Google:", userEmail);
                
                updateRegistrationUI(userEmail, false);
                checkDatabaseStatus(userEmail);
            })
            .catch((error) => {
                console.error("❌ Google Login Error:", error);
                alert("Login Failed: " + error.message);
            });
    });
}

// 🔥 Anonymous/Guest Login Handler
if (btnRegisterAnonymous) {
    btnRegisterAnonymous.addEventListener('click', () => {
        userEmail = 'guest_' + Date.now() + '@anonymous.local';
        isGuest = true;
        isPremium = false;
        console.log("👻 Guest login:", userEmail);
        
        updateRegistrationUI(userEmail, true);
    });
}

// 🔥 Continue to Safety Page
if (btnContinueToSafety) {
    btnContinueToSafety.addEventListener('click', () => {
        stepRegister.classList.add('hidden');
        homeFlowContainer.classList.remove('hidden');
        
        // Update preferences page with user info
        updatePreferencesUI();
    });
}

// 🔥 Update Registration Page UI after login
function updateRegistrationUI(email, isGuestMode) {
    if (loginOptions) loginOptions.classList.add('hidden');
    if (userStatusCard) userStatusCard.classList.remove('hidden');
    if (btnContinueToSafety) btnContinueToSafety.classList.remove('hidden');
    
    if (loggedUserEmail) {
        loggedUserEmail.textContent = isGuestMode ? 'Guest Mode' : email;
    }
    
    if (loggedUserStatus) {
        if (isGuestMode) {
            loggedUserStatus.innerHTML = '🎭 Limited Features • Random Chat Only';
            loggedUserStatus.style.color = '#ff9f43';
        } else {
            loggedUserStatus.innerHTML = '⏳ Checking premium status...';
            loggedUserStatus.style.color = '#888';
        }
    }
}

// 🔥 Update Preferences Page with User Info
function updatePreferencesUI() {
    if (!prefUserEmail || !prefUserStatus) return;
    
    if (isGuest) {
        prefUserEmail.textContent = 'Guest Mode';
        prefUserStatus.textContent = 'Limited to Random chat';
        premiumStatusBadge.innerText = "Status: Guest 🎭";
        premiumStatusBadge.style.color = "#ff9f43";
        
        // Keep locks visible for guest
        document.querySelectorAll('.premium-lock').forEach(lock => {
            if (lock) lock.style.display = 'inline';
        });
    } else if (userEmail) {
        prefUserEmail.textContent = userEmail;
        prefUserStatus.textContent = isPremium ? 'Premium Member 👑' : 'Free Member';
    }
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
            updateStatusUI(false);
            return;
        }
        
        const data = await res.json();
        console.log("📊 Status response:", data);
        
        if (data.isPremium) { 
            isPremium = true; 
            updatePremiumUI();
            
            // Update registration page status
            if (loggedUserStatus) {
                loggedUserStatus.innerHTML = `✅ Premium Active • ${data.daysRemaining} days left`;
                loggedUserStatus.style.color = '#00f2ea';
            }
            
            if (data.daysRemaining) {
                console.log(`✅ PREMIUM ACTIVE - ${data.daysRemaining} days remaining`);
                premiumStatusBadge.title = `Premium expires in ${data.daysRemaining} days`;
            }
        } else {
            updateStatusUI(false);
            
            if (data.expired) {
                console.log("⏰ Premium expired on:", data.expiryDate);
                showExpiryNotification();
            }
        }
    } catch(e) { 
        console.error("❌ DB Check Failed:", e);
        updateStatusUI(false);
    }
}

// Update UI when status is known
function updateStatusUI(premium) {
    if (loggedUserStatus) {
        if (premium) {
            loggedUserStatus.innerHTML = '✅ Premium Member';
            loggedUserStatus.style.color = '#00f2ea';
        } else {
            loggedUserStatus.innerHTML = '💎 Free Member • Upgrade for filters';
            loggedUserStatus.style.color = '#888';
        }
    }
}

function updatePremiumUI() {
    premiumStatusBadge.innerText = "Status: PREMIUM 👑";
    premiumStatusBadge.style.color = "#00f2ea";
    premiumStatusBadge.style.fontWeight = "bold";
    
    // Unlock gender filters
    const locks = document.querySelectorAll('.premium-lock');
    locks.forEach(lock => {
        if (lock) lock.style.display = 'none';
    });
    
    console.log("✨ Premium UI unlocked!");
}

function showExpiryNotification() {
    premiumStatusBadge.innerText = "Status: EXPIRED ⏰";
    premiumStatusBadge.style.color = "#ff4757";
}

// ✅ PAYMENT FUNCTION
window.initiatePayment = async function(plan, amount) {
    if(!userEmail || isGuest) { 
        alert("Please login with Google to purchase premium!"); 
        return; 
    }
    
    try {
        console.log("🔄 Creating order for ₹" + amount);
        
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
        
        const options = {
            "key": "rzp_test_S1af2JV9L5Vlw5",
            "amount": order.amount, 
            "currency": "INR", 
            "name": "AnonConnect Premium", 
            "description": `${plan} Plan - 1 Month Access`,
            "order_id": order.id,
            "handler": async function (response) {
                console.log("💳 Payment Response:", response);
                
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
                        updatePreferencesUI();
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
// 🔥 GENDER FILTER LOGIC WITH PREMIUM CHECK
// ============================================

window.setMyGender = function(gender) {
    myGender = gender;
    document.getElementById('iam-male').classList.remove('active');
    document.getElementById('iam-female').classList.remove('active');
    document.getElementById('iam-' + gender).classList.add('active');
}

if (btnRandom) btnRandom.addEventListener('click', () => selectPartner('random', btnRandom));
if (btnMale) btnMale.addEventListener('click', () => checkPremiumAccess('male', btnMale));
if (btnFemale) btnFemale.addEventListener('click', () => checkPremiumAccess('female', btnFemale));

function selectPartner(type, btn) {
    selectedPartnerGender = type;
    document.querySelectorAll('.gender-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function checkPremiumAccess(type, btn) {
    if (isGuest) {
        alert('🎭 Guest Mode: Gender filters are locked!\n\nPlease login with Google to unlock Male/Female filters.');
        return;
    }
    
    if(isPremium) {
        selectPartner(type, btn);
    } else { 
        alert('🔒 Premium Feature\n\nUpgrade to Premium to unlock Male/Female gender filters!');
        overlay.classList.remove('hidden'); 
        modalPricing.classList.remove('hidden'); 
    }
}

window.closePremiumModal = function() { 
    overlay.classList.add('hidden'); 
}

// ============================================
// BAD WORD FILTER
// ============================================
const badWords = ["fuck", "sex", "porn", "dick", "pussy", "nude", "horny", "bitch", "randi", "chut", "lund"];
function filterMessage(text) {
    let cleanText = text;
    badWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        cleanText = cleanText.replace(regex, "***");
    });
    return cleanText;
}

// ============================================
// BLOG LOGIC
// ============================================
const blogPosts = [
    {
        title: "5 Tips to Stay Safe",
        desc: "Learn how to protect your identity.",
        date: "Today",
        color: "linear-gradient(45deg, #ff9a9e 0%, #fad0c4 99%)",
        content: `<h2>Safety First!</h2><p>Never share your phone number or click on suspicious links.</p><p>Online safety is crucial when chatting with strangers. Always be cautious and protect your personal information.</p>`
    },
    {
        title: "Why Anonymous Chat is Viral?",
        desc: "The psychology behind talking to strangers.",
        date: "Yesterday",
        color: "linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)",
        content: `<h2>The Thrill</h2><p>Spontaneity is key. You never know who you will meet next.</p><p>Anonymous chatting allows people to be themselves without judgment. It's a unique way to connect with others worldwide.</p>`
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

const backToBlogBtn = document.getElementById('back-to-blog');
if(backToBlogBtn) {
    backToBlogBtn.addEventListener('click', () => {
        document.getElementById('blog-full-view').classList.add('hidden');
        document.getElementById('blog-grid-view').classList.remove('hidden');
    });
}

// ============================================
// UI & NAVIGATION
// ============================================

function hideAllPages() { 
    if (stepRegister) stepRegister.classList.add('hidden');
    if (homeFlowContainer) homeFlowContainer.classList.add('hidden'); 
    if (pageBlog) pageBlog.classList.add('hidden'); 
    if (pageAbout) pageAbout.classList.add('hidden'); 
    if (pageSupport) pageSupport.classList.add('hidden'); 
    if (pageChat) pageChat.classList.add('hidden'); 
}

if (navLinks.home) {
    navLinks.home.addEventListener('click', () => { 
        hideAllPages(); 
        if (!userEmail) {
            stepRegister.classList.remove('hidden');
        } else {
            homeFlowContainer.classList.remove('hidden'); 
        }
    });
}

if (navLinks.blog) navLinks.blog.addEventListener('click', () => { hideAllPages(); pageBlog.classList.remove('hidden'); renderBlogs(); });
if (navLinks.about) navLinks.about.addEventListener('click', () => { hideAllPages(); pageAbout.classList.remove('hidden'); });
if (navLinks.support) navLinks.support.addEventListener('click', () => { hideAllPages(); pageSupport.classList.remove('hidden'); });

const btnSafetyContinue = document.getElementById('btn-safety-continue');
const checks = [document.getElementById('check-age'), document.getElementById('check-rules'), document.getElementById('check-terms')];

if(checks[0] && checks[1] && checks[2]) {
    checks.forEach(check => {
        check.addEventListener('change', () => {
            btnSafetyContinue.disabled = !(checks[0].checked && checks[1].checked && checks[2].checked);
        });
    });
}

if (btnSafetyContinue) {
    btnSafetyContinue.addEventListener('click', () => { 
        document.getElementById('step-safety').classList.add('hidden'); 
        document.getElementById('step-landing').classList.remove('hidden'); 
    });
}

const btnLetsChat = document.getElementById('btn-lets-chat');
if (btnLetsChat) {
    btnLetsChat.addEventListener('click', () => { 
        document.getElementById('step-landing').classList.add('hidden'); 
        document.getElementById('step-prefs').classList.remove('hidden'); 
    });
}

const btnStartFinal = document.getElementById('btn-start-final');
if (btnStartFinal) {
    btnStartFinal.addEventListener('click', () => {
        homeFlowContainer.classList.add('hidden');
        document.getElementById('main-nav').classList.add('hidden'); 
        pageChat.classList.remove('hidden'); 
        waitingScreen.classList.remove('hidden'); 
        chatScreen.classList.add('hidden'); 
        findPartner();
    });
}

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

function playNotif() { 
    if (!isMuted && notifSound) notifSound.play().catch(e=>{}); 
}

// Message handling
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const sendBtn = document.getElementById('send-btn');

if (emojiBtn && emojiPicker) {
    emojiBtn.addEventListener('click', () => emojiPicker.classList.toggle('hidden'));
    
    document.querySelectorAll('#emoji-picker span').forEach(span => {
        span.addEventListener('click', () => { 
            msgInput.value += span.innerText; 
            msgInput.focus(); 
        });
    });
}

if (msgInput) {
    msgInput.addEventListener('input', () => { 
        if(currentRoom) { 
            socket.emit('typing_start', currentRoom); 
            clearTimeout(typingTimeout); 
            typingTimeout = setTimeout(() => socket.emit('typing_stop', currentRoom), 1000); 
        }
    });
    
    msgInput.addEventListener('keypress', (e) => { 
        if(e.key === 'Enter') sendMessage(); 
    });
}

if (sendBtn) sendBtn.addEventListener('click', sendMessage);

const backHomeBtn = document.getElementById('back-home-btn');
if (backHomeBtn) {
    backHomeBtn.addEventListener('click', () => { 
        if(currentRoom) socket.emit('skip_chat', currentRoom); 
        location.reload(); 
    });
}

const skipBtn = document.getElementById('skip-btn');
if (skipBtn) {
    skipBtn.addEventListener('click', () => { 
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
}

function findPartner() {
    statusText.innerText = "🟡 Searching..."; 
    socket.emit('find_partner', { 
        country: myCountryFlag, 
        nickname: nicknameInput.value.trim() || "Stranger", 
        myGender: myGender, 
        partnerGender: selectedPartnerGender, 
        email: userEmail,
        isPremium: isPremium,
        isGuest: isGuest
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
        if (emojiPicker) emojiPicker.classList.add('hidden'); 
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
    safetyDiv.innerHTML = `<h4>⚠️ Safety Notice</h4><ul><li>No illegal discussions</li><li>No sexual solicitation</li><li>Respect others</li></ul><div style="font-size:0.8rem; text-align:center; margin-top:10px;">Chat responsibly. Report violations.</div>`;
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

const typingStatus = document.getElementById('typing-status');
socket.on('partner_typing', () => {
    if (typingStatus) typingStatus.innerText = "Stranger is typing...";
});
socket.on('partner_stopped_typing', () => {
    if (typingStatus) typingStatus.innerText = "";
});

socket.on('partner_left', () => {
    statusText.innerText = "🔴 Partner Left";
    const div = document.createElement('div'); 
    div.classList.add('sys-connect'); 
    div.innerHTML = `<span style="color:#ff4757; font-size:0.9rem;">⚠️ Stranger disconnected.</span>`;
    messagesDiv.appendChild(div); 
    messagesDiv.scrollTop = messagesDiv.scrollHeight; 
    currentRoom = null;
    
    const autoSkipToggle = document.getElementById('auto-skip-toggle');
    if(autoSkipToggle && autoSkipToggle.checked) {
        setTimeout(() => { 
            if(autoSkipToggle.checked) { 
                messagesDiv.innerHTML = ''; 
                findPartner(); 
            }
        }, 1500);
    }
});

// 🔥 Server-side premium validation response
socket.on('premium_required', (data) => {
    alert('⚠️ ' + data.message + '\n\nUpgrading to Premium unlocks Male/Female filters!');
    
    // Force back to random
    selectedPartnerGender = 'random';
    document.querySelectorAll('.gender-option').forEach(b => b.classList.remove('active'));
    if (btnRandom) btnRandom.classList.add('active');
    
    // Show pricing modal
    if (!isGuest) {
        overlay.classList.remove('hidden');
        modalPricing.classList.remove('hidden');
    }
});
