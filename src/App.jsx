import { useEffect, useMemo, useState } from 'react';
import exerciseCatalog from './exerciseCatalog.json';
import {
  createHistoryRecord,
  deleteHistoryRecordFile,
  generateAIRoutines,
  getContacts,
  getMedicalProfile,
  getRecommendedSupplements,
  getRoutines,
  putContacts,
  putMedicalProfile,
  putRoutines,
  sortRoutines
} from './medicalApi';

const EMPTY = {
  schemaVersion: 2,
  source: 'heartify-medical-id',
  updatedAt: '',
  patient: { bloodGroup: '', allergies: [], conditions: [] },
  emergencyDoctor: { raw: '' },
  medications: [],
  historyRecords: []
};

const ROUTINE_TYPES = ['Exercise', 'Supplement', 'Study', 'Custom'];
const FOCUS_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

const CONTACTS = [
  { name: 'National Emergency', num: '112', color: 'bg-red-600', icon: 'fa-shield-halved' },
  { name: 'Ambulance', num: '102', color: 'bg-emerald-600', icon: 'fa-truck-medical' },
  { name: 'Police', num: '100', color: 'bg-blue-600', icon: 'fa-user-shield' },
  { name: 'Fire Force', num: '101', color: 'bg-orange-600', icon: 'fa-fire' }
];

const FIRST_AID_DATA = [
  {
    id: 'heart',
    title: 'Cardiac Arrest (CPR)',
    steps: ['Confirm scene safety.', 'Check responsiveness (tap/shout).', 'If unresponsive, call 112 immediately.', 'Start chest compressions: Push hard and fast (100-120/min).', 'Allow full chest recoil between compressions.', 'Continue until help arrives or an AED is used.']
  },
  {
    id: 'bleed',
    title: 'Severe Bleeding',
    steps: ['Apply direct pressure with a clean cloth.', 'Keep constant pressure; do not lift to check.', 'If bleeding persists, apply a tourniquet above the wound.', 'Wrap the victim to prevent shock.', 'Elevate the wound above heart level.']
  },
  {
    id: 'choke',
    title: 'Choking (Heimlich)',
    steps: ['Ask "Are you choking?"', 'Stand behind them, wrap arms around waist.', 'Make a fist, place thumb-side above the navel.', 'Perform quick, upward abdominal thrusts.', 'Repeat until object is expelled or they lose consciousness.']
  },
  {
    id: 'burn',
    title: 'Serious Burns',
    steps: ['Stop the burn (Remove heat/fire).', 'Cool with room-temperature water for 20 mins.', 'Remove jewelry before the area swells.', 'Cover loosely with sterile plastic wrap.', 'Never apply ice, butter, or ointments.']
  },
  {
    id: 'stroke',
    title: 'Stroke (F.A.S.T)',
    steps: ['FACE: Ask them to smile. Does one side droop?', 'ARMS: Ask them to raise both arms. Does one drift down?', 'SPEECH: Ask them to repeat a simple phrase. Is it slurred?', 'TIME: If any signs are present, call 112 immediately.', 'Note the time when symptoms first started.']
  }
];

const DISASTER_DATA = [
  {
    id: 'quake',
    title: 'Earthquake Survival',
    steps: ['DROP: Get on your hands and knees.', 'COVER: Protect your head/neck under sturdy furniture.', 'HOLD ON: Stay put until the shaking stops.', 'Avoid glass, windows, and heavy objects.', 'If outdoors, move to an open area away from structures.']
  },
  {
    id: 'flood',
    title: 'Flash Flood Safety',
    steps: ['Move to higher ground immediately.', 'Never walk or drive through flood waters.', 'Avoid bridges over fast-moving currents.', 'If trapped in a car, climb onto the roof if water rises.', 'Stay away from downed power lines.']
  },
  {
    id: 'fire',
    title: 'House Fire Protocol',
    steps: ['Get out immediately. Do not stop for items.', 'Crawl low under smoke to find exits.', 'Check doors for heat before opening.', 'Stop, Drop, and Roll if your clothing catches fire.', 'Call 112 only once you are safely outside.']
  },
  {
    id: 'storm',
    title: 'Severe Storm/Cyclone',
    steps: ['Stay indoors in a reinforced room or basement.', 'Keep away from glass windows and doors.', 'Unplug electronic appliances.', 'Have your emergency kit and water ready.', 'Listen to radio/official alerts for updates.']
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

const parseList = (value) => String(value || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Failed to read file'));
  reader.readAsDataURL(file);
});

const formatBytes = (value) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const formatShortDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const formatTimer = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const getYoutubeEmbedUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }

    if (parsed.hostname.includes('youtube.com')) {
      const videoId = parsed.searchParams.get('v');
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;

      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (pathParts[0] === 'shorts' && pathParts[1]) {
        return `https://www.youtube.com/embed/${pathParts[1]}`;
      }
    }
  } catch {
    return '';
  }

  return '';
};

const getRandomCatalogItem = (items) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] || null;
};

const timeToMinutes = (value) => {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return (Number(match[1]) * 60) + Number(match[2]);
};

const compareTime = (a, b) => timeToMinutes(a) - timeToMinutes(b);

