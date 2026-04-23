// --- DATA ---
const CONTACTS = [
    { name: 'National Emergency', num: '112', color: 'bg-red-600', icon: 'fa-shield-halved' },
    { name: 'Ambulance', num: '102', color: 'bg-emerald-600', icon: 'fa-truck-medical' },
    { name: 'Police', num: '100', color: 'bg-blue-600', icon: 'fa-user-shield' },
    { name: 'Fire Force', num: '101', color: 'bg-orange-600', icon: 'fa-fire' }
];

const FIRST_AID_DATA = [
    {
        id: 'heart', title: 'Cardiac Arrest (CPR)', img: 'https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?auto=format&fit=crop&w=800&q=80',
        steps: [ 'Confirm scene safety.', 'Check responsiveness (tap/shout).', 'If unresponsive, call 112 immediately.', 'Start chest compressions: Push hard and fast (100-120/min).', 'Allow full chest recoil between compressions.', 'Continue until help arrives or an AED is used.' ]
    },
    {
        id: 'bleed', title: 'Severe Bleeding', img: 'https://images.unsplash.com/photo-1612277795421-9bc7706a4a34?auto=format&fit=crop&w=800&q=80',
        steps: [ 'Apply direct pressure with a clean cloth.', 'Keep constant pressure; do not lift to check.', 'If bleeding persists, apply a tourniquet above the wound.', 'Wrap the victim to prevent shock.', 'Elevate the wound above heart level.' ]
    },
    {
        id: 'choke', title: 'Choking (Heimlich)', img: 'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=800&q=80',
        steps: [ 'Ask "Are you choking?"', 'Stand behind them, wrap arms around waist.', 'Make a fist, place thumb-side above the navel.', 'Perform quick, upward abdominal thrusts.', 'Repeat until object is expelled or they lose consciousness.' ]
    },
    {
        id: 'burn', title: 'Serious Burns', img: 'https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?auto=format&fit=crop&w=800&q=80',
        steps: [ 'Stop the burn (Remove heat/fire).', 'Cool with room-temperature water for 20 mins.', 'Remove jewelry before the area swells.', 'Cover loosely with sterile plastic wrap.', 'Never apply ice, butter, or ointments.' ]
    },
    {
        id: 'stroke', title: 'Stroke (F.A.S.T)', img: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=800&q=80',
        steps: [ 'FACE: Ask them to smile. Does one side droop?', 'ARMS: Ask them to raise both arms. Does one drift down?', 'SPEECH: Ask them to repeat a simple phrase. Is it slurred?', 'TIME: If any signs are present, call 112 immediately.', 'Note the time when symptoms first started.' ]
    }
];

const DISASTER_DATA = [
    {
        id: 'quake', title: 'Earthquake Survival', img: 'https://images.unsplash.com/photo-1506540328221-99af93b79da9?auto=format&fit=crop&w=800&q=80',
        steps: [ 'DROP: Get on your hands and knees.', 'COVER: Protect your head/neck under sturdy furniture.', 'HOLD ON: Stay put until the shaking stops.', 'Avoid glass, windows, and heavy objects.', 'If outdoors, move to an open area away from structures.' ]
    },
    {
        id: 'flood', title: 'Flash Flood Safety', img: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80',
        steps: [ 'Move to higher ground immediately.', 'Never walk or drive through flood waters.', 'Avoid bridges over fast-moving currents.', 'If trapped in a car, climb onto the roof if water rises.', 'Stay away from downed power lines.' ]
    },
    {
        id: 'fire', title: 'House Fire Protocol', img: 'https://images.unsplash.com/photo-1601053896898-35ed0cb85bba?auto=format&fit=crop&w=800&q=80',
        steps: [ 'Get out immediately. Do not stop for items.', 'Crawl low under smoke to find exits.', 'Check doors for heat before opening.', 'Stop, Drop, and Roll if your clothing catches fire.', 'Call 112 only once you are safely outside.' ]
    },
    {
        id: 'storm', title: 'Severe Storm/Cyclone', img: 'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?auto=format&fit=crop&w=800&q=80',
        steps: [ 'Stay indoors in a reinforced room or basement.', 'Keep away from glass windows and doors.', 'Unplug electronic appliances.', 'Have your emergency kit and water ready.', 'Listen to radio/official alerts for updates.' ]
    }
];

let personalContacts = JSON.parse(localStorage.getItem('rescueContacts') || '[]');
const MEDICAL_PROFILE_FILE = 'medical-profile.json';
const MEDICAL_PROFILE_API = '/api/medical-profile';

const MEDICAL_SCHEMA_VERSION = 2;

function createEmptyMedicalProfile() {
    return {
        schemaVersion: MEDICAL_SCHEMA_VERSION,
        source: 'heartify-medical-id',
        updatedAt: '',
        patient: {
            bloodGroup: '',
            allergies: [],
            conditions: []
        },
        emergencyDoctor: {
            raw: ''
        },
        medications: []
    };
}

