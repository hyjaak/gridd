/* global importScripts, firebase */
/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCfk8V0zwPjMKZUkJBjoSCh39AKV9vp50c",
  authDomain: "gridd-3edba.firebaseapp.com",
  projectId: "gridd-3edba",
  storageBucket: "gridd-3edba.firebasestorage.app",
  messagingSenderId: "174687912980",
  appId: "1:174687912980:web:0e0b4bdab61ff2762ed301",
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "GRIDD";
  const options = {
    body: payload.notification?.body || "",
    icon: "/favicon.ico",
    data: payload.data || {},
  };
  return self.registration.showNotification(title, options);
});