const buildRoutineDraft = (routine = null) => ({
  id: routine?.id || '',
  name: routine?.name || '',
  type: routine?.type || 'Custom',
  startTime: routine?.startTime || '07:00',
  endTime: routine?.endTime || '07:30',
  description: routine?.description || ''
});

const getRoutineColors = (type) => {
  if (type === 'Exercise') {
    return {
      badge: 'bg-blue-100 text-blue-700',
      card: 'border-blue-200 bg-blue-50/50'
    };
  }
  if (type === 'Supplement') {
    return {
      badge: 'bg-emerald-100 text-emerald-700',
      card: 'border-emerald-200 bg-emerald-50/50'
    };
  }
  if (type === 'Study') {
    return {
      badge: 'bg-violet-100 text-violet-700',
      card: 'border-violet-200 bg-violet-50/50'
    };
  }
  return {
    badge: 'bg-slate-200 text-slate-700',
    card: 'border-slate-200 bg-white'
  };
};

const AHA_RANGES = {
  total_cholesterol: {
    label: 'Total Cholesterol',
    unit: 'mg/dL',
    low: '< 200',
    normal: '200 - 239',
    high: '>= 240',
    note: 'Desirable is below 200 mg/dL.'
  },
  ldl: {
    label: 'LDL',
    unit: 'mg/dL',
    low: '< 100',
    normal: '100 - 129',
    high: '>= 130',
    note: 'Lower is better for LDL.'
  },
  hdl: {
    label: 'HDL',
    unit: 'mg/dL',
    low: '< 40',
    normal: '40 - 59',
    high: '>= 60',
    note: '40 mg/dL or higher is generally preferred; 60+ is protective.'
  },
  triglycerides: {
    label: 'Triglycerides',
    unit: 'mg/dL',
    low: '< 150',
    normal: '150 - 199',
    high: '>= 200',
    note: 'Aim to stay below 150 mg/dL.'
  },
  fasting_glucose: {
    label: 'Fasting Glucose',
    unit: 'mg/dL',
    low: '< 70',
    normal: '70 - 99',
    high: '>= 100',
    note: 'Normal fasting glucose is usually 70-99 mg/dL.'
  },
  hba1c: {
    label: 'HbA1c',
    unit: '%',
    low: '< 5.7',
    normal: '5.7 - 6.4',
    high: '>= 6.5',
    note: 'AHA-aligned diabetes risk discussions often start above 5.7%.'
  },
  hemoglobin: {
    label: 'Hemoglobin',
    unit: 'g/dL',
    low: 'Below range',
    normal: 'Within range',
    high: 'Above range',
    note: 'Lab-specific reference ranges vary by sex and age.'
  }
};

const AHA_ADVICE = {
  total_cholesterol: {
    low: 'If cholesterol is already low, maintain a balanced diet with healthy fats from nuts, seeds, olive oil, and fish.',
    normal: 'Keep up fiber-rich meals, regular movement, and weight management to stay in range.',
    high: 'Reduce fried foods, butter, and high saturated-fat meals. Increase soluble fiber from oats, beans, apples, and vegetables. Regular cardio can help lower levels.'
  },
  ldl: {
    low: 'A low LDL is generally favorable. Continue your current habits and avoid unnecessary restrictive dieting.',
    normal: 'Maintain a heart-healthy diet with vegetables, legumes, whole grains, and regular exercise.',
    high: 'Focus on soluble fiber, nuts, seeds, olive oil, and fewer processed foods. Discuss omega-3s, psyllium, or clinician-guided therapy if needed.'
  },
  hdl: {
    low: 'To raise HDL, aim for brisk walking, cycling, strength training, healthy fats, nuts, avocado, and fatty fish. Avoid smoking.',
    normal: 'Maintain consistent exercise, a balanced diet, and healthy body weight to preserve HDL.',
    high: 'High HDL is usually protective. Keep your current exercise and diet habits steady.'
  },
  triglycerides: {
    low: 'Low triglycerides are generally favorable. Keep a balanced diet and regular activity.',
    normal: 'Stay consistent with limiting sugary drinks, refined carbs, and excess alcohol.',
    high: 'Cut back on sugar, white flour, sweets, and alcohol. Add omega-3 rich foods like salmon, sardines, chia, and flax. Daily walking after meals can help.'
  },
  fasting_glucose: {
    low: 'If you feel shaky or weak, discuss symptoms with a clinician. Otherwise, keep meals balanced with protein and complex carbs.',
    normal: 'Maintain balanced meals, portion control, regular activity, and consistent sleep.',
    high: 'Reduce refined carbs and sugary drinks, add more fiber and protein, and walk for 10-20 minutes after meals. Speak with your doctor if the pattern continues.'
  },
  hba1c: {
    low: 'No special correction is usually needed unless your clinician has raised concerns.',
    normal: 'Keep a stable routine with balanced meals, movement, and sleep.',
    high: 'Use a low-glycemic pattern with vegetables, legumes, protein, and fiber. Exercise regularly and limit sweets, refined grains, and sugary beverages.'
  },
  hemoglobin: {
    low: 'Add iron-rich foods such as spinach, lentils, beans, eggs, meat, and vitamin C foods to support absorption. Iron supplements should only be taken with medical advice.',
    normal: 'Maintain a balanced diet and regular checkups.',
    high: 'Stay hydrated and discuss persistent elevation with a clinician, especially if you have other symptoms.'
  }
};

