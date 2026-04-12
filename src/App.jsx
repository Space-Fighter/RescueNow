import { useEffect, useMemo, useState } from 'react';
import { getMedicalProfile, putMedicalProfile, getContacts, putContacts, createHistoryRecord, deleteHistoryRecordFile, getRecommendedSupplements } from './medicalApi';

const EMPTY = {
  schemaVersion: 2,
  source: 'rescuenow-medical-id',
  updatedAt: '',
  patient: { bloodGroup: '', allergies: [], conditions: [] },
  emergencyDoctor: { raw: '' },
  medications: [],
  historyRecords: []
};

const parseList = (value) => String(value || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Failed to read file'));
  reader.readAsDataURL(file);
});

const formatBytes = (value) => {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const CONTACTS = [
  { name: 'National Emergency', num: '112', color: 'bg-red-600', icon: 'fa-shield-halved' },
  { name: 'Ambulance', num: '102', color: 'bg-emerald-600', icon: 'fa-truck-medical' },
  { name: 'Police', num: '100', color: 'bg-blue-600', icon: 'fa-user-shield' },
  { name: 'Fire Force', num: '101', color: 'bg-orange-600', icon: 'fa-fire' }
];

const FIRST_AID_DATA = [
  {
    id: 'heart', title: 'Cardiac Arrest (CPR)',
    steps: [ 'Confirm scene safety.', 'Check responsiveness (tap/shout).', 'If unresponsive, call 112 immediately.', 'Start chest compressions: Push hard and fast (100-120/min).', 'Allow full chest recoil between compressions.', 'Continue until help arrives or an AED is used.' ]
  },
  {
    id: 'bleed', title: 'Severe Bleeding',
    steps: [ 'Apply direct pressure with a clean cloth.', 'Keep constant pressure; do not lift to check.', 'If bleeding persists, apply a tourniquet above the wound.', 'Wrap the victim to prevent shock.', 'Elevate the wound above heart level.' ]
  },
  {
    id: 'choke', title: 'Choking (Heimlich)',
    steps: [ 'Ask "Are you choking?"', 'Stand behind them, wrap arms around waist.', 'Make a fist, place thumb-side above the navel.', 'Perform quick, upward abdominal thrusts.', 'Repeat until object is expelled or they lose consciousness.' ]
  },
  {
    id: 'burn', title: 'Serious Burns',
    steps: [ 'Stop the burn (Remove heat/fire).', 'Cool with room-temperature water for 20 mins.', 'Remove jewelry before the area swells.', 'Cover loosely with sterile plastic wrap.', 'Never apply ice, butter, or ointments.' ]
  },
  {
    id: 'stroke', title: 'Stroke (F.A.S.T)',
    steps: [ 'FACE: Ask them to smile. Does one side droop?', 'ARMS: Ask them to raise both arms. Does one drift down?', 'SPEECH: Ask them to repeat a simple phrase. Is it slurred?', 'TIME: If any signs are present, call 112 immediately.', 'Note the time when symptoms first started.' ]
  }
];

const DISASTER_DATA = [
  {
    id: 'quake', title: 'Earthquake Survival',
    steps: [ 'DROP: Get on your hands and knees.', 'COVER: Protect your head/neck under sturdy furniture.', 'HOLD ON: Stay put until the shaking stops.', 'Avoid glass, windows, and heavy objects.', 'If outdoors, move to an open area away from structures.' ]
  },
  {
    id: 'flood', title: 'Flash Flood Safety',
    steps: [ 'Move to higher ground immediately.', 'Never walk or drive through flood waters.', 'Avoid bridges over fast-moving currents.', 'If trapped in a car, climb onto the roof if water rises.', 'Stay away from downed power lines.' ]
  },
  {
    id: 'fire', title: 'House Fire Protocol',
    steps: [ 'Get out immediately. Do not stop for items.', 'Crawl low under smoke to find exits.', 'Check doors for heat before opening.', 'Stop, Drop, and Roll if your clothing catches fire.', 'Call 112 only once you are safely outside.' ]
  },
  {
    id: 'storm', title: 'Severe Storm/Cyclone',
    steps: [ 'Stay indoors in a reinforced room or basement.', 'Keep away from glass windows and doors.', 'Unplug electronic appliances.', 'Have your emergency kit and water ready.', 'Listen to radio/official alerts for updates.' ]
  }
];

const HISTORY_TAG_OPTIONS = [
  'lipid-test',
  'blood-test',
  'doctor-prescription',
  'cbc',
  'sugar-test',
  'thyroid-test',
  'x-ray',
  'mri',
  'ct-scan',
  'ecg',
  'discharge-summary',
  'vaccination-record'
];

const formatShortDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const toDisplayList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const name = String(item.name || '').trim();
          const reason = String(item.reason || item.description || item.note || '').trim();
          if (name && reason) return `${name}: ${reason}`;
          if (name) return name;
          if (reason) return reason;
          return JSON.stringify(item);
        }
        return String(item || '').trim();
      })
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const text = value.trim();
    return text ? [text] : [];
  }

  if (value && typeof value === 'object') {
    return [JSON.stringify(value)];
  }

  return [];
};

