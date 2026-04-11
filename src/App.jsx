import { useEffect, useState } from 'react';
import { getMedicalProfile, putMedicalProfile } from './medicalApi';

const EMPTY = {
  schemaVersion: 2,
  source: 'rescuenow-medical-id',
  updatedAt: '',
  patient: { bloodGroup: '', allergies: [], conditions: [] },
  emergencyDoctor: { raw: '' },
  medications: []
};

export default function App() {
  const [tab, setTab] = useState('medical');
  const [profile, setProfile] = useState(EMPTY);
  const [error, setError] = useState('');
  const [medName, setMedName] = useState('');
  const [medTiming, setMedTiming] = useState('');
  const [allergyDraft, setAllergyDraft] = useState('');
  const [conditionDraft, setConditionDraft] = useState('');

  useEffect(() => {
    getMedicalProfile().then(setProfile);
  }, []);

  const parseList = (value) => value
    .split(/,|\n/)
    .map(v => v.trim())
    .filter(Boolean);

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

  return (
    <main className="max-w-md mx-auto min-h-screen pb-24">
      <header className="px-6 pt-8 pb-4">
        <h1 className="text-3xl font-black tracking-tight">RescueNow React</h1>
        <p className="text-slate-500 text-sm font-semibold">Migration started: Medical ID fully React-based</p>
      </header>

      <section className="px-6">
        <div className="flex gap-2 mb-4">
          {['home', 'contacts', 'medical', 'nearby', 'wiki'].map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${tab === id ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              {id}
            </button>
          ))}
        </div>

        {tab !== 'medical' && (
          <div className="bg-white rounded-3xl p-6 shadow text-slate-600 font-semibold">
            This tab will be migrated next. Medical ID is now React + JSON API.
          </div>
        )}

        {tab === 'medical' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6 shadow">
              <h2 className="font-black text-rose-500 text-xs uppercase tracking-[0.2em] mb-4">Vital Info</h2>
              <div className="space-y-3">
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
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow">
              <h2 className="font-black text-rose-500 text-xs uppercase tracking-[0.2em] mb-4">Prescriptions</h2>
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
            </div>

            <div className="bg-white rounded-3xl p-4 shadow">
              {error && <p className="text-xs font-semibold text-red-500 mt-1">{error}</p>}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
