// src/config/firebase.js
const admin = require('firebase-admin');

let firebaseApp;

function normalizePrivateKey(raw) {
  if (!raw) return raw;
  let key = raw.trim().replace(/^"|"$/g, '');
  key = key.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
  key = key.replace(/\\n/g, '\n');
  if (!key.includes('BEGIN PRIVATE KEY')) {
    return key;
  }
  key = key.replace(/-+BEGIN PRIVATE KEY-+\s*/, '-----BEGIN PRIVATE KEY-----\n');
  key = key.replace(/\s*-+END PRIVATE KEY-+/, '\n-----END PRIVATE KEY-----');

  return key.trim();
}

function initializeFirebase() {
  if (firebaseApp) return firebaseApp;

  let serviceJson = process.env.FIREBASE_ADMIN_SDK_JSON;
  let creds = null;

  if (serviceJson) {
    try {
      serviceJson = serviceJson.trim().replace(/^'|'$/g, '').replace(/^"|"$/g, '');
      creds = JSON.parse(serviceJson);

      if (creds.private_key) {
        creds.private_key = normalizePrivateKey(creds.private_key);
      }
    } catch (e) {
      console.warn('FIREBASE_ADMIN_SDK_JSON parse failed, will try individual env vars:', e.message);
      creds = null;
    }
  }

  if (!creds) {
    const pk = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || '');
    if (!pk) {
      throw new Error('Firebase private key not provided. Set FIREBASE_ADMIN_SDK_JSON or FIREBASE_PRIVATE_KEY.');
    }
    creds = {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: pk,
    };
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: creds.project_id || process.env.FIREBASE_PROJECT_ID,
      clientEmail: creds.client_email || process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: creds.private_key,
    }),
  });

  return firebaseApp;
}

function getAuth() {
  if (!firebaseApp) initializeFirebase();
  return admin.auth();
}

module.exports = {
  initializeFirebase,
  getAuth,
  admin,
};