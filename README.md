# ShopInHand — Online Stationery Store

Poora Bazaar, In Your Hand.

Yeh ek pura chalta-fitra (fully working) e-commerce website hai:
- Home page, product listing, product detail page
- Cart, checkout, Razorpay online payment + Cash on Delivery
- Order confirmation aur "My Orders" tracking (mobile number se)
- Admin Panel — products add/edit/delete, orders dekhna & status update
  karna — **koi coding knowledge ki zarurat nahi future updates ke liye**

Tech: plain HTML/CSS/JavaScript (koi build step nahi) + Firebase
(database + login + file storage, free plan) + Vercel (hosting +
order-processing functions, free plan — koi Firebase paid plan ya
card kahin nahi chahiye) + Razorpay (payments). Isliye koi bhi
developer future mein isko aasani se samajh kar edit kar sakta hai,
aur aap khud bhi products admin panel se manage kar sakte hain.

---

## Ek baar ka setup (Firebase free plan + Vercel — koi card/payment kahin nahi chahiye)

**Architecture:** Firebase sirf database (Firestore), login (Auth), aur
file storage ke liye use hota hai — yeh sab **free Spark plan** mein
hi chalte hain, koi card/Blaze plan **bilkul nahi chahiye**. Order
placement, payment verification, aur sitemap — yeh 3 cheezein **Vercel
ke free serverless functions** (`/api` folder) pe chalti hain — yeh
bhi bina card ke free hai. Poori site (frontend + api dono) ek hi
Vercel project se deploy hoti hai.


### Step 1 — Firebase project banayein
1. https://console.firebase.google.com par jaayein → **Add project** →
   naam dein (e.g. `shopinhand-store`) → Google Analytics skip kar sakte
   hain.
2. Project ke andar **Build → Firestore Database → Create database** →
   **Production mode** → nearest region (e.g. `asia-south1` Mumbai)
   select karein.
3. **Build → Authentication → Get started → Email/Password** provider
   enable karein.
4. **Project settings (⚙️) → General → Your apps → </> (Web)** par
   click karke ek web app register karein. Yahan se aapko config keys
   milenge — inhe copy karke `js/firebase-config.js` file mein paste
   karein (jahan `PASTE_...` likha hai).

### Step 2 — Apna admin login banayein
1. Firebase Console → **Authentication → Users → Add user** → apna
   email aur ek password set karein.
2. `js/firebase-config.js` mein `ADMIN_EMAILS` array mein wahi email
   likhein — yeh sirf login page ke UI ke liye hai (redirect karne ke
   liye), **asli security enforcement iske alag ek step se hoti hai:**
3. **Zaroori — Firestore mein `admins` collection banayein:**
   Firebase Console → **Firestore Database → Data** tab → **Start
   collection** → Collection ID: `admins` → **Document ID: apna poora
   email address (jaisa hai waisa, lowercase mein)** → koi bhi field
   daal dein, jaise `allowed: true` → Save.
   Har admin email ke liye ek alag document banayein. **Isके bina
   admin login toh ho jayega, lekin Products/Inventory/Orders mein
   koi bhi save/edit "permission denied" error dega** — yeh jaan-boojh
   kar hai (security ke liye, neeche "Security notes" dekhein).

### Step 3 — Razorpay account
1. https://dashboard.razorpay.com par account banayein/login karein
   (business KYC complete karein taaki live payments chal sakein; test
   mode turant kaam karta hai).
2. **Settings → API Keys → Generate Key** → **Key Id** copy karke
   `js/firebase-config.js` mein `RAZORPAY_KEY_ID` mein paste karein.
3. **Key Secret kabhi bhi website ki files mein paste NAHI karna** —
   yeh sirf Step 4 mein Vercel ke secure environment variable ke through
   jaata hai, kabhi customer ke browser tak nahi pahunchta.