function TrendChart({ label, points }) {
  if (!Array.isArray(points) || points.length < 2) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-black text-sm tracking-tight text-slate-700">{label}</h4>
          <span className="text-xs text-slate-500 font-semibold">Need at least 2 records</span>
        </div>
      </div>
    );
  }

  const values = points.map((p) => Number(p.value)).filter((v) => Number.isFinite(v));
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const width = 100;
  const height = 36;

  const path = points.map((point, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - (((Number(point.value) - min) / span) * height);
    return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');

  const latest = points[points.length - 1];

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-black text-sm tracking-tight text-slate-700">{label}</h4>
        <span className="text-xs text-slate-500 font-semibold">Latest: {latest.value}</span>
      </div>
      <svg viewBox="0 0 100 36" className="w-full h-24">
        <path d={path} fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500 font-semibold">
        <span>{formatShortDate(points[0]?.date)}</span>
        <span>{formatShortDate(latest?.date)}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('home');
  const [wikiType, setWikiType] = useState('firstaid');
  const [activeFirstAid, setActiveFirstAid] = useState(FIRST_AID_DATA[0].id);
  const [activeDisaster, setActiveDisaster] = useState(DISASTER_DATA[0].id);
  const [wikiSearch, setWikiSearch] = useState('');
  const [sosOpen, setSosOpen] = useState(false);

  const [contacts, setContacts] = useState([]);
  const [contactName, setContactName] = useState('');
  const [contactNumber, setContactNumber] = useState('');

  const [profile, setProfile] = useState(EMPTY);
  const [error, setError] = useState('');
  const [medName, setMedName] = useState('');
  const [medTiming, setMedTiming] = useState('');
  const [allergyDraft, setAllergyDraft] = useState('');
  const [conditionDraft, setConditionDraft] = useState('');
  const [historyTitle, setHistoryTitle] = useState('');
  const [historyNotes, setHistoryNotes] = useState('');
  const [historyTags, setHistoryTags] = useState([]);
  const [historyFile, setHistoryFile] = useState(null);
  const [historySaving, setHistorySaving] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [medicalSections, setMedicalSections] = useState({
    vital: true,
    prescriptions: false,
    history: false
  });
  const [supplementData, setSupplementData] = useState(null);
  const [supplementLoading, setSupplementLoading] = useState(false);
  const [supplementError, setSupplementError] = useState('');

  useEffect(() => {
    getMedicalProfile().then(setProfile);
    getContacts().then(setContacts);
  }, []);

  useEffect(() => {
    putContacts(contacts);
  }, [contacts]);

  useEffect(() => {
    if (tab !== 'supplements') return;
    if (supplementData || supplementLoading) return;

    const loadSupplements = async () => {
      setSupplementLoading(true);
      setSupplementError('');
      try {
        const result = await getRecommendedSupplements();
        setSupplementData(result);
      } catch (err) {
        setSupplementError(err?.message || 'Unable to load recommendations.');
      } finally {
        setSupplementLoading(false);
      }
    };

    loadSupplements();
  }, [tab, supplementData, supplementLoading]);

  const refreshSupplements = async () => {
    setSupplementLoading(true);
    setSupplementError('');
    try {
      const result = await getRecommendedSupplements();
      setSupplementData(result);
    } catch (err) {
      setSupplementError(err?.message || 'Unable to refresh recommendations.');
    } finally {
      setSupplementLoading(false);
    }
  };

  const updateProfile = async (next) => {
    setProfile(next);
    try {
      setError('');
      await putMedicalProfile(next);
    } catch {
      setError('Unable to save profile to medical-profile.json');
    }
  };

  const updatePatientField = (field, value) => {
    const next = {
      ...profile,
      patient: { ...profile.patient, [field]: value }
    };
    updateProfile(next);
  };

  const addAllergies = (rawText) => {
    const incoming = parseList(rawText);
    if (incoming.length === 0) return;

    const existing = [...profile.patient.allergies];
    incoming.forEach((item) => {
      const alreadyExists = existing.some(a => a.toLowerCase() === item.toLowerCase());
      if (!alreadyExists) existing.push(item);
    });

    updatePatientField('allergies', existing);
    setAllergyDraft('');
  };

  const removeAllergy = (idx) => {
    updatePatientField('allergies', profile.patient.allergies.filter((_, i) => i !== idx));
  };

  const addConditions = (rawText) => {
    const incoming = parseList(rawText);
    if (incoming.length === 0) return;

    const existing = [...profile.patient.conditions];
    incoming.forEach((item) => {
      const alreadyExists = existing.some(c => c.toLowerCase() === item.toLowerCase());
      if (!alreadyExists) existing.push(item);
    });

    updatePatientField('conditions', existing);
    setConditionDraft('');
  };

  const removeCondition = (idx) => {
    updatePatientField('conditions', profile.patient.conditions.filter((_, i) => i !== idx));
  };

  const addMedication = (e) => {
    e.preventDefault();
    if (!medName.trim() || !medTiming.trim()) return;
    const next = {
      ...profile,
      medications: [...profile.medications, { name: medName.trim(), timing: medTiming.trim() }]
    };
    setMedName('');
    setMedTiming('');
    updateProfile(next);
  };

  const deleteMedication = (idx) => {
    const next = {
      ...profile,
      medications: profile.medications.filter((_, i) => i !== idx)
    };
    updateProfile(next);
  };

  const addHistoryRecord = async (e) => {
    e.preventDefault();
    if (!historyFile && !historyNotes.trim()) {
      setHistoryError('Choose a file or write notes to save as text.');
      return;
    }

    setHistorySaving(true);
    setHistoryError('');

    try {
      const dataUrl = historyFile ? await readAsDataUrl(historyFile) : '';
      const savedRecord = await createHistoryRecord({
        title: historyTitle.trim(),
        notes: historyNotes.trim(),
        tags: historyTags,
        fileName: historyFile?.name || '',
        mimeType: historyFile?.type || 'text/plain',
        dataUrl
      });

      await updateProfile({
        ...profile,
        historyRecords: [...(profile.historyRecords || []), savedRecord]
      });

      setHistoryTitle('');
      setHistoryNotes('');
      setHistoryTags([]);
      setHistoryFile(null);
    } catch (err) {
      setHistoryError(err?.message || 'Unable to save this record. Try again.');
    } finally {
      setHistorySaving(false);
    }
  };

  const removeHistoryRecord = async (recordToRemove) => {
    if (!recordToRemove) return;

    try {
      if (recordToRemove.filePath) {
        await deleteHistoryRecordFile(recordToRemove.filePath);
      }
    } catch {
      setHistoryError('File metadata was removed, but file deletion failed on disk.');
    }

    await updateProfile({
      ...profile,
      historyRecords: (profile.historyRecords || []).filter(record => record.id !== recordToRemove.id)
    });
  };

  const openSOS = () => setSosOpen(true);
  const closeSOS = () => setSosOpen(false);

  const addContact = (e) => {
    e.preventDefault();
    if (!contactName.trim() || !contactNumber.trim()) return;
    setContacts(prev => [...prev, { name: contactName.trim(), num: contactNumber.trim() }]);
    setContactName('');
    setContactNumber('');
  };

  const removeContact = (idx) => {
    setContacts(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleMedicalSection = (sectionKey) => {
    setMedicalSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const toggleHistoryTag = (tag) => {
    setHistoryTags(prev => (
      prev.includes(tag)
        ? prev.filter((item) => item !== tag)
        : [...prev, tag]
    ));
  };

  const findNearby = (type) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          window.open(`https://www.google.com/maps/search/${type}/@${latitude},${longitude},15z`, '_blank');
        },
        () => window.open(`https://www.google.com/maps/search/${type}`, '_blank')
      );
    } else {
      window.open(`https://www.google.com/maps/search/${type}`, '_blank');
    }
  };

  const filteredFirstAid = useMemo(() => {
    const q = wikiSearch.trim().toLowerCase();
    if (!q) return FIRST_AID_DATA;
    return FIRST_AID_DATA.filter(item => item.id.includes(q) || item.title.toLowerCase().includes(q) || item.steps.some(s => s.toLowerCase().includes(q)));
  }, [wikiSearch]);

  useEffect(() => {
    if (filteredFirstAid.length === 0) return;
    if (!filteredFirstAid.some(item => item.id === activeFirstAid)) {
      setActiveFirstAid(filteredFirstAid[0].id);
    }
  }, [filteredFirstAid, activeFirstAid]);

  const currentFirstAid = filteredFirstAid.find(item => item.id === activeFirstAid);
  const currentDisaster = DISASTER_DATA.find(item => item.id === activeDisaster);
  const supplementList = toDisplayList(supplementData?.recommendations?.supplements);
  const routineList = toDisplayList(supplementData?.recommendations?.routines);
  const cautionList = toDisplayList(supplementData?.recommendations?.caution);

  return (
    <main className="max-w-md mx-auto min-h-screen pb-24 bg-slate-50">
      {sosOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 text-white p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black tracking-tight">Emergency Broadcast</h2>
            <button onClick={closeSOS} className="w-10 h-10 rounded-full bg-white/20">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          <a href="tel:112" className="block w-full text-center bg-white text-red-600 rounded-3xl py-8 font-black text-5xl mb-4">112</a>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {CONTACTS.slice(1).map(c => (
              <a key={c.num} href={`tel:${c.num}`} className="bg-white/10 border border-white/20 rounded-2xl p-4 text-center">
                <p className="text-xs text-white/60 font-black uppercase tracking-widest">{c.name}</p>
                <p className="text-2xl font-black">{c.num}</p>
              </a>
            ))}
          </div>
          {(profile.patient.bloodGroup || profile.patient.allergies.length > 0) && (
            <div className="bg-white/10 border border-white/20 rounded-2xl p-4 mb-4">
              <p className="text-xs uppercase tracking-widest text-white/60 font-black mb-2">Medical ID</p>
              <p><span className="font-bold">Blood Group:</span> {profile.patient.bloodGroup || 'Unknown'}</p>
              <p><span className="font-bold">Allergies:</span> {profile.patient.allergies.join(', ') || 'None recorded'}</p>
            </div>
          )}
          {contacts.length > 0 && (
            <div className="space-y-2">
              {contacts.map((c, idx) => (
                <a key={`${c.name}-${idx}`} href={`tel:${c.num}`} className="flex items-center justify-between bg-white/10 rounded-xl p-3">
                  <span className="font-bold">{c.name}</span>
                  <span className="text-white/70 text-sm">{c.num}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'home' && (
        <section className="p-6 space-y-4">
          <div className="text-center pt-6">
            <h1 className="text-4xl font-black tracking-tight">RescueNow</h1>
            <p className="text-slate-500 text-xs uppercase tracking-widest font-bold mt-1">Ready for anything</p>
          </div>
          <div className="flex justify-center py-6">
            <button onClick={openSOS} className="relative w-40 h-40 rounded-full bg-red-600 text-white text-5xl font-black shadow-2xl">
              <span className="absolute inset-0 rounded-full animate-ping bg-red-500 opacity-30" />
              <span className="relative">SOS</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setTab('contacts')} className="p-5 bg-white rounded-3xl shadow text-left font-bold">Phone Circle</button>
            <button onClick={() => setTab('nearby')} className="p-5 bg-white rounded-3xl shadow text-left font-bold">Find Help</button>
          </div>
          <button onClick={() => setTab('medical')} className="w-full p-5 bg-white rounded-3xl shadow text-left font-bold">Medical Profile</button>
          <button onClick={() => setTab('supplements')} className="w-full p-5 bg-white rounded-3xl shadow text-left font-bold">Recommended Supplements</button>
          <button onClick={() => setTab('wiki')} className="w-full p-5 bg-gradient-to-r from-red-600 to-red-400 text-white rounded-3xl shadow text-left font-bold">First Aid Wiki</button>
        </section>
      )}

      {tab === 'supplements' && (
        <section className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-500 flex items-center justify-center">
                <i className="fa-solid fa-pills" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight">Recommended Supplement</h2>
                <p className="text-xs text-slate-500 font-semibold">Built from blood and lipid test history</p>
              </div>
            </div>
            <button
              type="button"
              onClick={refreshSupplements}
              disabled={supplementLoading}
              className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-wide disabled:opacity-60"
            >
              {supplementLoading ? 'Loading' : 'Refresh'}
            </button>
          </div>

          {supplementError && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl p-3 text-sm font-semibold">
              {supplementError}
            </div>
          )}

          {supplementLoading && !supplementData && (
            <div className="bg-white rounded-3xl p-6 shadow">
              <p className="font-semibold text-slate-500">Analyzing blood/lipid history...</p>
            </div>
          )}

          {!supplementLoading && supplementData && (
            <>
              <div className="bg-white rounded-3xl p-5 shadow space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Analysis Summary</h3>
                  <span className="text-[11px] text-slate-500 font-semibold">Records: {supplementData.recordsConsidered || 0}</span>
                </div>
                <p className="text-sm text-slate-700 font-semibold">
                  {supplementData.recommendations?.summary || 'No summary available.'}
                </p>
                <p className="text-[11px] text-slate-500 font-semibold">
                  Source: {supplementData.apiUsed ? 'ChatGPT API' : 'Heuristic fallback'}
                </p>
              </div>

              <div className="bg-white rounded-3xl p-5 shadow">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-3">Supplements / Medicines To Discuss</h3>
                <div className="space-y-2">
                  {supplementList.map((item, idx) => (
                    <div key={`${item}-${idx}`} className="bg-slate-50 rounded-2xl p-3 text-sm font-semibold text-slate-700">{item}</div>
                  ))}
                  {supplementList.length === 0 && (
                    <p className="text-sm text-slate-500 font-semibold">No supplement suggestions generated yet.</p>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 shadow">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-3">Routines</h3>
                <div className="space-y-2">
                  {routineList.map((item, idx) => (
                    <div key={`${item}-${idx}`} className="bg-slate-50 rounded-2xl p-3 text-sm font-semibold text-slate-700">{item}</div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 shadow">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-3">Blood / Lipid Trends</h3>
                <div className="space-y-3">
                  {Object.entries(supplementData.chartSeries || {}).map(([metric, config]) => (
                    <TrendChart key={metric} label={config.label || metric} points={config.points || []} />
                  ))}
                  {Object.keys(supplementData.chartSeries || {}).length === 0 && (
                    <p className="text-sm text-slate-500 font-semibold">No chartable numeric values were extracted from blood/lipid records yet.</p>
                  )}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
                <h3 className="text-sm font-black uppercase tracking-widest text-amber-700 mb-2">Safety</h3>
                <div className="space-y-2">
                  {cautionList.map((item, idx) => (
                    <p key={`${item}-${idx}`} className="text-sm font-semibold text-amber-800">{item}</p>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'contacts' && (
        <section className="p-6 space-y-4">
          <h2 className="text-3xl font-black tracking-tight">Phone Circle</h2>
          <div className="space-y-2">
            {CONTACTS.map(c => (
              <a key={c.num} href={`tel:${c.num}`} className="flex items-center p-4 bg-white rounded-2xl shadow-sm">
                <div className={`${c.color} w-12 h-12 rounded-2xl text-white flex items-center justify-center`}><i className={`fa-solid ${c.icon}`} /></div>
                <div className="ml-4">
                  <p className="font-bold">{c.name}</p>
                  <p className="text-xs text-slate-500 font-black tracking-widest">{c.num}</p>
                </div>
              </a>
            ))}
          </div>
          <div className="bg-white rounded-3xl p-5 shadow space-y-3">
            <h3 className="text-xs uppercase tracking-widest font-black text-slate-400">Trusted Contacts</h3>
            {contacts.map((c, i) => (
              <div key={`${c.name}-${i}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                <div>
                  <p className="font-bold">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.num}</p>
                </div>
                <div className="flex gap-2">
                  <a href={`tel:${c.num}`} className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><i className="fa-solid fa-phone" /></a>
                  <button type="button" onClick={() => removeContact(i)} className="w-9 h-9 rounded-full bg-slate-200 text-slate-500"><i className="fa-solid fa-trash-can" /></button>
                </div>
              </div>
            ))}
            <form onSubmit={addContact} className="space-y-2">
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name" className="w-full bg-slate-50 p-3 rounded-2xl font-semibold" />
              <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="Number" className="w-full bg-slate-50 p-3 rounded-2xl font-semibold" />
              <button className="w-full bg-slate-900 text-white p-3 rounded-2xl font-bold">Add to Circle</button>
            </form>
          </div>
        </section>
      )}

      {tab === 'nearby' && (
        <section className="p-6 space-y-3">
          <h2 className="text-3xl font-black tracking-tight">Locator</h2>
          <p className="text-slate-500 font-semibold">Find verified facilities nearby.</p>
          <button onClick={() => findNearby('hospital')} className="w-full p-5 bg-white rounded-3xl shadow text-left font-bold">Hospitals</button>
          <button onClick={() => findNearby('police station')} className="w-full p-5 bg-white rounded-3xl shadow text-left font-bold">Police</button>
          <button onClick={() => findNearby('fire station')} className="w-full p-5 bg-white rounded-3xl shadow text-left font-bold">Fire Brigade</button>
          <button onClick={() => findNearby('pharmacy')} className="w-full p-5 bg-white rounded-3xl shadow text-left font-bold">Pharmacies</button>
        </section>
      )}

      {tab === 'wiki' && (
        <section className="p-6 space-y-4">
          <h2 className="text-3xl font-black tracking-tight">Wiki</h2>
          <div className="flex gap-2">
            <button onClick={() => setWikiType('firstaid')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase ${wikiType === 'firstaid' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'}`}>First Aid</button>
            <button onClick={() => setWikiType('disaster')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase ${wikiType === 'disaster' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'}`}>Disaster</button>
          </div>

          {wikiType === 'firstaid' && (
            <>
              <input value={wikiSearch} onChange={(e) => setWikiSearch(e.target.value)} placeholder="Search conditions..." className="w-full bg-white p-3 rounded-2xl shadow-sm font-semibold" />
              <div className="flex gap-2 overflow-x-auto">
                {filteredFirstAid.map(item => (
                  <button key={item.id} onClick={() => setActiveFirstAid(item.id)} className={`px-4 py-2 rounded-full text-xs font-black uppercase ${activeFirstAid === item.id ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{item.id}</button>
                ))}
              </div>
              {!currentFirstAid && <p className="text-slate-400 italic">No matching conditions.</p>}
              {currentFirstAid && (
                <div className="bg-white rounded-3xl p-5 shadow space-y-3">
                  <h3 className="text-2xl font-black tracking-tight">{currentFirstAid.title}</h3>
                  {currentFirstAid.steps.map((s, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className="w-7 h-7 rounded-xl bg-slate-900 text-white text-xs font-black flex items-center justify-center shrink-0 mt-1">{i + 1}</div>
                      <p className="font-semibold text-slate-700">{s}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {wikiType === 'disaster' && (
            <>
              <div className="flex gap-2 overflow-x-auto">
                {DISASTER_DATA.map(item => (
                  <button key={item.id} onClick={() => setActiveDisaster(item.id)} className={`px-4 py-2 rounded-full text-xs font-black uppercase ${activeDisaster === item.id ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{item.id}</button>
                ))}
              </div>
              {currentDisaster && (
                <div className="bg-white rounded-3xl p-5 shadow space-y-3">
                  <h3 className="text-2xl font-black tracking-tight">{currentDisaster.title}</h3>
                  {currentDisaster.steps.map((s, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className="w-7 h-7 rounded-xl bg-slate-900 text-white text-xs font-black flex items-center justify-center shrink-0 mt-1">{i + 1}</div>
                      <p className="font-semibold text-slate-700">{s}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {tab === 'medical' && (
        <section className="px-6 py-6">
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6 shadow">
              <button
                type="button"
                onClick={() => toggleMedicalSection('vital')}
                className="w-full flex items-center justify-between mb-4"
              >
                <h2 className="font-black text-rose-500 text-xs uppercase tracking-[0.2em]">Vital Info</h2>
                <i className={`fa-solid fa-chevron-down text-slate-400 transition-transform ${medicalSections.vital ? 'rotate-180' : ''}`} />
              </button>
              {medicalSections.vital && <div className="space-y-3">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Blood Group</label>
                <select
                  value={profile.patient.bloodGroup}
                  onChange={(e) => updatePatientField('bloodGroup', e.target.value)}
                  className="w-full bg-slate-50 p-3 rounded-2xl font-semibold"
                >
                  <option value="">Blood Group: Select</option>
                  <option value="A+">A+</option><option value="A-">A-</option><option value="B+">B+</option><option value="B-">B-</option>
                  <option value="O+">O+</option><option value="O-">O-</option><option value="AB+">AB+</option><option value="AB-">AB-</option>
                </select>

                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Allergies</label>
                <div className="flex gap-2">
                  <input
                    value={allergyDraft}
                    onChange={(e) => setAllergyDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addAllergies(allergyDraft);
                      }
                    }}
                    placeholder="e.g. Peanuts"
                    className="w-full bg-slate-50 p-3 rounded-2xl font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => addAllergies(allergyDraft)}
                    className="px-4 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-wide"
                  >
                    Add
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 font-semibold">Type an allergy and press Enter to add the next one.</p>
                {profile.patient.allergies.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {profile.patient.allergies.map((allergy, idx) => (
                      <button
                        key={`${allergy}-${idx}`}
                        type="button"
                        onClick={() => removeAllergy(idx)}
                        className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center gap-2"
                        title="Remove allergy"
                      >
                        <span>{allergy}</span>
                        <i className="fa-solid fa-xmark text-[10px]" />
                      </button>
                    ))}
                  </div>
                )}

                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Medical Conditions</label>
                <div className="flex gap-2">
                  <input
                    value={conditionDraft}
                    onChange={(e) => setConditionDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addConditions(conditionDraft);
                      }
                    }}
                    placeholder="e.g. Asthma"
                    className="w-full bg-slate-50 p-3 rounded-2xl font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => addConditions(conditionDraft)}
                    className="px-4 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-wide"
                  >
                    Add
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 font-semibold">Type a condition and press Enter to add the next one.</p>
                {profile.patient.conditions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {profile.patient.conditions.map((condition, idx) => (
                      <button
                        key={`${condition}-${idx}`}
                        type="button"
                        onClick={() => removeCondition(idx)}
                        className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center gap-2"
                        title="Remove condition"
                      >
                        <span>{condition}</span>
                        <i className="fa-solid fa-xmark text-[10px]" />
                      </button>
                    ))}
                  </div>
                )}

                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Emergency Doctor</label>
                <input
                  value={profile.emergencyDoctor.raw}
                  onChange={(e) => updateProfile({ ...profile, emergencyDoctor: { raw: e.target.value } })}
                  placeholder="Doctor's Name & Number"
                  className="w-full bg-slate-50 p-3 rounded-2xl font-semibold"
                />
              </div>}
            </div>

            <div className="bg-white rounded-3xl p-6 shadow">
              <button
                type="button"
                onClick={() => toggleMedicalSection('prescriptions')}
                className="w-full flex items-center justify-between mb-4"
              >
                <h2 className="font-black text-rose-500 text-xs uppercase tracking-[0.2em]">Prescriptions</h2>
                <i className={`fa-solid fa-chevron-down text-slate-400 transition-transform ${medicalSections.prescriptions ? 'rotate-180' : ''}`} />
              </button>
              {medicalSections.prescriptions && <>
              <form onSubmit={addMedication} className="space-y-2 mb-4">
                <input value={medName} onChange={(e) => setMedName(e.target.value)} placeholder="Medicine Name:" className="w-full bg-slate-50 p-3 rounded-2xl font-semibold" />
                <input value={medTiming} onChange={(e) => setMedTiming(e.target.value)} placeholder="Dosage Timing:" className="w-full bg-slate-50 p-3 rounded-2xl font-semibold" />
                <button className="w-full bg-slate-900 text-white p-3 rounded-2xl font-bold">Add Medicine</button>
              </form>

              <div className="space-y-2">
                {profile.medications.map((m, i) => (
                  <div key={`${m.name}-${i}`} className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl">
                    <div>
                      <p className="font-bold text-slate-800">{m.name}</p>
                      <p className="text-xs text-slate-500">{m.timing}</p>
                    </div>
                    <button onClick={() => deleteMedication(i)} className="text-slate-400">
                      <i className="fa-solid fa-trash-can" />
                    </button>
                  </div>
                ))}
              </div>
              </>}
            </div>

            <div className="bg-white rounded-3xl p-4 shadow">
              <button
                type="button"
                onClick={() => toggleMedicalSection('history')}
                className="w-full flex items-center justify-between mb-4"
              >
                <h2 className="font-black text-rose-500 text-xs uppercase tracking-[0.2em]">Patient History Files</h2>
                <i className={`fa-solid fa-chevron-down text-slate-400 transition-transform ${medicalSections.history ? 'rotate-180' : ''}`} />
              </button>
              {medicalSections.history && <>
              <form onSubmit={addHistoryRecord} className="space-y-2 mb-4">
                <input
                  value={historyTitle}
                  onChange={(e) => setHistoryTitle(e.target.value)}
                  placeholder="Optional title (e.g. Blood Test Jan 2026)"
                  className="w-full bg-slate-50 p-3 rounded-2xl font-semibold"
                />
                <textarea
                  value={historyNotes}
                  onChange={(e) => setHistoryNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full bg-slate-50 p-3 rounded-2xl font-semibold min-h-20"
                />
                <div className="space-y-2">
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Choose Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {HISTORY_TAG_OPTIONS.map((tag) => {
                      const selected = historyTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleHistoryTag(tag)}
                          className={`px-3 py-1 rounded-full text-xs font-bold ${selected ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  type="file"
                  accept=".pdf,.txt,image/*"
                  onChange={(e) => {
                    const selected = e.target.files?.[0] || null;
                    setHistoryFile(selected);
                    setHistoryError('');
                  }}
                  className="w-full bg-slate-50 p-3 rounded-2xl font-semibold text-sm"
                />
                {historyFile && (
                  <p className="text-xs text-slate-500 font-semibold">
                    Selected: {historyFile.name} ({formatBytes(historyFile.size)})
                  </p>
                )}
                <button disabled={historySaving} className="w-full bg-slate-900 text-white p-3 rounded-2xl font-bold disabled:opacity-60">
                  {historySaving ? 'Saving...' : 'Save History Record'}
                </button>
                <p className="text-[11px] text-slate-400 font-semibold">Supported: PDF, TXT, and images. If no file is selected, notes are saved as a .txt file in user_files.</p>
              </form>

              <div className="space-y-2">
                {(profile.historyRecords || []).length === 0 && (
                  <p className="text-xs text-slate-400 font-semibold">No history files saved yet.</p>
                )}

                {(profile.historyRecords || []).map((record) => (
                  <div key={record.id} className="bg-slate-50 p-3 rounded-2xl">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{record.title || record.fileName}</p>
                        <p className="text-[11px] text-slate-500">{record.fileName} • {record.fileType || 'unknown'} • {formatBytes(record.size)} • {new Date(record.uploadedAt).toLocaleString()}</p>
                        {record.filePath && <p className="text-[11px] text-slate-500">Path: {record.filePath}</p>}
                        {Array.isArray(record.tags) && record.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {record.tags.map((tag, idx) => (
                              <span key={`${tag}-${idx}`} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-600">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {record.notes && <p className="text-xs text-slate-500 mt-1">{record.notes}</p>}
                      </div>
                      <button type="button" onClick={() => removeHistoryRecord(record)} className="text-slate-400 hover:text-red-500">
                        <i className="fa-solid fa-trash-can" />
                      </button>
                    </div>

                    <div className="flex gap-2 mt-2">
                      <a
                        href={record.filePath ? `/${record.filePath}` : record.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs px-3 py-1 rounded-full bg-white font-bold text-slate-700"
                      >
                        View
                      </a>
                      <a
                        href={record.filePath ? `/${record.filePath}` : record.dataUrl}
                        download={record.fileName}
                        className="text-xs px-3 py-1 rounded-full bg-white font-bold text-slate-700"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              {historyError && <p className="text-xs font-semibold text-red-500 mt-2">{historyError}</p>}
              </>}
            </div>

            <div className="bg-white rounded-3xl p-4 shadow">
              {error && <p className="text-xs font-semibold text-red-500 mt-1">{error}</p>}
            </div>
          </div>
        </section>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 z-40">
        <div className="max-w-md mx-auto flex justify-around py-3">
          {[
            { id: 'home', icon: 'fa-house-chimney-crack', label: 'Home' },
            { id: 'contacts', icon: 'fa-phone-volume', label: 'Circle' },
            { id: 'medical', icon: 'fa-notes-medical', label: 'Medical' },
            { id: 'supplements', icon: 'fa-pills', label: 'Supps' },
            { id: 'nearby', icon: 'fa-location-arrow', label: 'Maps' },
            { id: 'wiki', icon: 'fa-briefcase-medical', label: 'Wiki' }
          ].map(item => (
            <button key={item.id} onClick={() => setTab(item.id)} className={`flex flex-col items-center gap-1 ${tab === item.id ? 'text-red-600' : 'text-slate-400'}`}>
              <i className={`fa-solid ${item.icon}`} />
              <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