function normalizeTextList(value) {
    if (Array.isArray(value)) {
        return value
            .map(v => String(v || '').trim())
            .filter(Boolean);
    }
    return String(value || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

function migrateMedicalProfile(raw) {
    if (!raw || typeof raw !== 'object') {
        return createEmptyMedicalProfile();
    }

    if (raw.schemaVersion === MEDICAL_SCHEMA_VERSION && raw.patient && Array.isArray(raw.medications)) {
        return {
            schemaVersion: MEDICAL_SCHEMA_VERSION,
            source: raw.source || 'heartify-medical-id',
            updatedAt: raw.updatedAt || '',
            patient: {
                bloodGroup: raw.patient.bloodGroup || '',
                allergies: normalizeTextList(raw.patient.allergies),
                conditions: normalizeTextList(raw.patient.conditions)
            },
            emergencyDoctor: {
                raw: (raw.emergencyDoctor && raw.emergencyDoctor.raw) ? String(raw.emergencyDoctor.raw).trim() : ''
            },
            medications: raw.medications.map(m => ({
                name: String(m.name || '').trim(),
                timing: String(m.timing || '').trim()
            })).filter(m => m.name && m.timing)
        };
    }

    // Legacy v1 migration support.
    return {
        schemaVersion: MEDICAL_SCHEMA_VERSION,
        source: 'heartify-medical-id',
        updatedAt: '',
        patient: {
            bloodGroup: raw.bloodGroup || '',
            allergies: normalizeTextList(raw.allergies),
            conditions: normalizeTextList(raw.conditions)
        },
        emergencyDoctor: {
            raw: String(raw.doctorName || '').trim()
        },
        medications: (Array.isArray(raw.medicines) ? raw.medicines : []).map(m => ({
            name: String(m.name || '').trim(),
            timing: String(m.timing || '').trim()
        })).filter(m => m.name && m.timing)
    };
}

async function saveMedicalProfile() {
    medicalProfile.updatedAt = new Date().toISOString();
    try {
        await fetch(MEDICAL_PROFILE_API, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(medicalProfile)
        });
    } catch (err) {
        // If API is unavailable, keep app functional in memory.
    }
}

async function loadMedicalProfileFromFile() {
    try {
        let res = await fetch(`${MEDICAL_PROFILE_API}?v=${Date.now()}`);
        if (!res.ok) {
            res = await fetch(`${MEDICAL_PROFILE_FILE}?v=${Date.now()}`);
        }
        if (!res.ok) {
            medicalProfile = createEmptyMedicalProfile();
            return;
        }
        const json = await res.json();
        medicalProfile = migrateMedicalProfile(json);
    } catch (err) {
        medicalProfile = createEmptyMedicalProfile();
    }
}

// API-ready payload builder for ChatGPT/OpenAI Chat Completions style messages.
function buildMedicalPayloadForChatGPT() {
    return {
        modelHint: 'gpt-4.1-mini',
        messages: [
            {
                role: 'system',
                content: 'You are a medical assistant. Use the provided medical profile as context, but do not replace clinical judgment.'
            },
            {
                role: 'user',
                content: `Medical profile JSON:\n${JSON.stringify(medicalProfile, null, 2)}\n\nUse this profile while answering the user query.`
            }
        ]
    };
}

let medicalProfile = createEmptyMedicalProfile();

// --- NAVIGATION ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(n => {
        if (n.dataset.id === tabId) {
            n.classList.replace('text-slate-400', 'text-red-600');
        } else {
            n.classList.replace('text-red-600', 'text-slate-400');
        }
    });
}

function toggleSOS(show) {
    const modal = document.getElementById('sos-modal');
    if (show) {
        modal.classList.remove('translate-y-full', 'opacity-0');
        renderSOSGrid();
        
        // Show medical ID in SOS if data exists
        const medDisplay = document.getElementById('sos-medical-display');
        const bloodGroup = medicalProfile.patient.bloodGroup || '';
        const allergyText = medicalProfile.patient.allergies.join(', ');
        if (bloodGroup || allergyText) {
            medDisplay.classList.remove('hidden');
            document.getElementById('sos-display-blood').innerText = bloodGroup || 'Unknown';
            document.getElementById('sos-display-allergies').innerText = allergyText || 'None recorded';
        } else {
            medDisplay.classList.add('hidden');
        }
    } else {
        modal.classList.add('translate-y-full', 'opacity-0');
    }
}

// --- MEDICAL LOGIC ---
function renderMedicalInfo() {
    document.getElementById('med-blood').value = medicalProfile.patient.bloodGroup || '';
    document.getElementById('med-allergies').value = medicalProfile.patient.allergies.join(', ');
    document.getElementById('med-conditions').value = medicalProfile.patient.conditions.join(', ');
    document.getElementById('med-doctor').value = medicalProfile.emergencyDoctor.raw || '';
    renderMedicines();
}

