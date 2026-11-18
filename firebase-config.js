// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD9V6tY8cP-hlvI2Plq0-LEgmT1IYoDuAA",
  authDomain: "amor-6e737.firebaseapp.com",
  projectId: "amor-6e737",
  storageBucket: "amor-6e737.firebasestorage.app",
  messagingSenderId: "821992681390",
  appId: "1:821992681390:web:c7686aa724eb6f51bb223f",
  measurementId: "G-BR0J8X318H"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);