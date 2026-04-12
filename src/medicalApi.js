const EMPTY = {
  schemaVersion: 2,
  source: 'rescuenow-medical-id',
  updatedAt: '',
  patient: { bloodGroup: '', allergies: [], conditions: [] },
  emergencyDoctor: { raw: '' },
  medications: [],
  historyRecords: []
};

const normalizeTextList = (value) => String(value || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

const normalizeTagList = (value) => {
  if (Array.isArray(value)) {
    return value.map(v => String(v || '').trim().toLowerCase()).filter(Boolean);
  }
  return normalizeTextList(value).map(v => v.toLowerCase());
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeHistoryRecords = (records) => {
  if (!Array.isArray(records)) return [];

  return records
    .map((item) => {
      const id = String(item?.id || '').trim();
      const fileName = String(item?.fileName || '').trim();
      const filePath = String(item?.filePath || '').trim();
      const dataUrl = String(item?.dataUrl || '').trim();
      if (!id || !fileName || (!filePath && !dataUrl)) return null;

      const typeFromName = fileName.includes('.')
        ? `.${fileName.split('.').pop().toLowerCase()}`
        : '.bin';

      return {
        id,
        title: String(item?.title || '').trim(),
        fileName,
        fileType: String(item?.fileType || typeFromName).trim().toLowerCase(),
        filePath,
        mimeType: String(item?.mimeType || 'application/octet-stream').trim(),
        size: Number(item?.size || 0),
        tags: normalizeTagList(item?.tags),
        notes: String(item?.notes || '').trim(),
        uploadedAt: String(item?.uploadedAt || '').trim(),
        dataUrl
      };
    })
    .filter(Boolean);
};

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
        .filter(m => m.name && m.timing),
      historyRecords: normalizeHistoryRecords(raw.historyRecords)
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
      .filter(m => m.name && m.timing),
    historyRecords: []
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
    const response = await fetchWithTimeout('/api/medical-profile');
    if (!response.ok) return { ...EMPTY };
    return migrateMedicalProfile(await response.json());
  } catch {
    return { ...EMPTY };
  }
}

export async function putMedicalProfile(profile) {
  const payload = { ...profile, updatedAt: new Date().toISOString() };
  await fetchWithTimeout('/api/medical-profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return payload;
}

export async function getContacts() {
  try {
    const response = await fetchWithTimeout('/api/contacts');
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

export async function putContacts(contacts) {
  await fetchWithTimeout('/api/contacts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contacts)
  });
  return contacts;
}

export async function createHistoryRecord(payload) {
  const response = await fetchWithTimeout('/api/history-records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unable to save history record.' }));
    throw new Error(err.error || 'Unable to save history record.');
  }

  return await response.json();
}

export async function deleteHistoryRecordFile(filePath) {
  if (!filePath) return;
  await fetchWithTimeout('/api/history-file', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath })
  });
}
