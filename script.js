// Import Firebase (Modules use kar rahe hain)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-auth.js";

// --- 🔴 IMPORTANT: APNA FIREBASE CONFIG YAHAN DALO ---
const firebaseConfig = {
  apiKey: "AIzaSyBAcMFyEYqptJpoZiNqF67gGrqXXwiEFH0",
  authDomain: "anonconnect-14b47.firebaseapp.com",
  projectId: "anonconnect-14b47",
  storageBucket: "anonconnect-14b47.firebasestorage.app",
  messagingSenderId: "850807807314",
  appId: "1:850807807314:web:95a2cd8451e017b11b2e8b",
  measurementId: "G-HJNS7HTRWN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Standard Socket Init
const socket = io("http://localhost:3000");

// --- ELEMENTS ---
const homeFlowContainer = document.getElementById('home-flow-container');
const stepSafety = document.getElementById('step-safety');
const stepLanding = document.getElementById('step-landing');
const stepPrefs = document.getElementById('step-prefs');
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

let currentRoom = null;
let isPremium = false; 
let selectedPartnerGender = 'random'; 
let myGender = 'male'; 
let myCountryFlag = "🌐";

// --- 1. REAL GOOGLE LOGIN ---
document.getElementById('btn-google-login').addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then((result) => {
            console.log("Logged in:", result.user);
            // Login Success -> Show Pricing
            modalLogin.classList.add('hidden');
            modalPricing.classList.remove('hidden');
        }).catch((error) => {
            console.error(error);
            alert("Login Failed. Check Console.");
        });
});

// --- 2. REAL PAYMENT (RAZORPAY) ---
window.initiatePayment = async function(plan, amount) {
    // Backend se Order ID mango
    const response = await fetch('/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amount })
    });
    const order = await response.json();

    // Razorpay Options
    const options = {
        "key": "rzp_test_S1af2JV9L5Vlw5", // 🔴 APNI RAZORPAY KEY YAHAN BHI DALO
        "amount": order.amount,
        "currency": "INR",
        "name": "AnonConnect Premium",
        "description": "Unlock " + plan,
        "order_id": order.id,
        "handler": function (response) {
            // Payment Success!
            alert("Payment Successful! Payment ID: " + response.razorpay_payment_id);
            isPremium = true;
            premiumStatusBadge.innerText = "Status: PREMIUM 👑";
            premiumStatusBadge.style.color = "#00f2ea";
            
            // Unlock Buttons
            document.querySelector('#btn-male i.fa-lock').style.display = 'none';
            document.querySelector('#btn-female i.fa-lock').style.display = 'none';
            
            closePremiumModal();
        },
        "theme": { "color": "#00f2ea" }
    };

    const rzp1 = new Razorpay(options);
    rzp1.open();
}

// --- 3. UI LOGIC (Same as before) ---
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
    if(isPremium) selectPartner(type, btn);
    else openLoginModal();
}

function openLoginModal() { overlay.classList.remove('hidden'); modalLogin.classList.remove('hidden'); modalPricing.classList.add('hidden'); }
window.closePremiumModal = function() { overlay.classList.add('hidden'); }

// --- 4. NAVIGATION & CHAT (Same as before) ---
const checks = [document.getElementById('check-age'), document.getElementById('check-rules'), document.getElementById('check-terms')];
const btnSafetyContinue = document.getElementById('btn-safety-continue');
const btnLetsChat = document.getElementById('btn-lets-chat');
const btnStartFinal = document.getElementById('btn-start-final');

checks.forEach(check => check.addEventListener('change', () => btnSafetyContinue.disabled = !(checks[0].checked && checks[1].checked && checks[2].checked)));
btnSafetyContinue.addEventListener('click', () => { document.getElementById('step-safety').classList.add('hidden'); document.getElementById('step-landing').classList.remove('hidden'); });
btnLetsChat.addEventListener('click', () => { document.getElementById('step-landing').classList.add('hidden'); document.getElementById('step-prefs').classList.remove('hidden'); });

btnStartFinal.addEventListener('click', () => {
    homeFlowContainer.classList.add('hidden');
    document.getElementById('main-nav').classList.add('hidden');
    pageChat.classList.remove('hidden');
    waitingScreen.classList.remove('hidden');
    chatScreen.classList.add('hidden');
    findPartner();
});

// Chat Logic (Standard)
function findPartner() {
    statusText.innerText = "🟡 Searching...";
    socket.emit('find_partner', { 
        country: myCountryFlag, 
        nickname: nicknameInput.value.trim() || "Stranger", 
        myGender: myGender,           
        partnerGender: selectedPartnerGender 
    });
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
msgInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendMessage(); });
document.getElementById('skip-btn').addEventListener('click', () => {
    if(currentRoom) { socket.emit('skip_chat', currentRoom); currentRoom = null; }
    messagesDiv.innerHTML = '';
    waitingScreen.classList.remove('hidden');
    chatScreen.classList.add('hidden');
    statusText.innerText = "🔴 Offline";
    findPartner();
});

function sendMessage() {
    const msg = msgInput.value.trim();
    if (msg && currentRoom) { addMessage(msg, 'my-msg'); socket.emit('send_message', { room: currentRoom, message: msg }); msgInput.value = ''; }
}
function addMessage(msg, type) {
    const div = document.createElement('div'); div.classList.add('message', type);
    div.innerHTML = `${msg} <span class="msg-time">Now</span>`;
    messagesDiv.appendChild(div);
}

// Socket Receivers
socket.on('chat_start', (data) => { currentRoom = data.room; statusText.innerText = "🟢 Connected"; waitingScreen.classList.add('hidden'); chatScreen.classList.remove('hidden'); messagesDiv.innerHTML = ''; });
socket.on('receive_message', (msg) => addMessage(msg, 'stranger-msg'));
socket.on('partner_left', () => { statusText.innerText = "🔴 Partner Left"; currentRoom = null; });