### Step 4 — Firebase service account key banayein (Vercel functions ke liye)
Vercel ke `/api` functions ko Firestore access karne ke liye ek "service
account" key chahiye — yeh free hai, Blaze plan ki zaroorat nahi:
1. Firebase Console → **⚙️ Project Settings → Service Accounts** tab
2. **Generate new private key** → confirm → ek `.json` file download hogi
3. Us file ko kholein, isme se 3 values chahiye honge (agle step mein use honge):
   - `project_id`
   - `client_email`
   - `private_key`

**Yeh file kahin bhi commit/upload nahi karni** — sirf Vercel ke
environment variables mein daalni hai (agla step), aur phir apne
computer se delete kar dein.

### Step 5 — Vercel par deploy karein (yahi site + order-processing dono hosts karta hai)
1. [vercel.com](https://vercel.com) → GitHub/Google se sign in → **Add
   New Project** → apna `shopinhand` folder (repo) select karein
2. **Root Directory** ko `shopinhand` set karein (agar bade repo ke
   andar hai) — Framework Preset **"Other"** rakhein, build command
   khaali chhodein
3. Deploy karne se pehle **Environment Variables** add karein (Vercel
   project → Settings → Environment Variables):

| Key | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | Step 4 wali `project_id` |
| `FIREBASE_CLIENT_EMAIL` | Step 4 wali `client_email` |
| `FIREBASE_PRIVATE_KEY` | Step 4 wali `private_key` (poori string, `-----BEGIN...` samet, jaisi hai waisi paste karein) |
| `RAZORPAY_KEY_ID` | Step 3 wala Key ID |
| `RAZORPAY_KEY_SECRET` | Step 3 wala Key Secret |
| `SITE_DOMAIN` | Deploy hone ke baad jo Vercel URL milega (e.g. `https://shopinhand.vercel.app`) — sitemap ke liye |

4. **Deploy** dabayein. Vercel khud `/api` folder ko serverless
   functions ki tarah detect kar lega aur baaki sab static site ki
   tarah serve karega — ek hi domain se dono kaam karenge, isliye
   koi extra CORS setup nahi chahiye.
5. Deploy hone ke baad, Firebase Console → **Authentication → Settings
   → Authorized domains → Add domain** → jo Vercel URL mila, wahi
   yahan daal dein — warna admin login fail hoga (`auth/unauthorized-domain`).

**Yeh 3 endpoints Vercel par chalte hain:**
- `/api/create-razorpay-order` — online payment se pehle real price se
  ek Razorpay order banata hai (taaki checkout amount tamper na ho sake)
- `/api/place-order` — **har order isی se create hota hai** — real
  price, real stock, aur (online payment ho toh) genuine Razorpay
  signature verify karta hai, phir hi order save hota hai aur stock
  kam hota hai
- `/api/sitemap` (`/sitemap.xml` par redirect) — Google ke liye live
  product sitemap

### Step 6 — Firebase Storage enable karein (product photo + purchase bill upload ke liye)
Firebase Console → left menu → **Build → Storage** → **Get started** →
production mode → apna region select karein (same region jo Firestore
ke liye select kiya tha) → Done.

Yeh isliye chahiye kyunki ab Admin Panel se seedha:
- **Product photo** upload ho sakti hai (camera se khींचकर ya gallery se)
- **Purchase bill/invoice photo ya PDF** upload ho sakti hai (Inventory
  → Add Purchase mein) — yeh GST checking/audit ke waqt proof ke roop
  mein kaam aati hai

### Step 7 — Firestore + Storage security rules deploy karein
```
npm install -g firebase-tools
firebase login
firebase init   # existing project select karein, Firestore + Storage choose karein (Functions/Hosting NAHI chahiye — woh Vercel par hain)
firebase deploy --only firestore:rules,storage
```

---

## Purchase Bill Upload — proof of purchase (GST checking ke liye)

**Inventory → + Add Purchase** form mein ab ek **"Bill / Invoice Photo
ya PDF"** field hai. Jab supplier se saman khareedte ho, unka diya hua
asli bill (photo khींचकर ya scan/PDF) yahan upload kar do.

- File Firebase Storage mein securely save hoti hai
- Sirf **admin login se hi dekhi ja sakti hai** — customer ya koi aur
  isse kabhi access nahi kar sakta (storage.rules mein admin-only lock hai)
- Inventory ledger mein har purchase entry ke saamne **"📄 View"** link
  aayega — click karte hi asli bill khul jayegi
- Isse **checking/audit ke waqt** turant prove kar sakte ho ki jo bhi
  quantity/rate system mein daali hai, woh asli bill se match karti hai

**Product photo bhi ab seedha upload ho sakti hai** (Products → Add/Edit
Product) — camera se khींचकर ya gallery se choose karke, URL type karne
ki zaroorat nahi (URL field abhi bhi optional fallback ke roop mein hai).

---

## GST (India tax) setup

Yeh site ab **GST-compliant tax invoices** bana sakti hai. Deploy karne
se pehle 2 jagah edit karein:

**1. `js/firebase-config.js` mein `STORE_SETTINGS` ke andar:**
```js
gstin: "07AAAAA0000A1Z5",      // apna real GSTIN daalein
sellerState: "Delhi",           // jis state mein dukaan registered hai
pricesIncludeGST: true          // price already GST-inclusive hai (default)
```

**2. Har product ka GST Rate + HSN Code set karein** (Admin → Products
→ Add/Edit Product mein naye fields hain). Sahi HSN code aur rate
apne CA/accountant se confirm kar lein — galat rate se galat invoice
banega.

### Yeh kaise kaam karta hai
- Selling Price **GST-inclusive** maana jaata hai (jaise MRP) — checkout
  par upar se koi extra tax nahi judta, total wahi rehta hai jo product
  page pe dikhta hai
- Checkout par customer apna **State** select karta hai — usी se decide
  hota hai:
  - **Same state** (jaise dukaan Delhi mein hai, customer bhi Delhi mein)
    → **CGST + SGST** split hota hai
  - **Different state** → **IGST** laगता hai
- Har order ke saath poora GST breakup (`gstBreakup`) save ho jaata hai
- **📄 Tax Invoice** button/link har jagah milega: Order confirmation
  page, My Orders (customer), aur Admin → Orders — click karte hi ek
  professional, printable GST invoice khulti hai (Print/Save as PDF
  button ke saath) jisme Seller GSTIN, HSN, taxable value, CGST/SGST/
  IGST, sab kuch hota hai

### Purchase side
Add Purchase form mein ab **Supplier GSTIN** (optional) field bhi hai —
record ke liye, Input Tax Credit claim karte waqt apne CA ko yeh
details de sakte hain (Supplier GSTIN + Purchase Cost + GST rate se).

### Zaroori disclaimer
Yeh calculation engineering-level sahi hai, lekin **main ek CA/tax
advisor nahi hoon** — GST rates, HSN codes, aur filing requirements
apne accountant se zaroor confirm karwa lein launch se pehle. Composition
scheme, e-invoicing threshold, ya multi-state registration jaisi
cheezein alag hoti hain — agar inme se koi apply hota hai, uske liye
extra changes chahiye ho sakte hain.

---

Yeh saare features already code mein wired hain aur kaam karenge, bas
neeche di 2 jagah apni real values daalni hongi:

**1. `js/firebase-config.js` mein do lines edit karein:**
```js
export const SITE_URL = "https://your-real-domain.com"; // no trailing slash
export const GA_MEASUREMENT_ID = "G-XXXXXXXXXX";
```
- `SITE_URL`: aapka final domain (Vercel se milega, e.g. `https://your-project.vercel.app`, ya apna custom domain). Isse Google/WhatsApp share previews aur sitemap sahi links banayenge.
- `GA_MEASUREMENT_ID`: [analytics.google.com](https://analytics.google.com) → Admin → Create Property → Data Stream (Web) → apna SITE_URL daalein → "Measurement ID" copy karein (shuru hota hai `G-` se). Isko blank/placeholder chhod denge toh analytics simply load hi nahi hoga, kuch tootega nahi.
- Once set, GA4 mein automatically dikhega: pageviews, `view_item`, `add_to_cart`, `begin_checkout`, aur `purchase` (revenue ke saath) — bina kisi extra kaam ke.

**2. Sitemap ka domain bhi set karein:** Vercel project ke Environment
Variables mein `SITE_DOMAIN` wahi value dein jo `SITE_URL` mein di thi
(Step 5 mein already cover kiya). `vercel.json` mein rewrite
(`/sitemap.xml` → `/api/sitemap`) **already configured hai**, kuch
add karne ki zarurat nahi. Yeh Vercel ke free plan mein hi chalta hai,
koi Firebase Blaze/card nahi chahiye.

**Baaki sab already ho chuka hai, kuch aur karne ki zarurat nahi:**
- Har product page ka title/description/Open Graph/JSON-LD (Google rich results ke liye price+stock dikhayega) apne aap set ho jata hai.
- Product page pe ek working **"Share on WhatsApp"** button hai — real product link ke saath.
- `/admin/*`, checkout, my-orders, order-success — yeh sab `noindex` hain taaki Google mein galti se na dikhein.
- **Note:** WhatsApp/Facebook jaise link-preview crawlers JavaScript run nahi karte, isliye product page share hone par unhe generic store branding dikhega (product-specific photo/price nahi) — yeh is architecture (client-rendered, no server-side rendering) ki ek jaani-samjhi limitation hai. Google ke liye yeh dikkat nahi hai kyunki Googlebot JS run karta hai.

---

## Website deploy karna (hosting)

**Primary path: Vercel** (Step 5 upar mein poora likha hai) — isi ek
jagah se static site + `/api` order-processing functions dono deploy
hote hain, isliye woh already-covered hai upar.

**Agar Vercel ke bajaye kahin aur host karna hai** (apna existing
hosting/server, GoDaddy, Hostinger, etc.):
- Static files (saari `.html`, `css/`, `js/`, `assets/`) waha upload
  kar sakte hain — Koi build/compile step nahi chahiye
- **Lekin `/api` folder ke functions (`place-order`, `create-razorpay-order`,
  `sitemap`) sirf Vercel (ya kisi aur serverless platform, jaise Netlify)
  par hi chalenge** — yeh dono jagah alag hosting providers par nahi
  chal sakte, kyunki `fetch('/api/...')` calls same-domain hone chahiye.
  Agar static site kahin aur (jaise Firebase Hosting) rakhna hai,
  `js/store.js` mein `callApi()` function ke path ko apne Vercel
  deployment ke poore URL se replace karna hoga (e.g.
  `https://your-project.vercel.app/api/place-order`), aur us Vercel
  project mein CORS already khula hai (`Access-Control-Allow-Origin: *`
  har `/api` function mein), isliye cross-domain call kaam karega.

### Deploy checklist (pehli baar poora launch karte waqt)
1. Firebase: Firestore + Auth + Storage enable, rules deploy (Steps 1-4, 7)
2. Vercel: environment variables set karke deploy (Step 5)
3. Firebase Console → Authentication → Authorized domains mein Vercel
   ka URL add karein (warna admin login fail hoga)
4. Check karein:
   - `https://your-project.vercel.app` khulna chahiye aur products dikhne chahiye
   - `https://your-project.vercel.app/sitemap.xml` khulne par XML dikhna chahiye
   - `/admin/login.html` se login karke ek test order place karein, check karein stock kam hua aur inventory ledger mein entry bani

---

## Inventory Management — real retail-style purchase & billing system

Yeh site ek proper retail inventory system ki tarah kaam karti hai —
jaisa dukaan waale use karte hain — purchase cost aur selling price
poori tarah alag rakhe jaate hain, aur customer purchase cost kabhi
nahi dekh sakta (na UI mein, na devtools/network tab se — dono jagah
se block hai, security rules ke through).

### Purchase Entry (jab supplier se saman khareedte hain)
**Admin Panel → Inventory → + Add Purchase** mein yeh fields bharni
hoti hain:
- **Product**
- **Quantity**
- **Purchase Cost** (₹/unit)
- **Supplier**
- **Invoice Number**
- **Purchase Date**

Save karte hi:
- Us product ka **stock automatically badh jaata hai**
- **Purchase Cost** ek alag, admin-only collection (`product_costs`)
  mein store hota hai — yeh product ke public document mein kabhi
  nahi jaata, isliye customer ka browser isse kabhi fetch hi nahi kar
  sakta (Firestore security rules level par block hai)
- Weighted-average cost automatically recalculate hota hai agar alag
  rate par pehle bhi khareeda ho

### Product ke fields (Admin Panel → Products)
- **Selling Price** — customer isse pay karega
- **MRP** — struck-through price dikhane ke liye (optional)
- **Discount** — MRP vs Selling Price se automatically calculate ho
  jaata hai, har jagah "X% off" ki tarah dikhta hai
- **Current Stock** — sirf Inventory → Add Purchase/Adjustment se
  badalta hai (accidental galti se bachne ke liye Products page se
  seedha edit nahi hota)
- **Minimum Stock** — yeh threshold set karein; jab stock isse kam ya
  barabar ho jaaye, product Dashboard aur Products page mein "Low
  Stock" ke roop mein highlight ho jaata hai
- **Purchase Cost** — Products page pe sirf **dekhne** ke liye dikhta
  hai (edit nahi hota seedha) — yeh hamesha ek Purchase Entry se hi
  update hota hai, jaisa real accounting mein hona chahiye

### Website (customer-facing) sirf yeh dikhata hai:
Product Image, Naam, Selling Price, MRP, Discount %, aur Stock Status
(In Stock / Out of Stock). **Purchase Cost kabhi nahi.**

### Order place hone par
- Stock automatically kam ho jaata hai (`onOrderCreated` Cloud
  Function se, server-side, tamper-proof)
- **Profit** automatically calculate hota hai:
  `Profit = Selling Price − Purchase Cost` (us waqt ka current
  purchase cost use hota hai) × quantity — yeh bhi sirf admin ko
  dikhta hai, Inventory ledger mein "Profit: ₹X" ke roop mein

### Admin Dashboard par (naya)
- **Total Purchase Value** — ab tak jitna maal khareeda gaya (cost basis)
- **Gross Profit** — sabhi sales ka total profit
- **Current Inventory Value** — abhi stock mein jo maal hai, uski cost value
- **Low Stock Products** — jo bhi product apne Minimum Stock se neeche/barabar hai
- **Best Selling Products** — top 5 products by units sold, unke revenue ke saath

### Security note
`firestore.rules` mein double protection hai:
1. `product_costs` collection sirf logged-in admin hi read/write kar sakta hai
2. `products` collection mein `costPrice` field likhna hi block hai
   (chahe koi bug ya galti se try bhi kare) — isliye purchase cost
   architecturally hi customer-side kabhi expose nahi ho sakta.

**Zaroori:** in naye rules ko deploy karna na bhoolein:
```
firebase deploy --only firestore:rules
```
Profit-calculation logic ab Vercel ke `/api/place-order` function mein
hai (README "Vercel par deploy karein" step dekhein) — agar site pehle
se live hai, Vercel par bhi ek naya deploy trigger kar dein taaki yeh
update live ho jaaye.



## Pehli baar products add karna
1. `yourdomain.com/admin/login.html` kholein → Step 2 wale email/password se login karein.
2. **Products → + Add Product** → naam, category (e.g. "Pens",
   "Notebooks", "Files & Folders", "Art Supplies", "Office Supplies"),
   price, stock, aur image URL dein (koi bhi image-hosting link,
   jaise apni khud ki website ka image ya Google Drive/Imgur ka direct
   image link).
3. Save karte hi product turant live ho jaata hai homepage par.

---

## Future updates — kaun kya kar sakta hai

| Kaam | Kaise |
|---|---|
| Naya product add/edit/delete | Admin Panel → Products (koi coding nahi) |
| Order dekhna / status update (pending → shipped → delivered) | Admin Panel → Orders |
| Store ka naam, phone, WhatsApp, free-delivery limit badalna | `js/firebase-config.js` mein `STORE_SETTINGS` object edit karein |
| Logo badalna | `assets/logo.jpg` replace karein (naam same rakhein) |
| Colors / design badalna | `css/style.css` ke top mein `:root` variables (`--navy`, `--orange`, etc.) |
| Naya page ya feature | Kisi bhi web developer ke liye — plain HTML/JS hai, koi framework/build-tool nahi, isliye samajhna aasan hai |

---

## Scale — 300-500 customers ke liye
Firebase free tier (Spark plan) mein 50,000 reads/day free milte hain
— yeh easily 300-500 orders/month handle kar leta hai bina kisi cost
ke. Jaise-jaise business badhega, Firebase apne aap scale karta hai;
sirf usage-based Blaze plan par switch karna hoga (pay only for what
you use, koi upfront server cost nahi).

## Security Audit — findings aur fixes (July 2026)

**Agar site pehle se live/deployed hai, in fixes ko live karne ke liye
zaroor redeploy karein:**
```
firebase deploy --only firestore:rules,storage
```
aur Vercel par bhi redeploy karein (naya push/redeploy trigger karein
taaki naye `/api` functions live ho jaayein). Bina isके, purane
insecure rules/functions hi live rahenge.

Ek poora security audit kiya gaya — neeche har cheez ka summary hai:
kya mila, kitna serious tha, kya fix kiya.

### 🔴 Critical

**1. Koi bhi signed-in user "admin" ban sakta tha (Broken Access Control)**
Firestore/Storage rules sirf `request.auth != null` check karte the —
matlab "logged in" aur "admin" ko same maan rahe the. Firebase Auth ka
signup kisi bhi visitor ke browser console se ho sakta hai (Email/
Password provider public hai) — isliye koi bhi attacker khud ek account
bana kar products edit/delete kar sakta tha, purchase cost dekh sakta
tha, orders modify/delete kar sakta tha.
**Fix:** ek `/admins` Firestore collection banayi jo sirf Firebase
Console se (kabhi client se nahi) likhi ja sakti hai. Saari rules ab
`isAdmin()` check karti hain — sirf woh email jiska document `/admins`
mein ho, admin actions kar sakta hai. **Aapko ek naya setup step karna
hoga** — README Step 2.3 dekhein.

**2. Price/Amount poori tarah client-trusted tha (Payment/Business Logic Flaw)**
Order ka `amount`, har item ka `price`, aur Razorpay ka payment amount
— sab browser se aa raha tha, bina kisi server check ke. Koi bhi
DevTools se cart/checkout data badal ke ₹1 mein mehenga order place
kar sakta tha, ya fake profit numbers likhwa sakta tha.
**Fix:** poora order-creation flow ab ek naye Cloud Function
(`placeOrder`) se hota hai — yeh khud Firestore se **real price aur
stock** nikalta hai, khud GST calculate karta hai, aur online payment
ke liye Razorpay signature + amount **dono** verify karta hai, sab
kuch ek atomic transaction mein. Browser sirf "kya aur kitna" bata
sakta hai, "kitne mein" kabhi nahi. Client-side direct order-writes
Firestore rules mein block kar diye gaye hain.

**3. Stored XSS — customer checkout fields bina escape ke render ho rahe the**
Naam/Address/City jaisi fields customer khud type karta hai. Agar koi
`<img src=x onerror=...>` jaisa naam daalta, toh yeh raw HTML ban ke
Admin Orders page, Dashboard, Invoice page mein **execute ho jaata** —
isse admin ka session hijack ho sakta tha.
**Fix:** ek `escapeHtml()` utility add kiya aur har jagah customer
data (aur, defense-in-depth ke liye, product data bhi) escape karke
hi render kiya jaata hai ab.

### 🟠 High

**4. Stock-check hi nahi tha order place karte waqt**
Koi bhi qty order kar sakta tha, chahe stock available ho ya na ho —
negative/oversold stock ho sakta tha.
**Fix:** `placeOrder` function ab ek atomic transaction mein stock
verify karta hai — agar kaafi stock nahi hai, order reject ho jaata
hai clear error message ke saath.

**5. Razorpay Checkout client-side amount se khulta tha**
Server order_id create hi nahi hota tha — attacker Checkout khulne se
pehle amount tamper kar sakta tha.
**Fix:** `createRazorpayOrder` function ab server-verified amount se
Razorpay order banata hai, checkout usi order_id se khulta hai.

### 🟡 Medium

**6. "My Orders" sirf phone number se lookup hota hai, koi OTP/verification nahi**
Koi bhi (chahe unka order na ho) kisi ka bhi phone number daal ke
unka order history + address dekh sakta hai, agar number guess/pata ho.
**Abhi fix nahi kiya** (bada feature-add hai — Firebase Phone Auth/OTP
chahiye) — neeche "Remaining recommendations" mein hai.

**7. Order ID link-based access (invoice.html, order-success.html)**
Order ID ek lamba random string hai (practically un-guessable), lekin
agar kabhi link kahin leak ho jaaye (forwarded message, browser history),
uske paas order/PII dekhne ki access rahegi hamesha ke liye — koi
expiry nahi. Chhoti store ke liye accepted tradeoff hai, neeche
recommendation mein hai.

### 🟢 Low / Hardening

**8. Koi security headers nahi the** — `firebase.json` mein
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy` add kiye.

**9. Dead/insecure code hataya** — client-side direct-write `createOrder`
function poori tarah replace kiya; ab sab kuch naye secure functions
se hota hai.

### Not applicable / already fine
- **CSRF** — Firebase token-based auth use karta hai (cookies nahi),
  isliye traditional CSRF yahan apply nahi hota.
- **NoSQL Injection** — Firestore ka query API string-concatenation
  based nahi hai, isliye is class ka injection possible nahi hai.
- **API keys/secrets** — Firebase `apiKey` public hone ke liye hi
  design hua hai (security rules se protect hota hai, key chhupane se
  nahi) — already sahi tha. Razorpay Key Secret pehle se hi client
  code mein kabhi nahi tha — already sahi tha.

### Remaining recommendations (production se pehle sochein)
1. **Firebase App Check enable karein** — bots/scripts se Cloud
   Functions ko directly hit hone se rokta hai (rate-limit/abuse
   protection ke liye).
2. **Customer OTP login** (Phone Auth) — agar order-history privacy
   zyada zaroori ho jaaye, toh phone-number-only lookup ki jagah OTP
   verification add karwayein.
3. Cloud Functions `functions.config()` Firebase dwara deprecated ho
   raha hai future mein — naye projects environment variables/Secret
   Manager use karte hain; abhi ke liye kaam karta hai, but future
   migration ke baare mein dhyan rakhein.
4. Razorpay **webhook** bhi add karwa sakte hain (`functions/index.js`
   mein) taaki agar customer payment ke baad browser band kar de,
   phir bhi payment confirmation mil jaaye.

---

## Important note (privacy)
"My Orders" page customer ke phone number se order lookup karta hai,
bina login ke (taaki customer ko account banane ki zarurat na pade).
Yeh ek jaana-samjha tradeoff hai — upar audit ke point #6 mein detail
hai. Zyada privacy chahiye ho toh customer OTP login add karwaya ja
sakta hai.

---

Koi bhi sawal ho toh is README ke saath developer ko refer kar sakte
hain — har file well-commented hai.
