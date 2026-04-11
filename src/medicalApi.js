const EMPTY = {
  schemaVersion: 2,
  source: 'rescuenow-medical-id',
  updatedAt: '',
  patient: { bloodGroup: '', allergies: [], conditions: [] },
  emergencyDoctor: { raw: '' },
  medications: []
};

const normalizeTextList = (value) => String(value || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

export const migrateMedicalProfile = (raw) => {
  if (!raw || typeof raw !== 'object') return { ...EMPTY };

  if (raw.schemaVersion === 2 && raw.patient && Array.isArray(raw.medications)) {
    return {
      schemaVersion: 2,
      source: raw.source || EMPTY.source,
      updatedAt: raw.updatedAt || '',
      patient: {
        bloodGroup: raw.patient.bloodGroup || '',
        allergies: Array.isArray(raw.patient.allergies) ? raw.patient.allergies : normalizeTextList(raw.patient.allergies),
        conditions: Array.isArray(raw.patient.conditions) ? raw.patient.conditions : normalizeTextList(raw.patient.conditions)
      },
      emergencyDoctor: { raw: raw.emergencyDoctor?.raw || '' },
      medications: raw.medications
        .map(m => ({ name: String(m.name || '').trim(), timing: String(m.timing || '').trim() }))
        .filter(m => m.name && m.timing)
    };
  }

  return {
    schemaVersion: 2,
    source: EMPTY.source,
    updatedAt: raw.updatedAt || '',
    patient: {
      bloodGroup: raw.bloodGroup || '',
      allergies: normalizeTextList(raw.allergies),
      conditions: normalizeTextList(raw.conditions)
    },
    emergencyDoctor: { raw: String(raw.doctorName || '').trim() },
    medications: (Array.isArray(raw.medicines) ? raw.medicines : [])
      .map(m => ({ name: String(m.name || '').trim(), timing: String(m.timing || '').trim() }))
      .filter(m => m.name && m.timing)
  };
};

export const buildMedicalPayloadForChatGPT = (medicalProfile) => ({
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
});

export async function getMedicalProfile() {
  try {
    const response = await fetch('/api/medical-profile');
    if (!response.ok) return { ...EMPTY };
    return migrateMedicalProfile(await response.json());
  } catch {
    return { ...EMPTY };
  }
}

export async function putMedicalProfile(profile) {
  const payload = { ...profile, updatedAt: new Date().toISOString() };
  await fetch('/api/medical-profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return payload;
}
