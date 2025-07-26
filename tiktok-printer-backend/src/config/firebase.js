const admin = require('firebase-admin');

let firebaseApp;

function initializeFirebase() {
  if (firebaseApp) return firebaseApp;

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
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
  admin
};