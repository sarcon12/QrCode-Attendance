/**
 * Firebase Initialization for QR Attendance System
 * PASTE YOUR FIREBASE CONFIG BELOW
 */

const firebaseConfig = {
    apiKey: "AIzaSyDKYrx_YDHH2Yjgq0i1wfmJtXzccVezJTA",
    authDomain: "qr-code-attendance-b9dfc.firebaseapp.com",
    databaseURL: "https://qr-code-attendance-b9dfc-default-rtdb.firebaseio.com",
    projectId: "qr-code-attendance-b9dfc",
    storageBucket: "qr-code-attendance-b9dfc.firebasestorage.app",
    messagingSenderId: "694547141234",
    appId: "1:694547141234:web:2e88f80d46cbedb6c068eb"
};

// Initialize Firebase
let db = null;
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.database();
} catch (e) {
    console.error("Firebase Initialization Failed (Using Offline Mode):", e.message);
}

/**
 * Standardized Date Helper
 * Returns YYYY-MM-DD format for consistent database keys
 */
function getTodayDate() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

/**
 * Common Firebase Helpers (With LocalStorage Fallback)
 */
const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY" && firebaseConfig.apiKey !== ""; 

let isPhpEnabled = null;

// Auto-detect if PHP is running (Tier 2) or if we are on GitHub Pages (Tier 3)
async function checkPhpStatus() {
    if (isPhpEnabled !== null) return isPhpEnabled;
    try {
        const res = await fetch('api.php', { method: 'GET', cache: 'no-cache' });
        const text = await res.text();
        if (text.trim().startsWith('<?php') || text.trim().startsWith('<')) {
            isPhpEnabled = false; // GitHub Pages serves raw HTML/PHP text
        } else {
            JSON.parse(text); // Verify it's actual JSON data
            isPhpEnabled = true; // XAMPP server works!
        }
    } catch (e) {
        isPhpEnabled = false; // Fetch failed completely
    }
    
    if (!isPhpEnabled) {
        console.warn("⚠️ PHP is dead (GitHub Pages detected). Falling back to LocalBrowser Storage (Tier 3).");
    } else {
        console.warn("⚠️ Firebase is not configured. Falling back to Local XAMPP Server mode (Tier 2).");
    }
    return isPhpEnabled;
}

// Unified Offline Helper (Handles both PHP and LocalStorage)
async function apiRequest(action, path, data = null) {
    const usePhp = await checkPhpStatus();
    const keys = path ? path.split('/').filter(k => k.length > 0) : [];
    
    // TIER 2: PHP Local Server (XAMPP)
    if (usePhp) {
        if (action === 'get') {
            try {
                const res = await fetch('api.php', { cache: 'no-store' });
                const fullDb = await res.json();
                let result = fullDb;
                for (let k of keys) {
                    if (result === undefined || result === null) return null;
                    result = result[k];
                }
                return result;
            } catch (e) {
                console.error("Failed to load DB from PHP:", e);
                return null;
            }
        }
        
        try {
            const res = await fetch('api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, path, data })
            });
            return await res.json();
        } catch (e) {
            console.error("API Error:", e);
            return { error: e.message };
        }
    }
    
    // TIER 3: LocalBrowser Storage (GitHub Pages / Standalone)
    let dbData = JSON.parse(localStorage.getItem("offline_db") || "{}");
    
    if (action === 'get') {
        let result = dbData;
        for (let k of keys) {
            if (result === undefined || result === null) return null;
            result = result[k];
        }
        return result;
    }
    
    let current = dbData;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
    }
    const targetKey = keys.length > 0 ? keys[keys.length - 1] : null;

    if (action === 'set') {
        if (targetKey) current[targetKey] = data;
        else dbData = data;
    } else if (action === 'update') {
        if (targetKey) {
            if (!current[targetKey]) current[targetKey] = {};
            current[targetKey] = { ...current[targetKey], ...data };
        } else {
            dbData = { ...dbData, ...data };
        }
    } else if (action === 'push') {
        const newId = "-ls-" + Date.now();
        if (targetKey) {
            if (!current[targetKey]) current[targetKey] = {};
            current[targetKey][newId] = data;
        } else {
            dbData[newId] = data;
        }
        localStorage.setItem("offline_db", JSON.stringify(dbData));
        return { data: { key: newId } };
    } else if (action === 'remove') {
        if (targetKey) delete current[targetKey];
        else dbData = {};
    }
    
    localStorage.setItem("offline_db", JSON.stringify(dbData));
    return { status: "success" };
}

const FB = {
    get: async (path) => {
        if (!isFirebaseConfigured) return await apiRequest('get', path);
        const snapshot = await db.ref(path).once('value');
        return snapshot.val();
    },
    set: async (path, data) => {
        if (!isFirebaseConfigured) return await apiRequest('set', path, data);
        return db.ref(path).set(data);
    },
    update: async (path, data) => {
        if (!isFirebaseConfigured) return await apiRequest('update', path, data);
        return db.ref(path).update(data);
    },
    push: async (path, data) => {
        if (!isFirebaseConfigured) {
            const res = await apiRequest('push', path, data);
            return { key: res.data ? res.data.key : null };
        }
        return db.ref(path).push(data);
    },
    remove: async (path) => {
        if (!isFirebaseConfigured) return await apiRequest('remove', path);
        return db.ref(path).remove();
    },
    watch: (path, callback) => {
        if (!isFirebaseConfigured) {
            // Polling for offline mode watching
            setInterval(async () => {
                const data = await FB.get(path);
                callback(data);
            }, 2000);
            return;
        }
        db.ref(path).on('value', snapshot => callback(snapshot.val()));
    }
};