function TrendChart({ label, points, metricKey = '' }) {
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
  const safeMetricKey = String(metricKey || label || '').toLowerCase();
  const rangeInfo = AHA_RANGES[safeMetricKey] || {
    label,
    unit: 'mg/dL',
    low: 'Check lab range',
    normal: 'Check lab range',
    high: 'Check lab range',
    note: 'Use the reference range reported by the lab for this parameter.'
  };
  const advice = AHA_ADVICE[safeMetricKey] || {
    low: 'Use your lab report and doctor guidance to interpret a low result.',
    normal: 'Maintain healthy diet, movement, sleep, and periodic monitoring.',
    high: 'Reduce risk factors, review diet and lifestyle, and discuss the result with your clinician.'
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-black text-sm tracking-tight text-slate-700">{label}</h4>
        <span className="text-xs text-slate-500 font-semibold">Latest: {latest.value}</span>
      </div>
      <svg viewBox="0 0 100 36" className="w-full h-24">
        <path d={path} fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
        <span>{formatShortDate(points[0]?.date)}</span>
        <span>{formatShortDate(latest?.date)}</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">AHA Range Table</p>
            <span className="text-[10px] font-semibold text-slate-500">{rangeInfo.unit}</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Level</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Range</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                <tr>
                  <td className="px-3 py-2 font-bold text-amber-700">Low</td>
                  <td className="px-3 py-2">{rangeInfo.low}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-bold text-emerald-700">Normal</td>
                  <td className="px-3 py-2">{rangeInfo.normal}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-bold text-red-700">High</td>
                  <td className="px-3 py-2">{rangeInfo.high}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{rangeInfo.note}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">What To Do If</p>
          <div className="space-y-2 text-sm leading-relaxed text-slate-700">
            <p><span className="font-bold text-amber-700">Low:</span> {advice.low}</p>
            <p><span className="font-bold text-emerald-700">Normal:</span> {advice.normal}</p>
            <p><span className="font-bold text-red-700">High:</span> {advice.high}</p>
          </div>
        </div>
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

  const [routines, setRoutines] = useState([]);
  const [routineLoading, setRoutineLoading] = useState(false);
  const [routineSaving, setRoutineSaving] = useState(false);
  const [routineError, setRoutineError] = useState('');
  const [routineFilter, setRoutineFilter] = useState('All');
  const [routineModalOpen, setRoutineModalOpen] = useState(false);
  const [routineDraft, setRoutineDraft] = useState(buildRoutineDraft());
  const [routinesLoaded, setRoutinesLoaded] = useState(false);
  const [reminderHidden, setReminderHidden] = useState(false);
  const [currentClockMinutes, setCurrentClockMinutes] = useState(() => {
    const now = new Date();
    return (now.getHours() * 60) + now.getMinutes();
  });
  const [timerMode, setTimerMode] = useState('focus');
  const [timeLeft, setTimeLeft] = useState(FOCUS_SECONDS);
  const [timerRunning, setTimerRunning] = useState(false);
  const [focusFinished, setFocusFinished] = useState(false);
  const [breakFinished, setBreakFinished] = useState(false);
  const [timerMessage, setTimerMessage] = useState('Tap the timer to begin a 25-minute focus session.');
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogType, setCatalogType] = useState('All');
  const [catalogDifficulty, setCatalogDifficulty] = useState('All');
  const [catalogMuscleGroup, setCatalogMuscleGroup] = useState('All');

  useEffect(() => {
    getMedicalProfile().then(setProfile);
    getContacts().then(setContacts);
    getRoutines().then((data) => {
      setRoutines(data);
      setRoutinesLoaded(true);
    });
  }, []);

  useEffect(() => {
    putContacts(contacts);
  }, [contacts]);

  useEffect(() => {
    if (tab !== 'analysis') return;
    if (supplementData || supplementLoading) return;
    void loadSupplements();
  }, [tab, supplementData, supplementLoading]);

  useEffect(() => {
    if (!timerRunning) return undefined;

    const intervalId = window.setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          window.clearInterval(intervalId);
          setTimerRunning(false);

          if (timerMode === 'focus') {
            setFocusFinished(true);
            setBreakFinished(false);
            setTimerMessage('Pomodoro complete. Start a 5-minute recovery break or jump into another session.');
          } else {
            setBreakFinished(true);
            setFocusFinished(false);
            setTimerMode('focus');
            setTimeLeft(FOCUS_SECONDS);
            setTimerMessage('Break complete. Start another Pomodoro when you are ready.');
          }

          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [timerRunning, timerMode]);

  useEffect(() => {
    const updateCurrentMinutes = () => {
      const now = new Date();
      setCurrentClockMinutes((now.getHours() * 60) + now.getMinutes());
    };

    updateCurrentMinutes();
    const intervalId = window.setInterval(updateCurrentMinutes, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (tab !== 'routines') return;
    if (!routinesLoaded || routineLoading) return;
    if (routines.length > 0) return;
    void generateRoutineFromAI();
  }, [tab, routinesLoaded, routineLoading, routines.length]);

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

  const refreshSupplements = async () => {
    await loadSupplements();
  };

  const persistRoutines = async (nextRoutines) => {
    setRoutineSaving(true);
    setRoutineError('');
    try {
      const saved = await putRoutines(nextRoutines);
      setRoutines(saved);
      return saved;
    } catch (err) {
      setRoutineError(err?.message || 'Unable to save routines.');
      throw err;
    } finally {
      setRoutineSaving(false);
    }
  };

  const updateProfile = async (next) => {
    setProfile(next);
    try {
      setError('');
      await putMedicalProfile(next);
      setSupplementData(null);
    } catch {
      setError('Unable to save profile to medical-profile.json');
    }
  };

  const updatePatientField = (field, value) => {
    const next = {
      ...profile,
      patient: { ...profile.patient, [field]: value }
    };
    void updateProfile(next);
  };

  const addAllergies = (rawText) => {
    const incoming = parseList(rawText);
    if (incoming.length === 0) return;

    const existing = [...profile.patient.allergies];
    incoming.forEach((item) => {
      const alreadyExists = existing.some((a) => a.toLowerCase() === item.toLowerCase());
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
      const alreadyExists = existing.some((c) => c.toLowerCase() === item.toLowerCase());
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
    void updateProfile(next);
  };

  const deleteMedication = (idx) => {
    const next = {
      ...profile,
      medications: profile.medications.filter((_, i) => i !== idx)
    };
    void updateProfile(next);
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
      historyRecords: (profile.historyRecords || []).filter((record) => record.id !== recordToRemove.id)
    });
  };

  const addContact = (e) => {
    e.preventDefault();
    if (!contactName.trim() || !contactNumber.trim()) return;
    setContacts((prev) => [...prev, { name: contactName.trim(), num: contactNumber.trim() }]);
    setContactName('');
    setContactNumber('');
  };

  const removeContact = (idx) => {
    setContacts((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleMedicalSection = (sectionKey) => {
    setMedicalSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const toggleHistoryTag = (tag) => {
    setHistoryTags((prev) => (
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
    return FIRST_AID_DATA.filter((item) => item.id.includes(q) || item.title.toLowerCase().includes(q) || item.steps.some((s) => s.toLowerCase().includes(q)));
  }, [wikiSearch]);

  useEffect(() => {
    if (filteredFirstAid.length === 0) return;
    if (!filteredFirstAid.some((item) => item.id === activeFirstAid)) {
      setActiveFirstAid(filteredFirstAid[0].id);
    }
  }, [filteredFirstAid, activeFirstAid]);

  const openRoutineModal = (routine = null) => {
    setRoutineDraft(buildRoutineDraft(routine));
    setRoutineModalOpen(true);
  };

  const closeRoutineModal = () => {
    setRoutineModalOpen(false);
    setRoutineDraft(buildRoutineDraft());
  };

  const saveRoutineDraft = async (e) => {
    e.preventDefault();
    if (!routineDraft.name.trim()) {
      setRoutineError('Routine name is required.');
      return;
    }

    const nextRoutine = {
      ...routineDraft,
      name: routineDraft.name.trim(),
      description: routineDraft.description.trim(),
      source: routineDraft.id ? (routines.find((item) => item.id === routineDraft.id)?.source || 'manual') : 'manual'
    };

    const nextRoutines = routineDraft.id
      ? routines.map((item) => (item.id === routineDraft.id ? { ...item, ...nextRoutine } : item))
      : [...routines, { ...nextRoutine, id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}` }];

    await persistRoutines(sortRoutines(nextRoutines));
    closeRoutineModal();
  };

  const deleteRoutine = async (routineId) => {
    await persistRoutines(routines.filter((item) => item.id !== routineId));
  };

  const generateRoutineFromAI = async () => {
    setRoutineLoading(true);
    setRoutineError('');
    try {
      const payload = {
        preferredStartTime: routines[0]?.startTime || '06:30',
        patient: profile.patient,
        medications: profile.medications,
        historyRecordCount: profile.historyRecords.length
      };
      const result = await generateAIRoutines(payload);
      setRoutines(result.routines);
      if (result.analysis) {
        setSupplementData(result.analysis);
      }
      setTab('routines');
    } catch (err) {
      setRoutineError(err?.message || 'Unable to generate routines.');
    } finally {
      setRoutineLoading(false);
    }
  };

  const pickRandomActivity = () => {
    const nextActivity = getRandomCatalogItem(exerciseCatalog);
    if (nextActivity) {
      setSelectedActivity(nextActivity);
      setShowCatalog(false);
    }
  };

  const startFocusSession = () => {
    setTimerMode('focus');
    setTimeLeft(FOCUS_SECONDS);
    setTimerRunning(true);
    setFocusFinished(false);
    setBreakFinished(false);
    setTimerMessage('Focus mode is on. Stay with one task until the timer ends.');
  };

  const startBreakSession = () => {
    setTimerMode('break');
    setTimeLeft(BREAK_SECONDS);
    setTimerRunning(true);
    setFocusFinished(false);
    setBreakFinished(false);
    if (!selectedActivity) {
      const nextActivity = getRandomCatalogItem(exerciseCatalog);
      if (nextActivity) setSelectedActivity(nextActivity);
    }
    setTimerMessage('Recovery break started. Follow the suggested activity or choose one from the catalog.');
  };

  const toggleTimerFromHome = () => {
    if (timerMode === 'focus' && !timerRunning && timeLeft === FOCUS_SECONDS && !focusFinished) {
      startFocusSession();
      return;
    }

    if (timerMode === 'break' && !timerRunning && timeLeft === BREAK_SECONDS) {
      startBreakSession();
      return;
    }

    if (timerRunning) {
      setTimerRunning(false);
      setTimerMessage(timerMode === 'focus' ? 'Pomodoro paused.' : 'Break paused.');
      return;
    }

    if (timeLeft > 0) {
      setTimerRunning(true);
      setTimerMessage(timerMode === 'focus' ? 'Pomodoro resumed.' : 'Break resumed.');
      return;
    }

    if (focusFinished) {
      startBreakSession();
      return;
    }

    startFocusSession();
  };

  const currentFirstAid = filteredFirstAid.find((item) => item.id === activeFirstAid);
  const currentDisaster = DISASTER_DATA.find((item) => item.id === activeDisaster);
  const supplementList = Array.isArray(supplementData?.recommendations?.supplements) ? supplementData.recommendations.supplements : [];
  const cautionList = Array.isArray(supplementData?.recommendations?.caution) ? supplementData.recommendations.caution : [];
  const closestRoutine = useMemo(() => {
    if (!Array.isArray(routines) || routines.length === 0) return null;

    let bestRoutine = null;
    let bestDelta = Number.MAX_SAFE_INTEGER;

    routines.forEach((routine) => {
      const startMinutes = timeToMinutes(routine.startTime);
      if (!Number.isFinite(startMinutes) || startMinutes === Number.MAX_SAFE_INTEGER) return;

      const directDelta = Math.abs(startMinutes - currentClockMinutes);
      const wrapDelta = 1440 - directDelta;
      const nearestDelta = Math.min(directDelta, wrapDelta);

      if (nearestDelta < bestDelta) {
        bestDelta = nearestDelta;
        bestRoutine = {
          ...routine,
          minutesAway: nearestDelta
        };
      }
    });

    return bestRoutine;
  }, [routines, currentClockMinutes]);
  const breakModeVisible = timerMode === 'break' || focusFinished || breakFinished;
  const catalogTypes = ['All', ...new Set(exerciseCatalog.map((item) => item.Exercise_type))];
  const catalogDifficulties = ['All', ...new Set(exerciseCatalog.map((item) => item.Difficulty))];
  const catalogMuscleGroups = useMemo(() => {
    const values = exerciseCatalog.flatMap((item) => item.Muscle_groups || []);
    return ['All', ...new Set(values)];
  }, []);
  const filteredActivities = useMemo(() => (
    exerciseCatalog.filter((item) => {
      if (catalogType !== 'All' && item.Exercise_type !== catalogType) return false;
      if (catalogDifficulty !== 'All' && item.Difficulty !== catalogDifficulty) return false;

      const needsMuscleGroupFilter = catalogType === 'Strengthening' || catalogType === 'Stretching';
      if (needsMuscleGroupFilter && catalogMuscleGroup !== 'All' && !(item.Muscle_groups || []).includes(catalogMuscleGroup)) {
        return false;
      }

      return true;
    })
  ), [catalogType, catalogDifficulty, catalogMuscleGroup]);
  const selectedActivityEmbed = getYoutubeEmbedUrl(selectedActivity?.Youtube_Video);

  const routineCards = useMemo(() => {
    const sorted = [...routines].sort((a, b) => compareTime(a.startTime, b.startTime));

    if (routineFilter === 'All') return sorted;
    return sorted.filter((item) => item.type === routineFilter);
  }, [routines, routineFilter]);

  return (
    <main className="max-w-md mx-auto min-h-screen pb-24 bg-slate-50">
      {tab === 'home' && (
        <section className="p-6 space-y-4">
          <div className="text-center pt-6">
            <h1 className="text-4xl font-black tracking-tight">Heartify</h1>
            <p className="text-slate-500 text-xs uppercase tracking-widest font-bold mt-1">Focus meets health</p>
          </div>

          <div className="bg-gradient-to-br from-rose-100 via-white to-emerald-100 rounded-[2.5rem] p-6 border border-white shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-500 text-center">
              {timerMode === 'focus' && !focusFinished ? 'Pomodoro Session' : 'Break Session'}
            </p>
            <button
              type="button"
              onClick={toggleTimerFromHome}
              className="w-72 h-72 max-w-full mx-auto mt-5 rounded-full bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)] border-[10px] border-rose-100 flex flex-col items-center justify-center text-slate-900 active:scale-[0.99] transition-transform"
            >
              <span className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">
                {timerRunning ? (timerMode === 'focus' ? 'In Focus' : 'On Break') : 'Tap To Start'}
              </span>
              <span className="text-6xl font-black tracking-tight mt-3">{formatTimer(timeLeft)}</span>
              <span className="text-sm font-bold text-slate-500 mt-3">
                {timerMode === 'focus' && !focusFinished ? '25 minute focus block' : '5 minute recovery block'}
              </span>
            </button>
            <p className="text-center text-sm font-semibold text-slate-600 mt-5">{timerMessage}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={startFocusSession}
              className="p-4 rounded-2xl bg-slate-900 text-white text-left font-bold"
            >
              Start Pomodoro
            </button>
            <button
              type="button"
              onClick={startBreakSession}
              className="p-4 rounded-2xl bg-emerald-500 text-white text-left font-bold"
            >
              Start 5 Min Break
            </button>
          </div>

          {!reminderHidden && closestRoutine && (
            <div className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-500">Reminder</p>
                  <h2 className="text-xl font-black mt-2">{closestRoutine.name}</h2>
                  <p className="text-sm text-slate-500 font-semibold mt-1">
                    {closestRoutine.startTime} - {closestRoutine.endTime} · {closestRoutine.type}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReminderHidden(true)}
                  className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 text-lg"
                  aria-label="Hide reminder"
                  title="Hide reminder"
                >
                  👁
                </button>
              </div>
              <p className="text-sm text-slate-600 font-medium mt-3">
                {closestRoutine.minutesAway === 0
                  ? 'This routine is happening right now.'
                  : `This is the closest routine to your current time, about ${closestRoutine.minutesAway} minute${closestRoutine.minutesAway === 1 ? '' : 's'} away.`}
              </p>
              {closestRoutine.description && (
                <p className="text-sm text-slate-500 mt-2">{closestRoutine.description}</p>
              )}
            </div>
          )}

          {reminderHidden && closestRoutine && (
            <button
              type="button"
              onClick={() => setReminderHidden(false)}
              className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-3 text-sm font-black text-slate-700"
            >
              👁 Show Reminder
            </button>
          )}

          {focusFinished && (
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={startBreakSession}
                className="w-full rounded-2xl bg-emerald-500 text-white px-4 py-4 font-black text-sm"
              >
                Start 5 Minute Break
              </button>
              <button
                type="button"
                onClick={startFocusSession}
                className="w-full rounded-2xl bg-slate-100 text-slate-800 px-4 py-4 font-black text-sm"
              >
                Do Another Pomodoro
              </button>
            </div>
          )}

          {breakModeVisible && (
            <>
              <div className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-500">Mystery Box</p>
                    <h2 className="text-2xl font-black mt-2">Pick a healthy break activity</h2>
                    <p className="text-sm text-slate-500 font-semibold mt-1">Get a random exercise, stretch, or meditation for your break.</p>
                  </div>
                  <button
                    type="button"
                    onClick={pickRandomActivity}
                    className="w-16 h-16 rounded-[1.4rem] bg-amber-100 text-amber-600 flex items-center justify-center text-2xl"
                    title="Open mystery box"
                  >
                    <i className="fa-solid fa-gift" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button
                    type="button"
                    onClick={pickRandomActivity}
                    className="rounded-2xl bg-amber-500 text-white px-4 py-3 font-black text-sm"
                  >
                    Roll The Dice
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCatalog((current) => !current)}
                    className="rounded-2xl bg-slate-100 text-slate-800 px-4 py-3 font-black text-sm"
                  >
                    Choose Activity
                  </button>
                </div>
              </div>

              {showCatalog && (
                <div className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-200 space-y-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Activity Catalog</p>
                    <h3 className="text-xl font-black mt-2">Filter your break activity</h3>
                  </div>

                  <select value={catalogType} onChange={(e) => setCatalogType(e.target.value)} className="w-full bg-slate-50 p-3 rounded-2xl font-semibold">
                    {catalogTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>

                  <select value={catalogDifficulty} onChange={(e) => setCatalogDifficulty(e.target.value)} className="w-full bg-slate-50 p-3 rounded-2xl font-semibold">
                    {catalogDifficulties.map((difficulty) => (
                      <option key={difficulty} value={difficulty}>{difficulty}</option>
                    ))}
                  </select>

                  {(catalogType === 'Strengthening' || catalogType === 'Stretching') && (
                    <select value={catalogMuscleGroup} onChange={(e) => setCatalogMuscleGroup(e.target.value)} className="w-full bg-slate-50 p-3 rounded-2xl font-semibold">
                      {catalogMuscleGroups.map((group) => (
                        <option key={group} value={group}>{group}</option>
                      ))}
                    </select>
                  )}

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {filteredActivities.map((item) => (
                      <button
                        key={item.Exercise_ID}
                        type="button"
                        onClick={() => {
                          setSelectedActivity(item);
                          setShowCatalog(false);
                        }}
                        className="w-full text-left bg-slate-50 rounded-2xl p-4 border border-slate-200"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-black text-slate-800">{item.Exercise_Name}</p>
                          <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">{item.Difficulty}</span>
                        </div>
                        <p className="text-xs text-slate-500 font-semibold mt-1">{item.Exercise_type}</p>
                        <p className="text-xs text-slate-500 mt-2">{item.Muscle_groups.join(', ')}</p>
                      </button>
                    ))}
                    {filteredActivities.length === 0 && (
                      <p className="text-sm text-slate-500 font-semibold">No activities match the selected filters.</p>
                    )}
                  </div>
                </div>
              )}

              {selectedActivity && (
                <div className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-500">Selected Activity</p>
                      <h3 className="text-2xl font-black mt-2">{selectedActivity.Exercise_Name}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={pickRandomActivity}
                      className="px-4 py-2 rounded-2xl bg-slate-100 text-slate-800 font-black text-sm"
                    >
                      Roll Again
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-black uppercase tracking-wide">{selectedActivity.Exercise_type}</span>
                    <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-wide">{selectedActivity.Difficulty}</span>
                    {selectedActivity.Muscle_groups.map((group) => (
                      <span key={group} className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-black uppercase tracking-wide">{group}</span>
                    ))}
                  </div>

                  {selectedActivityEmbed ? (
                    <div className="rounded-[1.5rem] overflow-hidden bg-slate-950 aspect-video">
                      <iframe
                        className="w-full h-full"
                        src={selectedActivityEmbed}
                        title={selectedActivity.Exercise_Name}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <a
                      href={selectedActivity.Youtube_Video}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex px-4 py-3 rounded-2xl bg-slate-900 text-white font-black text-sm"
                    >
                      Open Video
                    </a>
                  )}
                </div>
              )}

              {breakFinished && (
                <button
                  type="button"
                  onClick={startFocusSession}
                  className="w-full rounded-2xl bg-slate-900 text-white px-4 py-4 font-black text-sm"
                >
                  Start Pomodoro Again
                </button>
              )}
            </>
          )}
        </section>
      )}

      {tab === 'analysis' && (
        <section className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-500 flex items-center justify-center">
                <i className="fa-solid fa-chart-line" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight">Analysis</h2>
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
                  Source: {supplementData.apiUsed ? 'ChatGPT API' : 'Heuristic fallback'} {supplementData.cached ? '· Cached' : ''}
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
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Blood / Lipid Trends</h3>
                  <button onClick={() => setTab('routines')} className="text-xs font-black uppercase tracking-wide text-red-500">Go To Routines</button>
                </div>
                <div className="space-y-3">
                  {Object.entries(supplementData.chartSeries || {}).map(([metric, config]) => (
                    <TrendChart key={metric} label={config.label || metric} points={config.points || []} metricKey={metric} />
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

      {tab === 'routines' && (
        <section className="p-6 space-y-4">
          <div className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-3xl font-black tracking-tight">Daily Routines</h2>
                <p className="text-sm text-slate-500 font-semibold mt-1">Auto-generated from your medical analysis and always sorted by time.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 mt-4">
              <button
                type="button"
                onClick={generateRoutineFromAI}
                disabled={routineLoading}
                className="w-full rounded-2xl bg-slate-900 text-white px-4 py-3 font-black text-sm disabled:opacity-60"
              >
                {routineLoading ? 'Generating...' : 'Regenerate Routine Using AI'}
              </button>
              <button
                type="button"
                onClick={() => openRoutineModal()}
                className="w-full rounded-2xl bg-emerald-500 text-white px-4 py-3 font-black text-sm flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-plus" />
                Add Manual Routine
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {['All', 'Exercise', 'Supplement', 'Custom'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setRoutineFilter(type)}
                className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wide ${routineFilter === type ? 'bg-red-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
              >
                {type}
              </button>
            ))}
          </div>

          {routineError && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl p-3 text-sm font-semibold">
              {routineError}
            </div>
          )}

          <div className="space-y-3">
            {routineCards.length === 0 && (
              <div className="bg-white rounded-3xl p-6 shadow text-center">
                <p className="font-semibold text-slate-500">Opening this tab auto-generates a daily routine if one is not already saved.</p>
              </div>
            )}

            {routineCards.map((routine) => {
              const colors = getRoutineColors(routine.type);
              return (
                <article
                  key={routine.id}
                  className={`rounded-3xl border p-4 shadow-sm transition ${colors.card}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-black text-slate-900">{routine.name}</h3>
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide ${colors.badge}`}>
                          {routine.type}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-700 mt-2">{routine.startTime} - {routine.endTime}</p>
                      <p className="text-sm text-slate-600 font-medium mt-2">{routine.description || 'No description added.'}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openRoutineModal(routine)}
                        className="w-10 h-10 rounded-2xl bg-white text-slate-500 border border-slate-200"
                      >
                        <i className="fa-solid fa-pen" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteRoutine(routine.id)}
                        className="w-10 h-10 rounded-2xl bg-white text-red-500 border border-red-100"
                      >
                        <i className="fa-solid fa-trash-can" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {routineSaving && (
            <p className="text-xs font-semibold text-slate-500">Saving routines...</p>
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
                  onChange={(e) => void updateProfile({ ...profile, emergencyDoctor: { raw: e.target.value } })}
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
                          <p className="text-[11px] text-slate-500">{record.fileName} · {record.fileType || 'unknown'} · {formatBytes(record.size)} · {new Date(record.uploadedAt).toLocaleString()}</p>
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
                        <button type="button" onClick={() => void removeHistoryRecord(record)} className="text-slate-400 hover:text-red-500">
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

      {tab === 'emergency' && (
        <section className="p-6 space-y-4">
          <div className="bg-black/95 text-white rounded-3xl p-6 space-y-4">
            <div className="text-center">
              <h2 className="text-2xl font-black tracking-tight">SOS</h2>
              <p className="text-xs text-white/60 uppercase tracking-widest font-bold mt-1">Immediate help and critical details</p>
            </div>
            <a href="tel:112" className="block w-full text-center bg-white text-red-600 rounded-3xl py-8 font-black text-5xl">112</a>
            <div className="grid grid-cols-2 gap-3">
              {CONTACTS.slice(1).map((c) => (
                <a key={c.num} href={`tel:${c.num}`} className="bg-white/10 border border-white/20 rounded-2xl p-4 text-center">
                  <p className="text-xs text-white/60 font-black uppercase tracking-widest">{c.name}</p>
                  <p className="text-2xl font-black">{c.num}</p>
                </a>
              ))}
            </div>
            {(profile.patient.bloodGroup || profile.patient.allergies.length > 0) && (
              <div className="bg-white/10 border border-white/20 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-widest text-white/60 font-black mb-2">Medical ID</p>
                <p><span className="font-bold">Blood Group:</span> {profile.patient.bloodGroup || 'Unknown'}</p>
                <p><span className="font-bold">Allergies:</span> {profile.patient.allergies.join(', ') || 'None recorded'}</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-5 shadow space-y-3">
            <div>
              <h3 className="text-xs uppercase tracking-widest font-black text-slate-400">Locator</h3>
              <p className="text-sm text-slate-500 font-semibold mt-1">Find nearby emergency services quickly.</p>
            </div>
            <button onClick={() => findNearby('hospital')} className="w-full p-4 bg-slate-50 rounded-2xl text-left font-bold">Hospitals</button>
            <button onClick={() => findNearby('police station')} className="w-full p-4 bg-slate-50 rounded-2xl text-left font-bold">Police</button>
            <button onClick={() => findNearby('fire station')} className="w-full p-4 bg-slate-50 rounded-2xl text-left font-bold">Fire Brigade</button>
            <button onClick={() => findNearby('pharmacy')} className="w-full p-4 bg-slate-50 rounded-2xl text-left font-bold">Pharmacies</button>
          </div>

          <div className="bg-white rounded-3xl p-5 shadow space-y-3">
            <h3 className="text-xs uppercase tracking-widest font-black text-slate-400">SOS Circle</h3>
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
              <button className="w-full bg-slate-900 text-white p-3 rounded-2xl font-bold">Add to SOS Circle</button>
            </form>
          </div>
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
                {filteredFirstAid.map((item) => (
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
                {DISASTER_DATA.map((item) => (
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

      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 z-40">
        <div className="max-w-md mx-auto flex justify-around py-3">
          {[
            { id: 'home', icon: 'fa-house-chimney-crack', label: 'Home' },
            { id: 'analysis', icon: 'fa-chart-line', label: 'Analysis' },
            { id: 'routines', icon: 'fa-list-check', label: 'Routines' },
            { id: 'medical', icon: 'fa-notes-medical', label: 'Medical' },
            { id: 'wiki', icon: 'fa-briefcase-medical', label: 'Wiki' },
            { id: 'emergency', icon: 'fa-triangle-exclamation', label: 'Emergency' }
          ].map((item) => (
            <button key={item.id} onClick={() => setTab(item.id)} className={`flex flex-col items-center gap-1 ${tab === item.id ? 'text-red-600' : 'text-slate-400'}`}>
              <i className={`fa-solid ${item.icon}`} />
              <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {routineModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-[2rem] p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-red-500">{routineDraft.id ? 'Edit Routine' : 'Add Manual Routine'}</p>
                <h3 className="text-2xl font-black mt-1">Routine Details</h3>
              </div>
              <button type="button" onClick={closeRoutineModal} className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-500">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <form onSubmit={(e) => void saveRoutineDraft(e)} className="space-y-3">
              <input
                value={routineDraft.name}
                onChange={(e) => setRoutineDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Routine Name"
                className="w-full bg-slate-50 p-3 rounded-2xl font-semibold"
              />
              <select
                value={routineDraft.type}
                onChange={(e) => setRoutineDraft((prev) => ({ ...prev, type: e.target.value }))}
                className="w-full bg-slate-50 p-3 rounded-2xl font-semibold"
              >
                {ROUTINE_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="time"
                  value={routineDraft.startTime}
                  onChange={(e) => setRoutineDraft((prev) => ({ ...prev, startTime: e.target.value }))}
                  className="w-full bg-slate-50 p-3 rounded-2xl font-semibold"
                />
                <input
                  type="time"
                  value={routineDraft.endTime}
                  onChange={(e) => setRoutineDraft((prev) => ({ ...prev, endTime: e.target.value }))}
                  className="w-full bg-slate-50 p-3 rounded-2xl font-semibold"
                />
              </div>
              <textarea
                value={routineDraft.description}
                onChange={(e) => setRoutineDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Description"
                className="w-full bg-slate-50 p-3 rounded-2xl font-semibold min-h-24"
              />
              <button className="w-full bg-slate-900 text-white p-3 rounded-2xl font-bold">
                {routineDraft.id ? 'Save Changes' : 'Save Routine'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
