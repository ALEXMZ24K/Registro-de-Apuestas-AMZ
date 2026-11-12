importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyC50jJFVDbRCjxGQsm-ioTt-xlDQU1-YUo",
  authDomain: "registro-de-apuestas-amz.firebaseapp.com",
  projectId: "registro-de-apuestas-amz",
  storageBucket: "registro-de-apuestas-amz.firebasestorage.app",
  messagingSenderId: "472356636148",
  appId: "1:472356636148:web:5b467de76f50b58afee5a1"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200]
  });
});
