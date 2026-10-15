const https = require("https");

const VAPID_KEY = "BJ6SumXMQhuQWlsfCFeRlfR-lbYsl1R8Z1W6P2cf_ZP7bL0hXux5pXR4xvOSZ-iBCDWn8GPN5BwSjoco-ixpiWA";
const PROJECT_ID = "registro-de-apuestas-amz";

const SERVICE_ACCOUNT = {
  "type": "service_account",
  "project_id": "registro-de-apuestas-amz",
  "private_key_id": "e10a0d9701abd0a44ef7ec5a6d334eb1315031f0",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCn2AroIBos72gt\nQiusHnS5m7oI9PJvZQb5y+tj9kPsDMiC1K9ReX2nUo2Ve02Dlj+04YyND81dBtpL\nMNTlEVytwvFuzQhyY5LnvFYVPYIVS0Yym9qSc3tQ6Y0LOZCr+k8y5bMbsz2pxGRY\nUlf6Gi91Aeio0dnR419wty2lz44Fe9NUSKESb0r7823KGzbKb9Q1snrNXxoUjcTG\nKCPVRzvtHQgNotMfGsD+nBsZEXWprAxLwdnn9S4xavpee76LKnV2epz2g+8SK8l5\nf1iHRZUm8CbJhsZpfmz0vcYX1VR0+tMTKVMwPDnwSnkSPV/wZVCAF0g/yj/oa2+i\n3h6Tw35vAgMBAAECggEADMjoC8ZmOAYEaW4g5XtsaLbz9LqzvMh1P5HI3FRl2BUh\nMNYChLI8YAJpxnkd7mgDckO78QLDIdLjzdZqYQhxhsrSmR4FBrGO/xfZdsS4o+aX\n8kLs4zroqcEgfTplSrRGVBorCnEcwVG0UwXyrZpRAxiiIDnb3aD0JCHP2FF2//PP\nDJBPR9awM5eIe4T457u6/I68rxC/syrz6Y0U2nKL5FIUqp/tdNJNSfW+Rr975SR6\nRuVTR6SoK5Uflh78Dx20P3wc/HynM9gBX7EeBVn6UCQWNc8RdDrq7fP1CkH5263p\n3m8qkEkCcuR1Vr5aM+LubDbufpdvdJ3gUQi6tRWMAQKBgQDWMVdYUfo8dsKPMxUW\n7kMmhpTybCnUxYU+hzwN3KrTBE+Dwn0f95YvBnRnBghbyEy1m7wCgD4bx3oCHKyZ\nWNgLIuLC1vt345ILGbB2JLcPuoBoPCSG8vTnhxgmiLBG/8n1NvZHeeMAC5HCcNwt\nLlS2SDGwZvokj3k6jDwmnZBl0wKBgQDImsUwif9PolUsYdI0irS+fWLNal2KB+xD\njaP2Z9I9Ee6yaUVJEI5O4QZ15TOh2SXuuD+TdUG/h55YgD3Nf8UdV61dyOKIYyds\nv64uXGcnXb/UMttPtEMADOIwD5r+zwx6w/Dxe+is+bNeQtTXkPsmkeDw/+S4RJH0\nUuMB64UXdQKBgQCXQJqEZMdHQTncs17WJYRHxUuS8OyNMroH0KmIxGXgwy9/RKzl\nEQn9xRoX0ju+zG/W4tVeEr9JEJDIwwTi+Mj+/DCTFArZu1ra+dYRZ5XZxoJ8mNPW\nc+SbRlu4glewm1o7DgfVq22wD3trihUA1rG9Ure78Mv9W09pF7Q2NJfOPwKBgQCc\nIEikNGKuWcssVZ3CIsn1D6Ub9lKCoRPyp4QavEbWHOTHmkLAUNBQ97WNgCslJdnt\n5xwj6biYFjbY7kYrb+u7oIdfXH9iYrlGXBB2KJhn/QDVaBdj+wnCOkS33w1kj0RJ\nL8KQTz2Rkm1VSXJZq46sQBDvwFkESOnHW9MtpV3aGQKBgGsSLuMnVogidbGU1Juy\nPI6We7GDjYsmXQjP8fAbt8JkeL6yB2eddWYLl29+rC0T7fcoLSILgK7yh4pjR3bx\n27XqMNv+x0dAoBIkNFXsFfCrmm9PN7uNXjYOSkUsmyZTIJJMlh5thxysJoYWnuDS\nk8DpIesIlfaMy4q/IK3nBNtU\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@registro-de-apuestas-amz.iam.gserviceaccount.com",
  "client_id": "103158743715137746903",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
};

// Generate JWT for Google OAuth
function base64url(str) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getAccessToken() {
  const { createSign } = require("crypto");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: SERVICE_ACCOUNT.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }));
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(SERVICE_ACCOUNT.private_key, "base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${header}.${payload}.${sig}`;

  return new Promise((resolve, reject) => {
    const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
    const req = https.request({
      hostname: "oauth2.googleapis.com",
      path: "/token",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": body.length }
    }, res => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => {
        try { resolve(JSON.parse(data).access_token); }
        catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sendFCM(token, title, body, accessToken) {
  const message = JSON.stringify({
    message: {
      token,
      notification: { title, body },
      webpush: {
        notification: { title, body, icon: "/icon-192.png", badge: "/icon-192.png" },
        fcm_options: { link: "/" }
      }
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "fcm.googleapis.com",
      path: `/v1/projects/${PROJECT_ID}/messages:send`,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(message)
      }
    }, res => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    req.on("error", reject);
    req.write(message);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { tokens, title, body } = JSON.parse(event.body);
    if (!tokens || !tokens.length) return { statusCode: 400, headers, body: JSON.stringify({ error: "No tokens" }) };

    const accessToken = await getAccessToken();
    const results = await Promise.allSettled(tokens.map(t => sendFCM(t, title, body, accessToken)));
    const sent = results.filter(r => r.status === "fulfilled").length;

    return { statusCode: 200, headers, body: JSON.stringify({ sent, total: tokens.length }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
