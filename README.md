# 🏦 Abhishek Bank — Personal Finance Tracker

A full-stack personal finance application built with **Google Apps Script** (backend) and **standalone HTML/JS frontend** with support for **multi-user**, **bank linking**, **recurring expenses**, and **budget alerts**.

---

## 📋 Features

### Core Features
- ✅ **Dashboard** — Real-time balance, savings rate, category breakdown, insights
- ✅ **Expense Tracking** — Manual entry + SMS auto-detection from bank SMS
- ✅ **Income Management** — Track payday and refunds
- ✅ **UPI Payments** — Send/receive with QR code scanning and generation
- ✅ **Analytics** — 6-month trend chart, daily heatmap, category breakdown

### New Features (v2.0)
- 🆕 **Multi-User Support** — Team members, context switching, shared data
- 🆕 **Bank Account Linking** — Manual add + Plaid/Finbox integration stubs
- 🆕 **Recurring Expenses** — Auto-submit daily/weekly/monthly/quarterly/yearly
- 🆕 **Budget Alerts** — Set per-category limits, get warnings at 80%/100%

---

## 🚀 Deployment Guide

### Phase 1: Google Apps Script Setup

1. **Create a new Apps Script project:**
   - Go to [script.google.com/home](https://script.google.com/home)
   - Click **New project**

2. **Copy backend code:**
   - Replace the default code with contents from `Code.gs` (in this repo)
   - The file will automatically create 5 spreadsheet sheets:
     - `Daily Expenses` — Expense transactions
     - `Income` — Income transactions
     - `Bank Accounts` — Linked bank account metadata
     - `Recurring Expenses` — Recurring payment schedules
     - `Budgets` — Budget limits and alerts
     - `Team` — Multi-user team members

3. **Add HTML file:**
   - Click **Files** (⊕) → **HTML file**
   - Name it: `form`
   - Paste contents from `standalone.html` (in this repo)

4. **Deploy as Web App:**
   - Click **Deploy** → **New deployment**
   - **Type:** Web app
   - **Execute as:** Your email (or service account)
   - **Who has access:** Anyone
   - Click **Deploy**
   - ⚠️ **Copy the deployed URL** — you'll need this next

5. **Configure frontend:**
   - Open `standalone.html` (locally or in your editor)
   - Find line ~345: `var GAS_WEBAPP_URL = 'PASTE_YOUR_DEPLOYED_WEB_APP_URL_HERE';`
   - Replace with your deployed URL from step 4
   - Save file

---

### Phase 2: Frontend Hosting

Choose **one** of these options:

#### Option A: GitHub Pages (Simplest)
1. In your repo, go to **Settings** → **Pages**
2. **Source:** Deploy from branch
3. **Branch:** `main` / **Folder:** `/ (root)`
4. Create a folder `/docs` in your repo
5. Move `standalone.html` to `/docs/index.html`
6. Push changes
7. Your site will be live at: `https://abhisheklathiya6636-lang.github.io/abhishek-bank/`

#### Option B: Vercel (Recommended)
1. Go to [vercel.com](https://vercel.com)
2. Click **New Project** → **Import Git Repository**
3. Select `abhishek-bank` repo
4. Configure:
   - **Framework Preset:** Other
   - **Root Directory:** `.` (root)
5. Deploy
6. Your site will be live at: `https://abhishek-bank.vercel.app` (or custom domain)

#### Option C: Netlify
1. Go to [netlify.com](https://netlify.com)
2. Click **Add new site** → **Import an existing project**
3. Connect to GitHub, select `abhishek-bank`
4. Configure:
   - **Build command:** (leave blank)
   - **Publish directory:** `.` (root)
5. Deploy
6. Your site will be live at: `https://abhishek-bank.netlify.app`

#### Option D: Your Own Domain (Firebase Hosting)
1. Install Firebase CLI: `npm install -g firebase-tools`
2. In your repo: `firebase init hosting`
3. Set public directory to `.` (root)
4. Build & deploy: `firebase deploy`

---

## 🔐 Security Notes

- **No credentials stored:** This app never stores bank passwords or API keys in the visible code
- **UPI is manual:** Users confirm every payment in their actual UPI app (GPay/PhonePe/Paytm)
- **Multi-user scope:** Each user's data is isolated via their email (getCurrentUser_)
- **Bank linking placeholder:** Ready for OAuth integration with Plaid/Finbox — currently manual only

---

## 📱 Usage Guide

### Adding Expenses
1. **Manual:** Go to **Add Expense** tab → Fill form
2. **SMS Auto-Detect:** Go to **Add Expense** → Click "Start Clipboard Watching" → Paste bank SMS → Auto-fills form → Confirm in popup

### Managing Income
1. Go to **Add Money** tab
2. Enter source (Salary, Bonus, Refund, etc.), amount, and date
3. Click **Add to Balance**
4. Balance updates immediately

### UPI Payments
1. Go to **Pay (UPI)** tab
2. **Send:** Enter payee UPI ID or scan QR → Choose app (GPay/PhonePe/etc) → App opens → Confirm payment → Log it back
3. **Receive:** Save your UPI ID → Generate QR/link → Send to payer → Log received payment as income

### Recurring Expenses
1. Go to **Settings** → **Recurring** (coming in frontend update)
2. Create recurring: Category, amount, frequency (daily/weekly/monthly/quarterly/yearly)
3. Auto-submits on schedule with `[AUTO]` tag

### Budget Alerts
1. Go to **Settings** → **Budgets** (coming in frontend update)
2. Set limit per category (Dinner, Transport, etc.)
3. Get warning alerts at 80% and 100% usage

### Multi-User
1. Go to **Settings** → **Team** (coming in frontend update)
2. Add team members by email
3. Switch user context to see their data
4. Each user's transactions are isolated

---

## 🛠️ API Reference

### Expense & Income
```javascript
submitExpense(date, category, description, amount, paymentMode)
addIncome(date, source, description, amount, account)
deleteTransaction(type, dateStr, amount, description)
getDashboardData(targetMonthYear)
```

### Bank Accounts
```javascript
saveBankAccount(bankName, accountType, last4, openingBalance)
getBankAccounts()
deleteBankAccount(accountId)
linkBankAccount(provider, authCode) // 'plaid' | 'finbox'
```

### Recurring Expenses
```javascript
createRecurringExpense(category, description, amount, frequency, startDate, endDate)
getRecurringExpenses()
updateRecurringExpense(recurId, category, description, amount, frequency)
deleteRecurringExpense(recurId)
processRecurringExpenses() // Call via time-based trigger
```

### Budget Alerts
```javascript
setBudget(category, limitAmount, period, alertThreshold)
getBudgets()
deleteBudget(budgetId)
checkBudgetStatus() // Returns array of alerts
```

### Multi-User
```javascript
getCurrentUser()
addTeamMember(email, nickname)
getTeamMembers()
removeTeamMember(email)
switchUser(email)
```

### UPI
```javascript
getUpiSettings()
saveUpiSettings(vpa, name)
logUpiSent(date, payeeVpa, payeeName, amount, note, category)
logUpiReceived(date, payerName, amount, note)
```

---

## ⚙️ Time-Based Triggers (Optional)

To auto-process recurring expenses daily, set up a time-based trigger in Google Apps Script:

1. In your Apps Script editor, click **Triggers** (⏰)
2. Click **Create new trigger**
3. Configure:
   - **Function:** `processRecurringExpenses`
   - **Deployment:** Head deployment
   - **Event source:** Time-driven
   - **Type:** Day timer
   - **Time of day:** Between 10 AM and 11 AM (or your preference)
4. Click **Create**

Now recurring expenses will auto-submit daily if due.

---

## 🎨 Customization

### Expense Categories
Edit `EXPENSE_CATS` array in `standalone.html`:
```javascript
var EXPENSE_CATS = [
  {val:'Dinner',emoji:'🍽'}, {val:'Groceries',emoji:'🛒'}, 
  // Add more...
];
```

### Color Scheme
CSS variables in `standalone.html` (lines ~15-25):
```css
--purple: #7c3aed;
--teal: #00e5b0;
--red: #ff5b7a;
/* etc */
```

### SMS Merchant Matching
Edit `CAT_RULES` in `Code.gs` to add more merchant keywords for auto-categorization.

---

## 📊 Data Structure

### Daily Expenses Sheet
| Date | Category | Description | Amount | Payment Mode |
|------|----------|-------------|--------|--------------|
| 2024-07-14 | Dinner | Swiggy | 450.00 | Online |

### Income Sheet
| Date | Source | Description | Amount | Account |
|------|--------|-------------|--------|---------|
| 2024-07-14 | Salary | Monthly | 50000.00 | Bank |

### Bank Accounts Sheet
| User | AccountId | BankName | AccountType | Last4 | OpeningBalance | LinkedDate | Provider |
|------|-----------|----------|-------------|-------|-----------------|------------|----------|
| user@gmail.com | ACC_xxx | HDFC | Savings | 1234 | 10000 | 2024-07-14 | manual |

### Recurring Expenses Sheet
| User | RecurId | Category | Description | Amount | Frequency | StartDate | NextDue | LastProcessed |
|------|---------|----------|-------------|--------|-----------|-----------|---------|---------------|
| user@gmail.com | REC_xxx | Bills | Internet Bill | 500 | monthly | 2024-07-01 | 2024-08-01 | - |

### Budgets Sheet
| User | BudgetId | Category | LimitAmount | Period | AlertThreshold |
|------|----------|----------|-------------|--------|-----------------|
| user@gmail.com | BUD_xxx | Dinner | 5000 | monthly | 80 |

---

## 🐛 Troubleshooting

### "GAS_WEBAPP_URL not set"
- Copy your deployed Apps Script URL from the deployment confirmation
- Paste it into `standalone.html` line ~345
- Refresh the browser

### SMS auto-detect not working
- Ensure clipboard access is granted (browser permissions)
- Try pasting manually instead of using clipboard watch
- Check SMS format matches expected patterns (amount, merchant, date)

### QR code scanner fails
- Check browser camera permissions
- Ensure HTTPS (required for camera access)
- Try "Upload QR Image" instead of camera scan

### Budget alerts not showing
- Ensure you've added expenses in that category
- Check budget threshold (default 80%)
- Refresh dashboard

### Recurring expenses not auto-processing
- Set up a time-based trigger in Apps Script (see ⚙️ section above)
- Or manually call `processRecurringExpenses()` from Apps Script editor

---

## 📝 Future Enhancements

- [ ] Plaid integration for real bank account linking
- [ ] Finbox integration for GST/bill OCR
- [ ] Email alerts for budget overages
- [ ] Export to PDF/CSV
- [ ] Savings goals tracking
- [ ] Investment portfolio integration
- [ ] Shared family budget management
- [ ] Mobile app (React Native/Flutter)

---

## 📄 License

MIT License — Feel free to fork, modify, and use for personal or commercial projects.

---

## 💬 Support

For issues or feature requests:
1. Check the troubleshooting section above
2. Review the API reference
3. Check your Apps Script logs for errors
4. Open an issue on GitHub

---

**Made with ❤️ by Abhishek** | [GitHub](https://github.com/abhisheklathiya6636-lang)
