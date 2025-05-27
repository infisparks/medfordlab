import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";


const firebaseConfig = {
  apiKey: "AIzaSyDGxQEkTcPww6PjrJLUqemLVAiade4AJpU",
  authDomain: "labmedford.firebaseapp.com",
  databaseURL: "https://labmedford-default-rtdb.firebaseio.com",
  projectId: "labmedford",
  storageBucket: "labmedford.firebasestorage.app",
  messagingSenderId: "787673985451",
  appId: "1:787673985451:web:ac407eb19cfbe3e54022ee",
  measurementId: "G-B5WWS1F1CR"
};


// const firebaseConfig = {
//   apiKey: "AIzaSyBSxxT5S_0VGjZ4O0Ykob3RKJLoXRdTyek",
//   authDomain: "hospital-63094.firebaseapp.com",
//   databaseURL: "https://hospital-63094-default-rtdb.firebaseio.com",
//   projectId: "hospital-63094",
//   storageBucket: "hospital-63094.firebasestorage.app",
//   messagingSenderId: "216178061485",
//   appId: "1:216178061485:web:22f1d823989bbcbb291624",
//   measurementId: "G-FLM0D0R6KN"
// };


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);

// New Medford Family Firebase configuration
const firebaseConfigMedfordFamily = {
  apiKey: "AIzaSyAq6iz-1HFHk6EKxHkdt8c_2suJ91jJ5N8",
  authDomain: "hospital-uid-medfordfamily.firebaseapp.com",
  databaseURL: "https://hospital-uid-medfordfamily-default-rtdb.firebaseio.com",
  projectId: "hospital-uid-medfordfamily",
  storageBucket: "hospital-uid-medfordfamily.firebasestorage.app",
  messagingSenderId: "912435094498",
  appId: "1:912435094498:web:6f6afbdb4608b77ebf0fbb",
  measurementId: "G-V6B2N49YZ8"
};

// Initialize new Firebase app with a different name ("medfordFamily")
const medfordFamilyApp = initializeApp(firebaseConfigMedfordFamily, "medfordFamily");
export const medfordFamilyAuth = getAuth(medfordFamilyApp);
export const medfordFamilyDatabase = getDatabase(medfordFamilyApp);