function saveMedicalBasicInfo() {
    medicalProfile.patient.bloodGroup = document.getElementById('med-blood').value;
    medicalProfile.patient.allergies = normalizeTextList(document.getElementById('med-allergies').value);
    medicalProfile.patient.conditions = normalizeTextList(document.getElementById('med-conditions').value);
    medicalProfile.emergencyDoctor.raw = document.getElementById('med-doctor').value.trim();
    saveMedicalProfile();
}

document.getElementById('med-form').onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('med-name').value;
    const timing = document.getElementById('med-timing').value;
    if(name && timing) {
        medicalProfile.medications.push({name: name.trim(), timing: timing.trim()});
        saveMedicalProfile();
        renderMedicines();
        e.target.reset();
    }
};

function deleteMedicine(index) {
    medicalProfile.medications.splice(index, 1);
    saveMedicalProfile();
    renderMedicines();
}

function renderMedicines() {
    const list = document.getElementById('medicine-list');
    if(medicalProfile.medications.length === 0) {
        list.innerHTML = '<p class="text-slate-400 text-sm italic text-center py-4 bg-slate-50 rounded-2xl border border-slate-100">No prescriptions added.</p>';
        return;
    }
    list.innerHTML = medicalProfile.medications.map((m, i) => `
        <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl shadow-sm border border-slate-100">
            <div>
                <p class="font-bold text-slate-800">${m.name}</p>
                <p class="text-xs text-slate-500 font-medium mt-1"><i class="fa-regular fa-clock mr-1 text-rose-400"></i>${m.timing}</p>
            </div>
            <button type="button" onclick="deleteMedicine(${i})" class="w-10 h-10 rounded-full bg-white text-slate-400 flex items-center justify-center shadow-sm active:scale-95 transition-transform"><i class="fa-solid fa-trash-can text-sm"></i></button>
        </div>
    `).join('');
}

// --- RENDERERS ---
function renderUI() {
    document.getElementById('standard-numbers').innerHTML = CONTACTS.map(c => `
        <a href="tel:${c.num}" class="flex items-center p-5 bg-slate-50 rounded-3xl active:scale-[0.98] transition-transform">
            <div class="${c.color} w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl shadow-lg">
                <i class="fa-solid ${c.icon}"></i>
            </div>
            <div class="ml-5 flex-grow">
                <p class="font-bold text-lg">${c.name}</p>
                <p class="text-xs text-slate-400 font-black uppercase tracking-widest">${c.num}</p>
            </div>
            <i class="fa-solid fa-chevron-right text-slate-300"></i>
        </a>
    `).join('');

    renderLibrary('firstaid', FIRST_AID_DATA, 'aid-categories', 'firstaid-cards');
    renderLibrary('disaster', DISASTER_DATA, 'disaster-categories', 'disaster-cards');
}

