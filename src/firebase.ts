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


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);