function renderLibrary(type, data, navId, contentId) {
    const nav = document.getElementById(navId);
    const content = document.getElementById(contentId);

    nav.innerHTML = data.map((item, idx) => `
        <button data-wiki-id="${item.id}" onclick="openWiki('${type}', '${item.id}', this)" class="category-pill shrink-0 px-6 py-3 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'active' : ''}">
            ${item.id}
        </button>
    `).join('');

    content.innerHTML = data.map(item => `
        <div id="${type}-${item.id}" class="space-y-6 ${item.id !== data[0].id ? 'hidden' : ''}">
            <div class="relative h-64 rounded-[3rem] overflow-hidden shadow-2xl">
                <img src="${item.img}" class="w-full h-full object-cover">
                <div class="absolute inset-0 img-overlay"></div>
                <div class="absolute bottom-8 left-8">
                    <h3 class="text-3xl font-black text-white tracking-tighter">${item.title}</h3>
                </div>
            </div>
            <div class="space-y-4">
                ${item.steps.map((s, i) => `
                    <div class="flex items-start gap-5">
                        <div class="w-8 h-8 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-[10px] font-black shrink-0 mt-1">${i + 1}</div>
                        <p class="text-slate-600 font-bold leading-relaxed">${s}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function openWiki(type, id, btn) {
    const cardsContainer = document.getElementById(`${type}-cards`);
    if (!cardsContainer) return;

    const cards = cardsContainer.querySelectorAll(`[id^="${type}-"]`);
    cards.forEach(card => card.classList.add('hidden'));

    const el = document.getElementById(`${type}-${id}`);
    if (el) {
        el.classList.remove('hidden');
    }

    const pills = btn.parentElement.querySelectorAll('.category-pill');
    pills.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
}

function filterFirstAidWiki() {
    const input = document.getElementById('wiki-search');
    const nav = document.getElementById('aid-categories');
    const cardsContainer = document.getElementById('firstaid-cards');
    if (!input || !nav || !cardsContainer) return;

    const query = input.value.trim().toLowerCase();
    const pills = nav.querySelectorAll('.category-pill');

    if (!query) {
        pills.forEach(pill => pill.classList.remove('hidden'));
        const activePill = nav.querySelector('.category-pill.active') || nav.querySelector('.category-pill');
        if (activePill) {
            openWiki('firstaid', activePill.dataset.wikiId, activePill);
        }
        return;
    }

    const matchedIds = FIRST_AID_DATA
        .filter(item => {
            const inId = item.id.toLowerCase().includes(query);
            const inTitle = item.title.toLowerCase().includes(query);
            const inSteps = item.steps.some(step => step.toLowerCase().includes(query));
            return inId || inTitle || inSteps;
        })
        .map(item => item.id);

    pills.forEach(pill => {
        pill.classList.toggle('hidden', !matchedIds.includes(pill.dataset.wikiId));
    });

    if (matchedIds.length > 0) {
        const firstMatchPill = nav.querySelector(`.category-pill[data-wiki-id="${matchedIds[0]}"]`);
        if (firstMatchPill) {
            openWiki('firstaid', matchedIds[0], firstMatchPill);
        }
        return;
    }

    const cards = cardsContainer.querySelectorAll('[id^="firstaid-"]');
    cards.forEach(card => card.classList.add('hidden'));
    pills.forEach(pill => pill.classList.remove('active'));
}

function renderPersonal() {
    const list = document.getElementById('personal-list');
    if (personalContacts.length === 0) {
        list.innerHTML = `<p class="text-slate-400 text-sm italic text-center py-4">Circle is empty</p>`;
        return;
    }
    list.innerHTML = personalContacts.map((c, idx) => `
        <div class="flex items-center justify-between p-5 bg-white rounded-3xl shadow-sm">
            <div class="flex items-center">
                <div class="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center font-black mr-4">${c.name[0]}</div>
                <div>
                    <p class="font-bold text-slate-900">${c.name}</p>
                    <p class="text-xs text-slate-400">${c.num}</p>
                </div>
            </div>
            <div class="flex gap-2">
                <a href="tel:${c.num}" class="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><i class="fa-solid fa-phone"></i></a>
                <button onclick="deleteContact(${idx})" class="w-10 h-10 rounded-full bg-slate-50 text-slate-300 flex items-center justify-center"><i class="fa-solid fa-trash-can text-sm"></i></button>
            </div>
        </div>
    `).join('');
}

function renderSOSGrid() {
    const grid = document.getElementById('sos-grid');
    grid.innerHTML = CONTACTS.slice(1).map(c => `
        <a href="tel:${c.num}" class="block bg-white/10 border border-white/20 p-6 rounded-[2rem] text-center active:scale-95 transition-transform">
            <span class="block text-white/50 text-[10px] font-black uppercase tracking-widest mb-1">${c.name}</span>
            <span class="block text-white text-3xl font-black">${c.num}</span>
        </a>
    `).join('');

    const pList = document.getElementById('sos-personal-list');
    const pSec = document.getElementById('sos-personal-section');
    if (personalContacts.length > 0) {
        pSec.classList.remove('hidden');
        pList.innerHTML = personalContacts.map(c => `
            <a href="tel:${c.num}" class="flex items-center justify-between p-5 bg-white/10 rounded-2xl border border-white/10">
                <span class="text-white font-bold">${c.name}</span>
                <div class="flex items-center gap-3">
                    <span class="text-white/40 text-sm font-black">${c.num}</span>
                    <div class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white"><i class="fa-solid fa-phone text-xs"></i></div>
                </div>
            </a>
        `).join('');
    }
}

// --- HANDLERS ---
function findNearby(type) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            window.open(`https://www.google.com/maps/search/${type}/@${lat},${lon},15z`, '_blank');
        }, () => window.open(`https://www.google.com/maps/search/${type}`, '_blank'));
    } else {
        window.open(`https://www.google.com/maps/search/${type}`, '_blank');
    }
}

document.getElementById('contact-form').onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('nameInput').value;
    const num = document.getElementById('numInput').value;
    personalContacts.push({ name, num });
    localStorage.setItem('rescueContacts', JSON.stringify(personalContacts));
    renderPersonal();
    e.target.reset();
};

function deleteContact(idx) {
    personalContacts.splice(idx, 1);
    localStorage.setItem('rescueContacts', JSON.stringify(personalContacts));
    renderPersonal();
}

// --- INIT ---
window.onload = async () => {
    await loadMedicalProfileFromFile();
    renderUI();
    renderPersonal();
    renderMedicalInfo(); // Init Medical data
};
